-- GarageGo — checklist de aprobación configurable desde el panel, validado por el servidor y con
-- constancia de cada aprobación.
-- Requiere 0033 (is_admin), 0082 (admin_review_parking_lot) y 0089 (approved_snapshot).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: IF NOT EXISTS, ON CONFLICT, DROP IF EXISTS y CREATE OR REPLACE. Re-correr es seguro.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────────────────
-- Hasta acá el checklist eran 5 frases fijas en el código del panel, y solo vivían en pantalla: la
-- base no sabía si el revisor había tildado algo. Ahora:
--   1. Los puntos viven en `review_checklist_items` y el equipo los edita desde Configuración:
--      texto, ayuda, obligatorio u opcional, orden, activo, y a qué publicaciones se aplican
--      (tipo de lugar, alta nueva o edición, solo si hay documentos para revisar).
--   2. Aprobar exige tildar los obligatorios que corresponden a ESA publicación. Lo controla
--      `admin_review_parking_lot` (no el panel), que ahora recibe los puntos tildados.
--   3. Cada aprobación deja constancia en `listing_review_checks`: quién, cuándo y qué puntos, con
--      el texto copiado. Si después se cambia el checklist, el historial no se altera.
--
-- ── Cuándo se aplica un punto (la misma regla está en el panel, checklistApi.ts) ─────────────
--   * activo;
--   * tipo de lugar: 'all' o el de la cochera;
--   * momento: 'always', 'new' (nunca fue aprobada) o 'edit' (ya fue aprobada alguna vez, o sea
--     tiene `approved_snapshot`, 0089);
--   * `needs_documents`: solo si la titularidad todavía no está verificada (hay documentos que
--     mirar). Así el punto del DNI desaparece en una edición de una cochera ya verificada.
--
-- ── Compatibilidad ────────────────────────────────────────────────────────────────────────
-- La RPC conserva el nombre y los parámetros de siempre y suma `p_checked_items` (con default).
-- Un panel viejo (sin este cambio) puede seguir pidiendo cambios y rechazando, pero ya NO puede
-- aprobar: no manda los puntos tildados. Hay que publicar el panel nuevo junto con esta migración.


-- 1. Puntos del checklist ----------------------------------------------------------------------------
create table if not exists public.review_checklist_items (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(btrim(label)) between 3 and 200),
  help text check (help is null or char_length(help) <= 500),
  required boolean not null default true,
  applies_lot_type text not null default 'all' check (applies_lot_type in ('all', 'house', 'lot')),
  applies_to text not null default 'always' check (applies_to in ('always', 'new', 'edit')),
  needs_documents boolean not null default false,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create index if not exists review_checklist_items_order_idx on public.review_checklist_items (position, created_at);

alter table public.review_checklist_items enable row level security;

-- Solo el equipo lo ve y lo edita (el propietario no necesita saber qué se le revisa).
drop policy if exists review_checklist_items_admin on public.review_checklist_items;
create policy review_checklist_items_admin on public.review_checklist_items for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Quién y cuándo lo tocó por última vez: lo pone la base, no el panel.
create or replace function public.touch_review_checklist_item()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists review_checklist_items_touch on public.review_checklist_items;
create trigger review_checklist_items_touch
  before insert or update on public.review_checklist_items
  for each row execute function public.touch_review_checklist_item();

-- Los 5 puntos que estaban fijos en el panel, con ids fijos para que re-correr no los duplique.
insert into public.review_checklist_items (id, label, help, required, needs_documents, position) values
  ('c0920000-0000-0000-0000-000000000001', 'Las fotos muestran la cochera y son legibles',
   'Que se vea el lugar y el acceso; sin fotos de internet ni capturas.', true, false, 10),
  ('c0920000-0000-0000-0000-000000000002', 'La dirección es coherente con las coordenadas',
   'Abrí "Abrir en Maps" y fijate que el punto caiga en la dirección indicada.', true, false, 20),
  ('c0920000-0000-0000-0000-000000000003', 'El precio está dentro de un rango razonable',
   null, true, false, 30),
  ('c0920000-0000-0000-0000-000000000004', 'La descripción no incluye datos de contacto',
   'Teléfonos, correos o redes: el trato tiene que hacerse dentro de la app.', true, false, 40),
  ('c0920000-0000-0000-0000-000000000005',
   'El DNI coincide con el propietario y los documentos acreditan su vínculo con esta dirección',
   null, true, true, 50)
