-- GarageGo — verificación de titularidad: el propietario sube documentos que acreditan que es el
-- dueño del lugar (o que tiene permiso para ofrecerlo) y el equipo los revisa antes de aprobar.
-- Requiere 0034/0035/0036 (moderación), 0037/0038/0053/0072 (trigger de protección) y 0058 (límites
-- de los buckets).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: IF NOT EXISTS, DROP IF EXISTS y CREATE OR REPLACE. Re-correr es seguro.
--
-- ── Qué se pide (decisión del equipo: el mínimo recomendado) ──────────────────────────────────
--   owner    (titular):      DNI + escritura/título O boleta de impuesto inmobiliario/ABL
--   tenant   (inquilino):    DNI + contrato de alquiler + autorización firmada del dueño
--   manager  (administra):   DNI + autorización firmada del dueño
--   Opcional en estacionamientos: habilitación municipal.
-- La misma regla vive en la app (`documentRequirements`, shared/domain.ts): la app solo decide qué
-- pedir; el que la hace cumplir es el servidor (`lot_missing_documents`).
--
-- ── Dónde se hace cumplir ─────────────────────────────────────────────────────────────────────
--   1. `admin_review_parking_lot` no deja APROBAR una publicación a la que le falten documentos.
--      Es el control que importa: una cochera sin verificar nunca llega a la búsqueda.
--   2. Un trigger no deja ACTIVAR (publicar) una cochera nueva sin sus documentos. Es el aviso
--      temprano para el propietario, con el mismo mensaje que la app.
-- Las cocheras que ya estaban aprobadas NO se tocan: la regla corre cuando se activa una
-- pendiente o se aprueba una, no sobre lo ya publicado.
--
-- ── Privacidad ────────────────────────────────────────────────────────────────────────────────
-- Los documentos tienen datos personales (DNI, domicilio): bucket PRIVADO. Solo los ve su dueño y
-- el equipo, con URLs firmadas que vencen. El propietario puede borrarlos mientras la publicación
-- no esté aprobada; una vez aprobada quedan como constancia de la revisión.

-- 1. Relación de quien publica con el lugar ---------------------------------------------------------
alter table public.parking_lots
  add column if not exists holder_role text not null default 'owner';

alter table public.parking_lots drop constraint if exists parking_lots_holder_role_check;
alter table public.parking_lots add constraint parking_lots_holder_role_check
  check (holder_role in ('owner', 'tenant', 'manager'));


-- 2. Tabla de documentos -----------------------------------------------------------------------------
create table if not exists public.parking_lot_documents (
  id uuid primary key default gen_random_uuid(),
  parking_lot_id uuid not null references public.parking_lots (id) on delete cascade,
  kind text not null check (kind in (
    'dni', 'ownership_deed', 'tax_bill', 'rental_contract', 'owner_authorization', 'commercial_license'
  )),
  storage_path text not null,
  created_at timestamptz not null default now(),
  -- Un documento por tipo: para reemplazarlo se borra el anterior.
  unique (parking_lot_id, kind)
);

create index if not exists parking_lot_documents_lot_idx on public.parking_lot_documents (parking_lot_id);

alter table public.parking_lot_documents enable row level security;

drop policy if exists parking_lot_documents_select on public.parking_lot_documents;
create policy parking_lot_documents_select on public.parking_lot_documents for select to authenticated
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.parking_lots l
      where l.id = parking_lot_documents.parking_lot_id and l.owner_id = auth.uid()
    )
  );

-- La ruta tiene que ser de la carpeta del propio usuario y de esa cochera: nadie puede registrar
-- un archivo ajeno como si fuera suyo.
drop policy if exists parking_lot_documents_insert on public.parking_lot_documents;
create policy parking_lot_documents_insert on public.parking_lot_documents for insert to authenticated
  with check (
    exists (
      select 1 from public.parking_lots l
      where l.id = parking_lot_documents.parking_lot_id and l.owner_id = auth.uid()
    )
    and storage_path like auth.uid()::text || '/' || parking_lot_id::text || '/%'
  );

drop policy if exists parking_lot_documents_delete on public.parking_lot_documents;
create policy parking_lot_documents_delete on public.parking_lot_documents for delete to authenticated
  using (
    exists (
      select 1 from public.parking_lots l
      where l.id = parking_lot_documents.parking_lot_id
        and l.owner_id = auth.uid()
        and l.approval_status <> 'approved'
    )
  );
-- Sin policy de UPDATE: no se edita un documento, se reemplaza.


