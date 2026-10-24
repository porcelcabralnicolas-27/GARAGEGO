-- GarageGo — vehículos del usuario (máximo 3 por usuario) + fotos
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Este script es IDEMPOTENTE: se puede correr las veces que haga falta sin
-- error, aunque una corrida anterior haya quedado a mitad de camino (por
-- ejemplo si se cortó en "la tabla ya existe"). Cada CREATE está protegido
-- con IF NOT EXISTS, y cada policy se borra primero (si existía) y se vuelve
-- a crear, así queda siempre en el estado final correcto.

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plate text not null check (char_length(trim(plate)) > 0),
  brand text,
  model text,
  color text,
  created_at timestamptz not null default now(),
  unique (user_id, plate)
);

create index if not exists vehicles_user_idx on public.vehicles (user_id);

-- Límite de 3 vehículos por usuario: no se puede expresar con un check simple,
-- así que se valida con un trigger antes de insertar.
create or replace function public.enforce_max_vehicles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.vehicles where user_id = new.user_id) >= 3 then
    raise exception 'max_vehicles_reached';
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_max_three on public.vehicles;
create trigger vehicles_max_three
  before insert on public.vehicles
  for each row execute function public.enforce_max_vehicles();

alter table public.vehicles enable row level security;

-- Cada usuario ve y administra solo sus propios vehículos.
drop policy if exists vehicles_select_own on public.vehicles;
create policy vehicles_select_own on public.vehicles for select to authenticated
  using (user_id = auth.uid());

drop policy if exists vehicles_insert_own on public.vehicles;
create policy vehicles_insert_own on public.vehicles for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists vehicles_update_own on public.vehicles;
create policy vehicles_update_own on public.vehicles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists vehicles_delete_own on public.vehicles;
create policy vehicles_delete_own on public.vehicles for delete to authenticated
  using (user_id = auth.uid());

-- ============ FOTOS DEL VEHÍCULO ============
create table if not exists public.vehicle_images (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  storage_path text not null,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_images_vehicle_idx on public.vehicle_images (vehicle_id);

alter table public.vehicle_images enable row level security;

-- Hereda la propiedad del vehículo padre (mismo criterio que parking_images con parking_lots).
drop policy if exists vehicle_images_select_own on public.vehicle_images;
create policy vehicle_images_select_own on public.vehicle_images for select to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_images.vehicle_id and v.user_id = auth.uid()));

drop policy if exists vehicle_images_write_own on public.vehicle_images;
create policy vehicle_images_write_own on public.vehicle_images for all to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_images.vehicle_id and v.user_id = auth.uid()))
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_images.vehicle_id and v.user_id = auth.uid()));

-- Bucket de Storage para fotos de vehículos (mismo patrón que parking-images: público,
-- ruta {auth.uid()}/{vehicle_id}/archivo, solo el dueño puede subir/borrar en su propia carpeta).
insert into storage.buckets (id, name, public)
values ('vehicle-images', 'vehicle-images', true)
on conflict (id) do nothing;

drop policy if exists "vehicle_images_public_read" on storage.objects;
create policy "vehicle_images_public_read"
  on storage.objects for select
  using (bucket_id = 'vehicle-images');

drop policy if exists "vehicle_images_owner_insert" on storage.objects;
create policy "vehicle_images_owner_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "vehicle_images_owner_delete" on storage.objects;
create policy "vehicle_images_owner_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'vehicle-images' and (storage.foldername(name))[1] = auth.uid()::text);
