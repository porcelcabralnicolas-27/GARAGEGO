-- GarageGo — la búsqueda de estacionamientos puede cubrir todo el mapa.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE con la misma firma. Re-correr es seguro.
--
-- ── Por qué ─────────────────────────────────────────────────────────────────────────────────────
-- El mapa de Inicio tiene que mostrar TODOS los estacionamientos, y solo limitarse por distancia
-- cuando la persona elige un radio en Buscar. Hasta ahora `search_parking_lots` cortaba cualquier
-- pedido en 25 km (0059), así que quien estuviera a más de 25 km de las cocheras veía el mapa
-- vacío. El tope sube a 1000 km: más que cualquier distancia dentro del país, sin que el servidor
-- tenga que aceptar un radio sin límite.
--
-- Lo demás queda igual que en la 0075: misma firma, mismos filtros (activa, aprobada, en vivo, no
-- archivada y no propia), mismo orden por distancia y el mismo máximo de 200 resultados por
-- pedido (los 200 más cercanos). La paginación por cursor de la lista sigue funcionando.

create or replace function public.search_parking_lots(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 5,
  p_max_price numeric default null,
  p_min_rating numeric default null,
  p_limit integer default 200,
  p_cursor_distance double precision default null,
  p_cursor_id uuid default null
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
  lot_type text,
  distance_km double precision
)
language sql
stable
-- Sin `set search_path`, igual que la 0055: PostGIS vive en el esquema `extensions` de Supabase
-- y con search_path = public las funciones st_* no se encontrarían.
as $$
  select *
  from (
    select
      p.id, p.owner_id, p.name, p.description, p.address, p.latitude, p.longitude,
      p.price_per_hour, p.rating_avg, p.is_active, p.created_at, p.lot_type,
      st_distance(p.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0 as distance_km
    from public.parking_lots p
    where p.is_active = true
      and p.approval_status = 'approved'
      and p.moderation_state = 'live'
      and p.archived_at is null
      and p.owner_id is distinct from auth.uid()
      and st_dwithin(
        p.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
        least(coalesce(p_radius_km, 5), 1000) * 1000
      )
      and (p_max_price is null or p.price_per_hour <= p_max_price)
      and (p_min_rating is null or p.rating_avg >= p_min_rating)
  ) found
  where p_cursor_id is null or (found.distance_km, found.id) > (p_cursor_distance, p_cursor_id)
  order by found.distance_km asc, found.id asc
  limit least(greatest(coalesce(p_limit, 200), 1), 200);
$$;

revoke all on function public.search_parking_lots(double precision, double precision, double precision, numeric, numeric, integer, double precision, uuid)
  from public, anon;
grant execute on function public.search_parking_lots(double precision, double precision, double precision, numeric, numeric, integer, double precision, uuid)
  to authenticated;
