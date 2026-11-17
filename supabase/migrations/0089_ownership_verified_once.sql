-- GarageGo — la titularidad se verifica una sola vez, y el panel ve qué cambió en cada edición.
-- Requiere 0079, 0081 y 0082.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, DROP IF EXISTS y CREATE OR REPLACE. Re-correr es seguro.
--
-- ── 1. Una vez aprobada, la titularidad no se vuelve a pedir (decisión del equipo) ────────────
-- Antes (0082), cambiar la dirección o el punto en el mapa le quitaba a la cochera el sello de
-- titularidad (`ownership_verified_at`) y el propietario tenía que subir los documentos otra vez.
-- Ahora el sello queda para siempre: editar una publicación aprobada la manda a revisión (0081,
-- sin cambios) y el equipo aprueba los cambios en el panel, sin documentos. Como el sello sigue,
-- `lot_missing_documents` devuelve vacío y `admin_review_parking_lot` deja aprobar.
--
-- ── 2. Qué cambió desde la última aprobación ──────────────────────────────────────────────────
-- Al aprobar se guarda una foto de la publicación (`approved_snapshot`: la misma de
-- `lot_review_snapshot` más el tipo de lugar). Cuando el propietario edita, el panel compara la
-- publicación actual con esa foto y muestra solo lo que cambió, para aprobar eso.
-- Las que ya están aprobadas se fotografían ahora; las que ya están en revisión por una edición
-- anterior a esta migración no tienen foto y el panel lo dice.

-- 1. El trigger de edición ya no quita el sello ----------------------------------------------------
-- Mismo cuerpo que la 0081 (el de la 0082 sin el bloque del sello).
create or replace function public.rereview_on_listing_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if old.approval_status = 'approved'
     and (
       btrim(coalesce(new.name, '')) is distinct from btrim(coalesce(old.name, ''))
       or btrim(coalesce(new.description, '')) is distinct from btrim(coalesce(old.description, ''))
       or btrim(coalesce(new.address, '')) is distinct from btrim(coalesce(old.address, ''))
       or new.latitude is distinct from old.latitude
       or new.longitude is distinct from old.longitude
       or new.price_per_hour is distinct from old.price_per_hour
       or new.capacity is distinct from old.capacity
       or new.amenities is distinct from old.amenities
       or new.lot_type is distinct from old.lot_type
     ) then
    new.approval_status   := 'pending';
    new.rejection_reason  := null;
    new.requested_changes := null;
    new.changes_snapshot  := null;
  end if;

  return new;
end;
$$;


-- 2. Foto de lo aprobado ---------------------------------------------------------------------------
alter table public.parking_lots add column if not exists approved_snapshot jsonb;

-- Se toma al pasar a 'approved', en un BEFORE: la fila todavía tiene los datos que el equipo vio
-- (aprobar no cambia el contenido), y las fotos y horarios salen de sus tablas.
-- Sin security definer a propósito: `current_user` tiene que ser el de quien actualiza para
-- distinguir al cliente. Aprobar solo se puede con la RPC del equipo (security definer), y
-- `lot_review_snapshot` deja leer al admin.
create or replace function public.capture_approved_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.approval_status = 'approved' and old.approval_status is distinct from 'approved' then
    new.approved_snapshot := public.lot_review_snapshot(new.id)
      || jsonb_build_object('lot_type', new.lot_type, 'lat', new.latitude, 'lng', new.longitude);
  elsif current_user in ('authenticated', 'anon') then
    -- El cliente no la puede escribir.
    new.approved_snapshot := old.approved_snapshot;
  end if;
  return new;
end;
$$;

revoke all on function public.capture_approved_snapshot() from public, anon, authenticated;

-- Nombre con "z" para correr DESPUÉS de los triggers de protección y del de edición (los
-- triggers corren por orden alfabético).
drop trigger if exists parking_lots_zz_approved_snapshot on public.parking_lots;
create trigger parking_lots_zz_approved_snapshot
  before update on public.parking_lots
  for each row execute function public.capture_approved_snapshot();

-- Las aprobadas de hoy: su estado actual es el aprobado.
update public.parking_lots
  set approved_snapshot = public.lot_review_snapshot(id)
    || jsonb_build_object('lot_type', lot_type, 'lat', latitude, 'lng', longitude)
  where approval_status = 'approved' and approved_snapshot is null;
