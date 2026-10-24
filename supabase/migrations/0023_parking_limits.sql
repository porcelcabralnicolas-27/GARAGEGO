-- GarageGo — máximo de 3 fotos por publicación + horarios recurrentes sin duplicados.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: DROP + CREATE OR REPLACE / IF NOT EXISTS. Seguro de re-correr.

-- 1. Máximo 3 fotos por estacionamiento --------------------------------------------------
-- Mismo patrón que enforce_max_vehicles (0016_vehicles.sql): un límite de cantidad no se
-- puede expresar con un CHECK simple, así que se valida con un trigger antes de insertar.

create or replace function public.enforce_max_parking_images()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.parking_images where parking_lot_id = new.parking_lot_id) >= 3 then
    raise exception 'max_parking_images_reached';
  end if;
  return new;
end;
$$;

drop trigger if exists parking_images_max_three on public.parking_images;
create trigger parking_images_max_three
  before insert on public.parking_images
  for each row execute function public.enforce_max_parking_images();

-- 2. Horarios recurrentes: sin día+horario repetido ---------------------------------------
-- El front ya valida solapamiento contra lo cargado en memoria; este índice único es la red
-- de seguridad del lado del servidor (por ejemplo si dos pestañas del propietario agregan el
-- mismo horario a la vez). Antes de crear el índice hay que borrar duplicados EXACTOS que ya
-- pudieran existir, si no la migración fallaría al intentar crear un índice único sobre datos
-- que ya lo violan.

delete from public.parking_availability_recurring a
using public.parking_availability_recurring b
where a.id > b.id
  and a.parking_lot_id = b.parking_lot_id
  and a.day_of_week = b.day_of_week
  and a.start_time = b.start_time
  and a.end_time = b.end_time;

create unique index if not exists parking_availability_recurring_no_dupes
  on public.parking_availability_recurring (parking_lot_id, day_of_week, start_time, end_time);