-- 3. Bucket privado ------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ownership-docs', 'ownership-docs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Ruta: {auth.uid()}/{parking_lot_id}/archivo
drop policy if exists "ownership_docs_owner_insert" on storage.objects;
create policy "ownership_docs_owner_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'ownership-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "ownership_docs_read" on storage.objects;
create policy "ownership_docs_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'ownership-docs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid()))
  );

drop policy if exists "ownership_docs_owner_delete" on storage.objects;
create policy "ownership_docs_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ownership-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
    -- Una publicación aprobada conserva sus documentos. Si la cochera ya no existe (se borró de
    -- verdad), la app limpia los archivos que quedaron.
    and not exists (
      select 1 from public.parking_lots l
      where l.id::text = (storage.foldername(name))[2] and l.approval_status = 'approved'
    )
  );


-- 4. Qué documentos le faltan a una publicación ---------------------------------------------------------
-- Devuelve los requisitos sin cumplir ('dni', 'property_proof', 'rental_contract',
-- 'owner_authorization'); vacío = completa. Solo lo puede pedir el dueño o un admin.
create or replace function public.lot_missing_documents(p_lot_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_kinds text[];
  v_missing text[] := '{}';
begin
  if auth.uid() is not null
     and not public.is_admin(auth.uid())
     and not exists (select 1 from public.parking_lots where id = p_lot_id and owner_id = auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select holder_role into v_role from public.parking_lots where id = p_lot_id;
  if v_role is null then
    raise exception 'lot_not_found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(kind), '{}') into v_kinds
  from public.parking_lot_documents where parking_lot_id = p_lot_id;

  if not 'dni' = any(v_kinds) then
    v_missing := array_append(v_missing, 'dni');
  end if;

  if v_role = 'owner' then
    if not (v_kinds && array['ownership_deed', 'tax_bill']) then
      v_missing := array_append(v_missing, 'property_proof');
    end if;
  elsif v_role = 'tenant' then
    if not 'rental_contract' = any(v_kinds) then
      v_missing := array_append(v_missing, 'rental_contract');
    end if;
    if not 'owner_authorization' = any(v_kinds) then
      v_missing := array_append(v_missing, 'owner_authorization');
    end if;
  else
    if not 'owner_authorization' = any(v_kinds) then
      v_missing := array_append(v_missing, 'owner_authorization');
    end if;
  end if;

  return v_missing;
end;
$$;

revoke all on function public.lot_missing_documents(uuid) from public, anon;
grant execute on function public.lot_missing_documents(uuid) to authenticated;


-- 5. Aviso temprano: no se publica una cochera nueva sin documentos --------------------------------------
-- Solo cuando la cochera pasa de inactiva a activa y todavía está pendiente de revisión. Sin
-- restricción para el servidor ni para el SQL Editor (current_user distinto de authenticated).
create or replace function public.require_ownership_documents()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_missing text[];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.is_active and not old.is_active and new.approval_status = 'pending' then
    v_missing := public.lot_missing_documents(new.id);
    if cardinality(v_missing) > 0 then
      raise exception 'ownership_docs_required: %', array_to_string(v_missing, ',') using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists parking_lots_require_documents on public.parking_lots;
create trigger parking_lots_require_documents
  before update of is_active on public.parking_lots
  for each row execute function public.require_ownership_documents();


-- 6. La foto del estado de la cochera ahora incluye los documentos ----------------------------------------
-- Para que "Pedir cambios: documentos" se pueda validar al reenviar (misma idea que las fotos).
create or replace function public.lot_review_snapshot(p_lot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
begin
  -- Solo el dueño o un admin (o el servidor, sin sesión): no es un lector libre de cocheras.
  if auth.uid() is not null
     and not public.is_admin(auth.uid())
     and not exists (select 1 from public.parking_lots where id = p_lot_id and owner_id = auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'name', btrim(l.name),
    'description', coalesce(btrim(l.description), ''),
    'address', jsonb_build_object('address', btrim(l.address), 'lat', l.latitude, 'lng', l.longitude),
    'price', l.price_per_hour,
    'capacity', l.capacity,
    'amenities', (select coalesce(jsonb_agg(a order by a), '[]'::jsonb) from unnest(l.amenities) a),
    'photos', (
      select coalesce(jsonb_agg(i.storage_path order by i.storage_path), '[]'::jsonb)
      from public.parking_images i where i.parking_lot_id = l.id
    ),
    'availability', (
      select coalesce(
        jsonb_agg(r.day_of_week::text || ' ' || r.start_time::text || '-' || r.end_time::text
                  order by r.day_of_week, r.start_time),
        '[]'::jsonb)
      from public.parking_availability_recurring r where r.parking_lot_id = l.id
    ),
    -- Por tipo y archivo: reemplazar un documento cuenta como cambiarlo.
    'documents', (
      select coalesce(jsonb_agg(d.kind || ':' || d.storage_path order by d.kind), '[]'::jsonb)
      from public.parking_lot_documents d where d.parking_lot_id = l.id
    )
  )
  into v_snapshot
  from public.parking_lots l
  where l.id = p_lot_id;

  return v_snapshot;
end;
$$;

revoke all on function public.lot_review_snapshot(uuid) from public, anon;
grant execute on function public.lot_review_snapshot(uuid) to authenticated;


-- 7. RPC de revisión: suma el campo 'documents' y exige documentos para aprobar --------------------------
-- Misma firma y mismos grants que la 0072; cambia el cuerpo.
create or replace function public.admin_review_parking_lot(
  p_lot_id uuid,
  p_decision text,
  p_reason text default null,
  p_fields text[] default null
)
returns public.parking_lots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.parking_lots;
  v_reason text := nullif(btrim(p_reason), '');
  v_fields text[];
  v_missing text[];
  v_allowed constant text[] := array[
    'name', 'description', 'address', 'price', 'capacity', 'amenities', 'photos', 'availability',
    'documents', 'other'
  ];
  v_labels text;
  v_title text;
  v_body text;
  v_type text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'rejected', 'changes_requested') then
    raise exception 'invalid_decision: %', p_decision using errcode = '22023';
  end if;

  if p_decision <> 'approved' and v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  -- No se aprueba una publicación sin verificar la titularidad: es lo que impide que una cochera
  -- ajena llegue a la búsqueda.
  if p_decision = 'approved' then
    v_missing := public.lot_missing_documents(p_lot_id);
    if cardinality(v_missing) > 0 then
      raise exception 'ownership_docs_missing: %', array_to_string(v_missing, ',') using errcode = 'P0001';
    end if;
  end if;

  if p_decision = 'changes_requested' then
    -- Sin campos marcados se interpreta "otro": alcanza con que cambie algo.
    select coalesce(array_agg(distinct f), array['other'])
    into v_fields
    from unnest(coalesce(p_fields, array['other'])) f;

    if exists (select 1 from unnest(v_fields) f where not f = any(v_allowed)) then
      raise exception 'invalid_fields: %', array_to_string(v_fields, ',') using errcode = '22023';
    end if;
  end if;

  update public.parking_lots
    set approval_status  = p_decision,
        rejection_reason = case when p_decision = 'approved' then null else v_reason end,
        reviewed_at      = now(),
        reviewed_by      = auth.uid(),
        updated_at       = now(),
        requested_changes = case when p_decision = 'changes_requested' then v_fields else null end,
        changes_snapshot  = case when p_decision = 'changes_requested' then public.lot_review_snapshot(p_lot_id) else null end
    where id = p_lot_id
    returning * into v_row;

  if not found then
    raise exception 'lot_not_found' using errcode = 'P0002';
  end if;

  -- Aviso al propietario.
  if p_decision = 'approved' then
    v_type  := 'listing_approved';
    v_title := 'Tu cochera fue aprobada';
    v_body  := format('«%s» ya está publicada y visible para los conductores.', v_row.name);
  elsif p_decision = 'rejected' then
    v_type  := 'listing_rejected';
    v_title := 'Tu cochera fue rechazada';
    v_body  := format('«%s»: %s', v_row.name, v_reason);
  else
    v_type  := 'listing_changes_requested';
    v_title := 'Tu cochera necesita cambios';
    select string_agg(
             case f
               when 'name' then 'Nombre'
               when 'description' then 'Descripción'
               when 'address' then 'Dirección y ubicación'
               when 'price' then 'Tarifa por hora'
               when 'capacity' then 'Capacidad'
               when 'amenities' then 'Servicios'
               when 'photos' then 'Fotos'
               when 'availability' then 'Disponibilidad'
               when 'documents' then 'Documentos de titularidad'
               else 'Otro'
             end, ', ' order by f)
    into v_labels
    from unnest(v_fields) f;
    v_body  := format('«%s» — a modificar: %s. %s', v_row.name, v_labels, v_reason);
  end if;

  insert into public.notifications (user_id, title, description, type, audience)
  values (v_row.owner_id, v_title, v_body, v_type, 'owner');

  return v_row;
end;
$$;

revoke execute on function public.admin_review_parking_lot(uuid, text, text, text[]) from public, anon;
grant execute on function public.admin_review_parking_lot(uuid, text, text, text[]) to authenticated;
