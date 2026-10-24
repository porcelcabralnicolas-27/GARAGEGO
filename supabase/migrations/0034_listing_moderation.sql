-- GarageGo — moderación de publicaciones: aprobación previa + estado operativo del admin.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY IF EXISTS. Re-correr es seguro.
--
-- ── Contexto ────────────────────────────────────────────────────────────────────────────
-- `parking_lots` hoy solo tiene `is_active`, y ese campo YA está ocupado: el asistente de
-- publicación (`ParkingListingWizard.tsx` / `createParkingLot`) crea la cochera con
-- `is_active = false` como borrador y la activa al terminar. No sirve para "aprobada por el
-- equipo". Por eso la aprobación y el estado operativo son campos nuevos:
--
--   approval_status   ciclo de revisión de alta:  pending → approved | rejected | changes_requested
--   moderation_state  palanca operativa del admin sobre una cochera ya aprobada:
--                     live | paused_by_admin | suspended
--
-- Las tres dimensiones son independientes y TODAS tienen que dar verde para que una cochera
-- aparezca en la búsqueda:  is_active (el dueño la publicó)  ∧  approval_status = 'approved'
-- (el equipo la revisó)  ∧  moderation_state = 'live' (el admin no la frenó).

-- 1. Columnas de moderación -------------------------------------------------------------
alter table public.parking_lots
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected', 'changes_requested')),
  add column if not exists rejection_reason text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles (id),
  add column if not exists moderation_state text not null default 'live'
    check (moderation_state in ('live', 'paused_by_admin', 'suspended')),
  add column if not exists pause_reason text,
  add column if not exists suspended_until timestamptz;

-- Backfill: todo lo que ya estaba publicado se da por aprobado y en vivo (el default de
-- moderation_state ya deja 'live', así que solo hace falta tocar approval_status).
update public.parking_lots
  set approval_status = 'approved'
  where is_active and approval_status = 'pending';

-- La búsqueda filtra por estas dos columnas en cada consulta: índice parcial chico.
create index if not exists parking_lots_visible_idx
  on public.parking_lots (approval_status, moderation_state)
  where is_active;

-- 2. Helper is_admin() -----------------------------------------------------------------
-- `security definer` + `stable`: se usa dentro de policies y de las RPC de moderación sin
-- arrastrar la RLS de `profiles` ni recomputar por fila. `profiles_select_all` (0001) ya
-- permitiría el select, pero encapsularlo acá deja un único punto de verdad.
create or replace function public.is_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = p_user), false);
$$;

grant execute on function public.is_admin(uuid) to authenticated;

-- 3. Policy de lectura pública: ahora exige aprobación y estado en vivo ------------------
-- OJO recursión: no se puede referenciar `bookings` acá porque `bookings_select` (0001)
-- referencia `parking_lots` y Postgres aborta con "infinite recursion detected in policy".
-- El conductor con una reserva sobre una cochera que el admin pausó a mitad de sesión se
-- resuelve del lado de la app (getClientBooking tolera lote no visible), no acá.
drop policy if exists parking_lots_select_public on public.parking_lots;
create policy parking_lots_select_public on public.parking_lots for select to authenticated
  using (
    (is_active and approval_status = 'approved' and moderation_state = 'live')
    or owner_id = auth.uid()
    or public.is_admin(auth.uid())
  );

-- Imágenes: el admin necesita verlas para revisar una cochera que todavía no está pública.
drop policy if exists parking_images_select on public.parking_images;
create policy parking_images_select on public.parking_images for select to authenticated
  using (exists (
    select 1 from public.parking_lots p
    where p.id = parking_images.parking_lot_id
      and (p.is_active or p.owner_id = auth.uid() or public.is_admin(auth.uid()))
  ));

-- 4. search_parking_lots: mismo filtro que la policy -----------------------------------
-- Misma firma y mismo tipo de retorno que 0032: solo cambia el WHERE.
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
    and p.owner_id is distinct from auth.uid()
    and st_dwithin(p.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000)
    and (p_max_price is null or p.price_per_hour <= p_max_price)
    and (p_min_rating is null or p.rating_avg >= p_min_rating)
  order by distance_km asc;
$$;

grant execute on function public.search_parking_lots(double precision, double precision, double precision, numeric, numeric)
  to authenticated;
