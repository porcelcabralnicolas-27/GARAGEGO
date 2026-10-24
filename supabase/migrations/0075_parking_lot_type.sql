-- GarageGo — tipo de publicación: cochera de casa o estacionamiento.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS y DROP/CREATE de la búsqueda.
-- Re-correr OK.
--
-- Hasta acá todas las publicaciones eran iguales. El propietario ahora indica si lo que ofrece es:
--   * 'house' → una cochera de casa (un particular que alquila el espacio de su casa);
--   * 'lot'   → un estacionamiento (un predio o playa de estacionamiento).
-- La app dibuja un ícono distinto en el mapa para cada tipo (casa / edificio con cocheras) y lo
-- muestra en la ficha.
--
-- Las publicaciones que ya existen quedan como 'lot' (estacionamiento): es el valor por defecto y
-- el propietario lo puede cambiar al editar la publicación (paso "Tarifa y servicios").
--
-- Se agrega `lot_type` a lo que devuelve `search_parking_lots` para que el mapa y la lista sepan qué
-- ícono usar sin pedir cada cochera por separado. Cambia el tipo de retorno de la función, así que
-- hay que borrarla y volver a crearla; el resto (filtros, paginación, permisos) queda igual que en la
-- 0059.

alter table public.parking_lots add column if not exists lot_type text not null default 'lot';

alter table public.parking_lots drop constraint if exists parking_lots_lot_type_check;
alter table public.parking_lots add constraint parking_lots_lot_type_check
  check (lot_type in ('house', 'lot'));


drop function if exists public.search_parking_lots(double precision, double precision, double precision, numeric, numeric, integer, double precision, uuid);

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
        least(coalesce(p_radius_km, 5), 25) * 1000
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
