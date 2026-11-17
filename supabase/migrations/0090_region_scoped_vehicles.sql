-- GarageGo — demo regional: los vehículos también son de un país.
-- Requiere la 0086 (profiles.region) y la 0087 (datos separados por país).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, DROP IF EXISTS y CREATE OR REPLACE. Re-correr OK.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────────────────
-- Hasta acá, en la región Estados Unidos aparecían los autos cargados en Argentina (con patentes
-- argentinas). Ahora cada vehículo es del país en el que estaba el usuario al cargarlo, y "Mis
-- vehículos" y la elección de vehículo al reservar muestran solo los de la región activa. Nada se
-- borra: al volver de región, vuelven a aparecer.
--
-- Los que ya existen quedan como de Argentina (donde se cargaron todos hasta la demo regional).

alter table public.vehicles add column if not exists region text not null default 'AR';
alter table public.vehicles drop constraint if exists vehicles_region_check;
alter table public.vehicles add constraint vehicles_region_check check (region in ('AR', 'US'));

create index if not exists vehicles_user_region_idx on public.vehicles (user_id, region);

-- Un vehículo nuevo es del país del perfil al cargarlo (el cliente no lo elige).
create or replace function public.set_vehicle_region()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.region := coalesce((select region from public.profiles where id = new.user_id), 'AR');
  return new;
end;
$$;

revoke all on function public.set_vehicle_region() from public, anon, authenticated;

drop trigger if exists vehicles_set_region on public.vehicles;
create trigger vehicles_set_region
  before insert on public.vehicles
  for each row execute function public.set_vehicle_region();

-- Tampoco se puede cambiar de país después.
create or replace function public.protect_vehicle_region()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.region := old.region;
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_protect_region on public.vehicles;
create trigger vehicles_protect_region
  before update on public.vehicles
  for each row execute function public.protect_vehicle_region();
