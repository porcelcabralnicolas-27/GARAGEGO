-- GarageGo — documentos de titularidad configurables desde el panel (Configuración → Aprobación y
-- titularidad, fase 4).
-- Requiere 0078/0079 (documentos y lot_missing_documents), 0094 (touch_catalog_item) y 0096
-- (lot_checklist_items con "solo si cambió").
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: IF NOT EXISTS, ON CONFLICT DO NOTHING, DROP IF EXISTS y CREATE OR REPLACE. Re-correr
-- es seguro y no pisa lo que el equipo ya haya configurado.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────────────────
-- Qué documentos se piden para publicar estaba escrito dos veces: en `lot_missing_documents` (0079)
-- y en la app (`documentRequirements`, shared/domain.ts). Ahora vive en `document_requirements` y
-- el equipo lo edita: qué documentos cumplen cada requisito, a quién se le pide (titular,
-- inquilino, administrador), para qué tipo de lugar y si es obligatorio, opcional o no se pide.
--
-- Arranca con las reglas de hoy (mismos códigos), así que al correrla no cambia nada.
--
-- ── Reglas ────────────────────────────────────────────────────────────────────────────────
--   * `lot_missing_documents` lee la tabla: faltan los requisitos OBLIGATORIOS del rol y tipo de la
--     cochera que no tienen ninguno de sus documentos. La usan, como siempre, el trigger que no deja
--     publicar sin documentos y la RPC que no deja aprobar. Una cochera ya verificada no debe nada.
--   * Los tipos de documento siguen siendo los 6 de la 0078 (los conocen el almacenamiento y sus
--     permisos); lo configurable es cómo se combinan y cuándo se piden.
--   * Los 5 requisitos de base no se borran (se pueden poner en "No se pide"); los que agrega el
--     equipo, sí.
--   * Los puntos del checklist "solo si hay documentos" ahora aparecen solo si la cochera subió
--     alguno: si no se pide nada, no se pide tildar "el DNI coincide".


-- 1. Tabla -------------------------------------------------------------------------------------------
create table if not exists public.document_requirements (
  code text primary key default '',
  label text not null check (char_length(btrim(label)) between 3 and 80),
  hint text not null default '' check (char_length(hint) <= 300),
  kinds text[] not null check (
    cardinality(kinds) >= 1
    and kinds <@ array['dni', 'ownership_deed', 'tax_bill', 'rental_contract', 'owner_authorization', 'commercial_license']::text[]
  ),
  for_owner boolean not null default true,
  for_tenant boolean not null default true,
  for_manager boolean not null default true,
  applies_lot_type text not null default 'all' check (applies_lot_type in ('all', 'house', 'lot')),
  policy text not null default 'required' check (policy in ('required', 'optional', 'off')),
  is_builtin boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint document_requirements_some_role check (for_owner or for_tenant or for_manager)
);

-- Las reglas de hoy (0078), con los mismos códigos que devolvía `lot_missing_documents`.
insert into public.document_requirements
  (code, label, hint, kinds, for_owner, for_tenant, for_manager, applies_lot_type, policy, is_builtin, position)
values
  ('dni', 'DNI (frente)',
   'Tiene que coincidir con el nombre de tu cuenta. Tapá el número de trámite.',
   '{dni}', true, true, true, 'all', 'required', true, 10),
  ('property_proof', 'Documento que acredite que sos el dueño',
   'Escritura, título de propiedad o una boleta reciente (últimos 6 meses) del impuesto inmobiliario o ABL, a tu nombre y con la dirección del lugar.',
   '{ownership_deed,tax_bill}', true, false, false, 'all', 'required', true, 20),
  ('rental_contract', 'Contrato de alquiler',
   'Vigente y con la dirección del lugar.',
   '{rental_contract}', false, true, false, 'all', 'required', true, 30),
  ('owner_authorization', 'Autorización firmada del dueño',
   'Con su firma, la fecha y una copia de su DNI, para que ofrezcas el lugar.',
   '{owner_authorization}', false, true, true, 'all', 'required', true, 40),
  ('commercial_license', 'Habilitación municipal',
   'Si el predio tiene habilitación como estacionamiento, sumala: acelera la revisión.',
   '{commercial_license}', true, true, true, 'lot', 'optional', true, 50)
on conflict (code) do nothing;

alter table public.document_requirements enable row level security;

-- El equipo lee y edita; borra solo los que agregó. La app lee con public_document_requirements().
drop policy if exists document_requirements_admin_select on public.document_requirements;
create policy document_requirements_admin_select on public.document_requirements for select to authenticated
  using (public.is_admin(auth.uid()));
drop policy if exists document_requirements_admin_insert on public.document_requirements;
create policy document_requirements_admin_insert on public.document_requirements for insert to authenticated
  with check (public.is_admin(auth.uid()) and not is_builtin);
