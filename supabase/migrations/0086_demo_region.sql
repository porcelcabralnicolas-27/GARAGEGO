-- GarageGo — demo de región "Estados Unidos" (simulada, para la presentación).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, upsert de las cocheras por id fijo y la disponibilidad
-- se reemplaza. Re-correr OK.
--
-- ── Qué es ───────────────────────────────────────────────────────────────────────────────
-- Cada usuario elige en su perfil la región: Argentina (como siempre) o Estados Unidos. La
-- región solo cambia cómo la APP muestra e ingresa los datos (inglés, dólares, hora de Nueva
-- York, ubicación simulada en Manhattan, solo billetera). La base NO cambia de convención:
-- precios en pesos y horarios en hora de Buenos Aires, así reservas, cobros, cierre automático
-- y recordatorios siguen funcionando igual.
--
-- ── Cocheras de demo en Nueva York ───────────────────────────────────────────────────────
-- Cinco cocheras en Manhattan, del propietario de las pruebas. Nombres genéricos (no son
-- negocios reales). Se guardan como cualquier otra:
--   * precio en pesos: con el tipo de cambio fijo de la app (US$ 1 = $1.000) se ven entre
--     US$ 14 y US$ 25 la hora;
--   * disponibilidad todos los días de 10:00 a 22:00 hora de Buenos Aires = 08:00 a 20:00 hora
--     de Nueva York en invierno (de marzo a noviembre, con el horario de verano de EE. UU.,
--     se ven de 09:00 a 21:00).
-- Sin fotos: van al Storage y no se pueden subir desde SQL. Se pueden sumar desde la app del
-- propietario.
--
-- Para borrarlas (si no tienen reservas):
--   delete from public.parking_lots where id::text like 'dddd0086-%';


-- 1. Región del usuario -----------------------------------------------------------------

alter table public.profiles add column if not exists region text not null default 'AR';

alter table public.profiles drop constraint if exists profiles_region_check;
alter table public.profiles add constraint profiles_region_check check (region in ('AR', 'US'));

comment on column public.profiles.region is
  'Región elegida en el perfil (AR / US). Solo cambia la presentación en la app: idioma, moneda, zona horaria y ubicación (0086).';


-- 2. Cocheras de demo en Manhattan ------------------------------------------------------

insert into public.parking_lots
  (id, owner_id, name, description, address, latitude, longitude, price_per_hour, capacity,
   amenities, lot_type, is_active, approval_status, moderation_state)
values
  ('dddd0086-0000-4000-8000-000000000001', 'c6838a83-c035-4d2f-bf87-4717e40bd37d',
   'Midtown Parking · W 34th St',
   'Covered garage two blocks from Penn Station. 24/7 cameras and attendant on site.',
   '360 W 34th St, New York, NY 10001, USA', 40.7527, -73.9960, 18000, 30,
   array['cameras', 'security_staff', 'lighting'], 'lot', true, 'approved', 'live'),
  ('dddd0086-0000-4000-8000-000000000002', 'c6838a83-c035-4d2f-bf87-4717e40bd37d',
   'Theater District Garage · W 44th St',
   'Steps from Times Square and Broadway theaters. EV charging available.',
   '245 W 44th St, New York, NY 10036, USA', 40.7580, -73.9876, 25000, 40,
   array['cameras', 'security_staff', 'lighting', 'ev_charger'], 'lot', true, 'approved', 'live'),
  ('dddd0086-0000-4000-8000-000000000003', 'c6838a83-c035-4d2f-bf87-4717e40bd37d',
   'Chelsea Lot · W 23rd St',
   'Open-air lot near the High Line. Easy in and out.',
   '220 W 23rd St, New York, NY 10011, USA', 40.7448, -73.9957, 15000, 20,
   array['cameras', 'lighting'], 'lot', true, 'approved', 'live'),
  ('dddd0086-0000-4000-8000-000000000004', 'c6838a83-c035-4d2f-bf87-4717e40bd37d',
   'Upper East Parking · E 86th St',
   'Quiet residential garage close to Central Park and the museums.',
   '150 E 86th St, New York, NY 10028, USA', 40.7790, -73.9555, 14000, 15,
   array['cameras', 'lighting', 'restrooms'], 'lot', true, 'approved', 'live'),
  ('dddd0086-0000-4000-8000-000000000005', 'c6838a83-c035-4d2f-bf87-4717e40bd37d',
   'Financial District Garage · Water St',
   'Downtown garage near Wall Street and the Staten Island Ferry.',
   '100 Water St, New York, NY 10005, USA', 40.7043, -74.0072, 22000, 25,
   array['cameras', 'security_staff', 'lighting', 'ev_charger'], 'lot', true, 'approved', 'live')
on conflict (id) do update
  set name = excluded.name,
      description = excluded.description,
      address = excluded.address,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      price_per_hour = excluded.price_per_hour,
      capacity = excluded.capacity,
      amenities = excluded.amenities,
      is_active = true,
      approval_status = 'approved',
      moderation_state = 'live',
      updated_at = now();

-- Todos los días, 10:00 a 22:00 hora de Buenos Aires (08:00 a 20:00 en Nueva York en invierno).
delete from public.parking_availability_recurring where parking_lot_id::text like 'dddd0086-%';
insert into public.parking_availability_recurring (parking_lot_id, day_of_week, start_time, end_time)
select l.id, d, '10:00', '22:00'
from public.parking_lots l, generate_series(0, 6) d
where l.id::text like 'dddd0086-%';
