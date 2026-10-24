-- GarageGo — la búsqueda no devuelve las cocheras del propio usuario.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: solo CREATE OR REPLACE, misma firma y mismo tipo de retorno.
--
-- Al conductor le aparecían en el mapa y en los resultados sus propias publicaciones, que no
-- puede reservar: `create_booking` las rechaza con "No podés reservar tu propio estacionamiento".
-- Se filtra acá, en la RPC, y no en cada pantalla, para que valga por igual para el mapa nativo,
-- el mapa web y la lista de resultados sin depender de que cada una se acuerde de filtrar.
--
-- `is distinct from` y no `<>`: si `auth.uid()` fuese null, `owner_id <> null` da NULL y el
-- WHERE descartaría TODAS las filas, dejando la búsqueda vacía.

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
    and p.owner_id is distinct from auth.uid()
    and st_dwithin(p.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000)
    and (p_max_price is null or p.price_per_hour <= p_max_price)
    and (p_min_rating is null or p.rating_avg >= p_min_rating)
  order by distance_km asc;
$$;

grant execute on function public.search_parking_lots(double precision, double precision, double precision, numeric, numeric)
  to authenticated;
