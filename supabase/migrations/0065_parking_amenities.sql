-- GarageGo — servicios de la cochera.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS y DROP CONSTRAINT IF EXISTS. Re-correr OK.
--
-- El propietario marca qué servicios tiene su cochera (opcional: puede no marcar ninguno). Se
-- guardan como una lista de códigos; las etiquetas viven en shared/domain.ts (AMENITY_LABELS),
-- que tiene que listar exactamente los mismos códigos que el check de acá.

alter table public.parking_lots add column if not exists amenities text[] not null default '{}';

alter table public.parking_lots drop constraint if exists parking_lots_amenities_valid;
alter table public.parking_lots add constraint parking_lots_amenities_valid check (
  amenities <@ array['cameras', 'security_staff', 'lighting', 'ev_charger', 'restrooms']::text[]
);