drop policy if exists document_requirements_admin_update on public.document_requirements;
create policy document_requirements_admin_update on public.document_requirements for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists document_requirements_admin_delete on public.document_requirements;
create policy document_requirements_admin_delete on public.document_requirements for delete to authenticated
  using (public.is_admin(auth.uid()) and not is_builtin);

grant select, insert, update, delete on public.document_requirements to authenticated;

-- Código automático a partir del nombre, inmutable, y quién lo tocó (mismo trigger que los catálogos).
drop trigger if exists document_requirements_touch on public.document_requirements;
create trigger document_requirements_touch
  before insert or update on public.document_requirements
  for each row execute function public.touch_catalog_item();

-- `is_builtin` no se cambia desde el cliente.
create or replace function public.protect_document_requirement_builtin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and new.is_builtin is distinct from old.is_builtin then
    new.is_builtin := old.is_builtin;
  end if;
  return new;
end;
$$;

drop trigger if exists document_requirements_protect_builtin on public.document_requirements;
create trigger document_requirements_protect_builtin
  before update on public.document_requirements
  for each row execute function public.protect_document_requirement_builtin();

-- Si otro admin lo cambia, el panel abierto se actualiza solo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'document_requirements'
  ) then
    alter publication supabase_realtime add table public.document_requirements;
  end if;
end $$;


-- 2. Para la app --------------------------------------------------------------------------------------
-- Todos los requisitos en orden (la app filtra por rol, tipo y política).
create or replace function public.public_document_requirements()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', code, 'label', label, 'hint', hint, 'kinds', to_jsonb(kinds),
    'for_owner', for_owner, 'for_tenant', for_tenant, 'for_manager', for_manager,
    'applies_lot_type', applies_lot_type, 'policy', policy
  ) order by position, created_at), '[]'::jsonb)
  from public.document_requirements;
$$;

revoke all on function public.public_document_requirements() from public, anon;
grant execute on function public.public_document_requirements() to authenticated;


-- 3. Qué le falta a una cochera: lee la tabla -------------------------------------------------------
create or replace function public.lot_missing_documents(p_lot_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_lot_type text;
  v_verified timestamptz;
  v_kinds text[];
  v_missing text[] := '{}';
  v_req record;
begin
  if auth.uid() is not null
     and not public.is_admin(auth.uid())
     and not exists (select 1 from public.parking_lots where id = p_lot_id and owner_id = auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select holder_role, lot_type, ownership_verified_at into v_role, v_lot_type, v_verified
  from public.parking_lots where id = p_lot_id;
  if v_role is null then
    raise exception 'lot_not_found' using errcode = 'P0002';
  end if;

  -- Ya verificada (0079/0089): sus documentos se borraron a propósito y no se vuelven a pedir.
  if v_verified is not null then
    return v_missing;
  end if;

  select coalesce(array_agg(kind), '{}') into v_kinds
  from public.parking_lot_documents where parking_lot_id = p_lot_id;

  for v_req in
    select code, kinds from public.document_requirements
    where policy = 'required'
      and applies_lot_type in ('all', v_lot_type)
      and case v_role when 'owner' then for_owner when 'tenant' then for_tenant else for_manager end
    order by position, created_at
  loop
    if not (v_req.kinds && v_kinds) then
      v_missing := array_append(v_missing, v_req.code);
    end if;
  end loop;

  return v_missing;
end;
$$;

revoke all on function public.lot_missing_documents(uuid) from public, anon;
grant execute on function public.lot_missing_documents(uuid) to authenticated;


-- 4. Checklist: "solo si hay documentos" = la cochera subió alguno -----------------------------------
-- Igual que en la 0096, salvo la condición de `needs_documents`.
create or replace function public.lot_checklist_items(p_lot_id uuid)
returns setof public.review_checklist_items
language sql
stable
security definer
set search_path = public
as $$
  select i.*
  from public.review_checklist_items i
  join public.parking_lots l on l.id = p_lot_id
  cross join lateral (select public.lot_review_changes(l.id) as changes) c
  where public.is_admin(auth.uid())
    and i.is_active
    and i.applies_lot_type in ('all', l.lot_type)
    and (
      i.applies_to = 'always'
      or (i.applies_to = 'new' and l.approved_snapshot is null)
      or (i.applies_to = 'edit' and l.approved_snapshot is not null)
    )
    and (
      not i.needs_documents
      or (l.ownership_verified_at is null
          and exists (select 1 from public.parking_lot_documents d where d.parking_lot_id = l.id))
    )
    -- En una edición, un punto con campos solo va si cambió alguno. En un alta (changes null), siempre.
    and (cardinality(i.applies_when_changed) = 0 or c.changes is null or i.applies_when_changed && c.changes)
  order by i.position, i.created_at;
$$;

revoke all on function public.lot_checklist_items(uuid) from public, anon;
grant execute on function public.lot_checklist_items(uuid) to authenticated;
