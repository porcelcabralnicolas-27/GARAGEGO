-- GarageGo — no se aprueba una publicación que cambió mientras el equipo la revisaba.
-- Requiere 0092 (checklist y constancia), 0096 y 0097 (lot_checklist_items).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, DROP IF EXISTS y CREATE OR REPLACE. Re-correr es seguro.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────────────────
--   1. `parking_lots.review_version`: un número que sube cada vez que cambia algo que el equipo
--      revisa (nombre, descripción, dirección, ubicación, tarifa, capacidad, servicios, tipo, fotos o
--      documentos). Lo mantiene la base: el cliente no lo puede escribir.
--   2. `admin_review_parking_lot` recibe `p_expected_review_version`, la versión que el panel tenía
--      en pantalla. Al aprobar bloquea la cochera, compara y, si no coincide, no aprueba
--      (`review_stale`). Si coincide, calcula el checklist y aprueba en la misma transacción, así
--      nadie puede editar en el medio.
--   3. La constancia de cada aprobación (`listing_review_checks`) guarda la versión aprobada.
-- Compatibilidad: sin `p_expected_review_version` (un panel viejo) aprueba como antes.


-- 1. Versión de revisión -------------------------------------------------------------------------
alter table public.parking_lots add column if not exists review_version bigint not null default 1;

-- Sube con los cambios de los datos que se revisan. Desde la app no se puede tocar de otra forma;
-- las funciones internas (fotos y documentos, abajo) sí la suben.
create or replace function public.bump_review_version_on_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if btrim(coalesce(new.name, '')) is distinct from btrim(coalesce(old.name, ''))
     or btrim(coalesce(new.description, '')) is distinct from btrim(coalesce(old.description, ''))
     or btrim(coalesce(new.address, '')) is distinct from btrim(coalesce(old.address, ''))
     or new.latitude is distinct from old.latitude
     or new.longitude is distinct from old.longitude
     or new.price_per_hour is distinct from old.price_per_hour
     or new.capacity is distinct from old.capacity
     or new.amenities is distinct from old.amenities
     or new.lot_type is distinct from old.lot_type
  then
    new.review_version := old.review_version + 1;
  elsif current_user in ('authenticated', 'anon') then
    new.review_version := old.review_version;
  end if;
  return new;
end;
$$;

drop trigger if exists parking_lots_bump_review_version on public.parking_lots;
create trigger parking_lots_bump_review_version
  before update on public.parking_lots
  for each row execute function public.bump_review_version_on_edit();

-- Fotos y documentos viven en otras tablas: al agregar, quitar o cambiar uno, sube la versión de su
-- cochera. Security definer para poder escribir la columna protegida.
create or replace function public.bump_review_version_from_child()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.parking_lots
    set review_version = review_version + 1
    where id = case when tg_op = 'DELETE' then old.parking_lot_id else new.parking_lot_id end;
  return null;
end;
$$;

revoke all on function public.bump_review_version_from_child() from public, anon, authenticated;

drop trigger if exists parking_images_bump_review_version on public.parking_images;
create trigger parking_images_bump_review_version
  after insert or delete or update of storage_path on public.parking_images
  for each row execute function public.bump_review_version_from_child();

drop trigger if exists parking_lot_documents_bump_review_version on public.parking_lot_documents;
create trigger parking_lot_documents_bump_review_version
  after insert or delete on public.parking_lot_documents
  for each row execute function public.bump_review_version_from_child();


-- 2. La constancia guarda la versión aprobada ---------------------------------------------------------
alter table public.listing_review_checks add column if not exists review_version bigint;


-- 3. Aprobar con la versión que se revisó --------------------------------------------------------------
-- Igual a la de la 0092, más `p_expected_review_version`. Cambia la firma: se borra la anterior para
-- que PostgREST no tenga dos candidatas con los mismos parámetros nombrados.
drop function if exists public.admin_review_parking_lot(uuid, text, text, text[], uuid[]);

create or replace function public.admin_review_parking_lot(
  p_lot_id uuid,
  p_decision text,
  p_reason text default null,
  p_fields text[] default null,
  p_checked_items uuid[] default null,
  p_expected_review_version bigint default null
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
  v_version bigint;
  v_row public.parking_lots;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  if p_decision = 'approved' then
    -- Con la cochera bloqueada, el propietario no puede editarla hasta que termine la aprobación.
    select review_version into v_version from public.parking_lots where id = p_lot_id for update;
    if p_expected_review_version is not null and v_version is distinct from p_expected_review_version then
      raise exception 'review_stale' using errcode = 'P0001';
    end if;

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
    insert into public.listing_review_checks (parking_lot_id, reviewer_id, decision, items, review_version)
    values (p_lot_id, auth.uid(), p_decision, v_items, v_version);
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_review_parking_lot(uuid, text, text, text[], uuid[], bigint) from public, anon;
grant execute on function public.admin_review_parking_lot(uuid, text, text, text[], uuid[], bigint) to authenticated;
