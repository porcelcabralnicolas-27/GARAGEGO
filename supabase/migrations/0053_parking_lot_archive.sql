-- GarageGo — borrar una cochera ya no arrastra reservas, chats ni calificaciones.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE. Re-correr OK.
--
-- ── El problema (auditoría técnica 2026-09-13, hallazgo 2.6) ─────────────────────────────
-- `parking_lots_delete_own` (0001) deja al propietario borrar su cochera en cualquier momento,
-- y `bookings.parking_lot_id` es ON DELETE CASCADE. Borrar una cochera con reservas futuras ya
-- pagadas las hacía desaparecer SIN reembolso, junto con los chats, las calificaciones y las
-- notificaciones; los movimientos de billetera quedaban con `related_booking_id` en null.
--
-- ── Decisión del equipo (2026-09-21) ─────────────────────────────────────────────────────
--   * Con reservas vigentes (pending/confirmed): no se puede borrar. Primero hay que
--     cancelarlas (eso ya reembolsa) o esperar a que terminen.
--   * Con historial (alguna reserva pasada): se ARCHIVA. Deja de aparecer en la búsqueda y en
--     "Mis cocheras", no se puede reservar ni reactivar, pero el historial queda intacto.
--   * Sin ninguna reserva: se borra de verdad, como antes.
-- Todo pasa por la RPC `delete_parking_lot`; se quita la policy de DELETE directo.

alter table public.parking_lots add column if not exists archived_at timestamptz;

drop policy if exists parking_lots_delete_own on public.parking_lots;


-- delete_parking_lot -------------------------------------------------------------------
-- Devuelve 'deleted' o 'archived' para que la app sepa si tiene que limpiar las imágenes del
-- bucket (solo si se borró: una archivada conserva sus fotos para el historial).

create or replace function public.delete_parking_lot(p_parking_lot_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  -- Mismo lock que usa _assert_slot_bookable (0048): nadie puede reservar esta cochera
  -- mientras se decide si se borra.
  perform pg_advisory_xact_lock(hashtextextended('garagego.booking:' || p_parking_lot_id::text, 0));

  select owner_id into v_owner_id from public.parking_lots where id = p_parking_lot_id for update;

  if v_owner_id is null then
    raise exception 'Estacionamiento no encontrado';
  end if;
  if auth.uid() is null or v_owner_id <> auth.uid() then
    raise exception 'No autorizado';
  end if;

  if exists (
    select 1 from public.bookings
    where parking_lot_id = p_parking_lot_id and status in ('pending', 'confirmed')
  ) then
    raise exception 'lot_has_active_bookings';
  end if;

  if exists (select 1 from public.bookings where parking_lot_id = p_parking_lot_id) then
    update public.parking_lots
    set archived_at = now(), is_active = false
    where id = p_parking_lot_id and archived_at is null;
    return 'archived';
  end if;

  delete from public.parking_lots where id = p_parking_lot_id;
  return 'deleted';
end;
$$;

revoke all on function public.delete_parking_lot(uuid) from public, anon;
grant execute on function public.delete_parking_lot(uuid) to authenticated;


-- protect_parking_lot_moderation -------------------------------------------------------
-- Misma función que la 0038, más dos reglas para el cliente:
--   * `archived_at` no se puede tocar (solo lo pone la RPC de arriba);
--   * una cochera archivada no se puede volver a activar.

create or replace function public.protect_parking_lot_moderation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- postgres / service_role / RPCs security definer: sin restricción.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Columnas que solo el equipo puede tocar (vía las RPC de moderación): se congelan.
  new.reviewed_by      := old.reviewed_by;
  new.moderation_state := old.moderation_state;
  new.pause_reason     := old.pause_reason;
  new.suspended_until  := old.suspended_until;

  -- Archivado: solo por delete_parking_lot, y es definitivo.
  new.archived_at := old.archived_at;
  if old.archived_at is not null then
    new.is_active := false;
  end if;

  if new.approval_status is distinct from old.approval_status
     and old.approval_status = 'changes_requested'
     and new.approval_status = 'pending' then
    -- Reenvío a revisión tras "Pedir cambios": permitido, y se borra el rastro anterior.
    new.rejection_reason := null;
    new.reviewed_at      := null;
  else
    -- Cualquier otra transición de estado se ignora en silencio. En particular,
    -- 'rejected' -> 'pending' NO pasa: el rechazo es definitivo.
    new.approval_status  := old.approval_status;
    new.rejection_reason := old.rejection_reason;
    new.reviewed_at      := old.reviewed_at;
  end if;

  return new;
end;
$$;


-- search_parking_lots ------------------------------------------------------------------
-- Misma firma y retorno que la 0034; solo agrega `archived_at is null`. (Una archivada ya
-- tiene is_active = false, pero se deja explícito por si alguna vez se relaja esa regla.)

create or replace function public.search_parking_lots(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 5,
  p_max_price numeric default null,
  p_min_rating numeric default null
)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  description text,
  address text,
  latitude double precision,
  longitude double precision,
  price_per_hour numeric,
  rating_avg numeric,
  is_active boolean,
  created_at timestamptz,
  distance_km double precision
)
language sql
stable
as $$
  select
    p.id, p.owner_id, p.name, p.description, p.address, p.latitude, p.longitude,
    p.price_per_hour, p.rating_avg, p.is_active, p.created_at,
    st_distance(p.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0 as distance_km
  from public.parking_lots p
  where p.is_active = true
    and p.approval_status = 'approved'
    and p.moderation_state = 'live'
    and p.archived_at is null
    and p.owner_id is distinct from auth.uid()
    and st_dwithin(p.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000)
    and (p_max_price is null or p.price_per_hour <= p_max_price)
    and (p_min_rating is null or p.rating_avg >= p_min_rating)
  order by distance_km asc;
$$;

revoke execute on function public.search_parking_lots(double precision, double precision, double precision, numeric, numeric) from public, anon;
grant execute on function public.search_parking_lots(double precision, double precision, double precision, numeric, numeric)
  to authenticated;
