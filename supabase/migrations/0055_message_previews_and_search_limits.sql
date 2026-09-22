-- GarageGo — último mensaje por conversación sin traer el historial completo, y topes en la
-- búsqueda de cocheras.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE. Re-correr OK.
--
-- ── El problema (auditoría técnica 2026-09-13, hallazgo 3.1 y 3.4) ───────────────────────
-- `attachLastMessages` (src/features/messaging/api.ts) traía TODOS los mensajes de TODAS las
-- reservas del usuario, ordenados por fecha, solo para quedarse con el más nuevo de cada hilo.
-- Con historial largo, el payload crece sin límite. `search_parking_lots` tampoco tenía tope de
-- radio ni de filas: un radio enorme podía traer toda la tabla.
--
-- ── Arreglo ────────────────────────────────────────────────────────────────────────────
-- `last_message_per_booking`: un `distinct on` server-side, filtrado a las reservas que el que
-- llama puede ver (mismo criterio que la policy `messages_select` de la 0013) — así, aunque se
-- le pasen ids ajenos, esos simplemente no vuelven, en vez de filtrarse del lado del cliente.
-- `search_parking_lots`: mismo resultado y firma que la 0053, con el radio topeado a 25 km y un
-- LIMIT de 200 filas.

create or replace function public.last_message_per_booking(p_booking_ids uuid[])
returns table (booking_id uuid, content text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (m.booking_id) m.booking_id, m.content, m.created_at
  from public.messages m
  join public.bookings b on b.id = m.booking_id
  join public.parking_lots p on p.id = b.parking_lot_id
  where m.booking_id = any (p_booking_ids)
    and (b.user_id = auth.uid() or p.owner_id = auth.uid())
  order by m.booking_id, m.created_at desc;
$$;

revoke all on function public.last_message_per_booking(uuid[]) from public, anon;
grant execute on function public.last_message_per_booking(uuid[]) to authenticated;


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
    and st_dwithin(
      p.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      least(coalesce(p_radius_km, 5), 25) * 1000
    )
    and (p_max_price is null or p.price_per_hour <= p_max_price)
    and (p_min_rating is null or p.rating_avg >= p_min_rating)
  order by distance_km asc
  limit 200;
$$;

revoke execute on function public.search_parking_lots(double precision, double precision, double precision, numeric, numeric) from public, anon;
grant execute on function public.search_parking_lots(double precision, double precision, double precision, numeric, numeric)
  to authenticated;