on conflict (id) do nothing;


-- Si otro admin cambia el checklist, el panel abierto se actualiza solo (Realtime, como la 0060).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'review_checklist_items'
  ) then
    alter publication supabase_realtime add table public.review_checklist_items;
  end if;
end $$;


-- 2. Qué puntos corresponden a una publicación -----------------------------------------------------------
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
  where public.is_admin(auth.uid())
    and i.is_active
    and i.applies_lot_type in ('all', l.lot_type)
    and (
      i.applies_to = 'always'
      or (i.applies_to = 'new' and l.approved_snapshot is null)
      or (i.applies_to = 'edit' and l.approved_snapshot is not null)
    )
    and (not i.needs_documents or l.ownership_verified_at is null)
  order by i.position, i.created_at;
$$;

revoke all on function public.lot_checklist_items(uuid) from public, anon;
grant execute on function public.lot_checklist_items(uuid) to authenticated;


-- 3. Constancia de cada aprobación -------------------------------------------------------------------------
create table if not exists public.listing_review_checks (
  id uuid primary key default gen_random_uuid(),
  parking_lot_id uuid not null references public.parking_lots (id) on delete cascade,
  reviewer_id uuid references public.profiles (id) on delete set null,
  decision text not null check (decision in ('approved', 'rejected', 'changes_requested')),
  -- [{ "id", "label", "required", "checked" }], con el texto tal como estaba al aprobar.
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists listing_review_checks_lot_idx on public.listing_review_checks (parking_lot_id, created_at desc);

alter table public.listing_review_checks enable row level security;

-- Solo lectura para el equipo; se escribe únicamente desde la RPC de revisión.
drop policy if exists listing_review_checks_admin_select on public.listing_review_checks;
create policy listing_review_checks_admin_select on public.listing_review_checks for select to authenticated
  using (public.is_admin(auth.uid()));


-- 4. La RPC de revisión exige el checklist --------------------------------------------------------------
-- La de la 0082 pasa a llamarse `admin_review_parking_lot_core` (sin cambios, y sin permiso para el
-- cliente) y la nueva, con el mismo nombre de siempre, valida el checklist antes de llamarla. Así
-- no se copia de nuevo todo su cuerpo.
do $$
begin
  if to_regprocedure('public.admin_review_parking_lot_core(uuid, text, text, text[])') is null then
    alter function public.admin_review_parking_lot(uuid, text, text, text[]) rename to admin_review_parking_lot_core;
  end if;
end;
$$;

revoke all on function public.admin_review_parking_lot_core(uuid, text, text, text[]) from public, anon, authenticated;

create or replace function public.admin_review_parking_lot(
  p_lot_id uuid,
  p_decision text,
  p_reason text default null,
  p_fields text[] default null,
  p_checked_items uuid[] default null
)
returns public.parking_lots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checked uuid[] := coalesce(p_checked_items, '{}');
  v_items jsonb := '[]'::jsonb;
  v_missing text;
  v_row public.parking_lots;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  if p_decision = 'approved' then
    -- Los puntos de ESTA publicación, antes de que la aprobación le cambie el estado.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', i.id, 'label', i.label, 'required', i.required, 'checked', i.id = any(v_checked)
           ) order by i.position, i.created_at), '[]'::jsonb),
           string_agg(i.label, ' | ' order by i.position) filter (where i.required and not i.id = any(v_checked))
    into v_items, v_missing
    from public.lot_checklist_items(p_lot_id) i;

    if v_missing is not null then
      raise exception 'checklist_incomplete: %', v_missing using errcode = 'P0001';
    end if;
  end if;

  v_row := public.admin_review_parking_lot_core(p_lot_id, p_decision, p_reason, p_fields);

  if p_decision = 'approved' then
    insert into public.listing_review_checks (parking_lot_id, reviewer_id, decision, items)
    values (p_lot_id, auth.uid(), p_decision, v_items);
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_review_parking_lot(uuid, text, text, text[], uuid[]) from public, anon;
grant execute on function public.admin_review_parking_lot(uuid, text, text, text[], uuid[]) to authenticated;
