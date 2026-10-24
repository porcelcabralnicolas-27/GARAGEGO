-- GarageGo — repara las columnas de bookings que agregaba la 0015/0017 y que faltan del todo.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- La 0026 solo cubría el caso de columnas mal escritas con otro casing (renombrarlas). El
-- error nuevo, "column overtime_minutes does not exist", es distinto: no es un problema de
-- casing, la columna directamente NO EXISTE bajo ningún nombre. Todo indica que la migración
-- 0015 nunca se aplicó completa en esta base — probablemente alguien agregó a mano, desde el
-- Table Editor, solo la columna que hacía falta en ese momento (`actual_end_at`, y encima con
-- el casing mal) y las demás (`overtime_minutes`, `overtime_charge`) nunca se crearon.
--
-- Esto agrega cada columna solo si falta bajo cualquier casing, con el mismo tipo/default que
-- definía la 0015/0017 originalmente. Si ya existe (con el nombre correcto o con otro casing
-- que la 0026 ya corrigió), no hace nada. Seguro de re-correr.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and lower(column_name) = 'actual_end_at'
  ) then
    alter table public.bookings add column actual_end_at timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and lower(column_name) = 'overtime_minutes'
  ) then
    alter table public.bookings add column overtime_minutes integer not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and lower(column_name) = 'overtime_charge'
  ) then
    alter table public.bookings add column overtime_charge numeric(10, 2) not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and lower(column_name) = 'actual_start_at'
  ) then
    alter table public.bookings add column actual_start_at timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and lower(column_name) = 'vehicle_id'
  ) then
    alter table public.bookings add column vehicle_id uuid references public.vehicles (id) on delete set null;
  end if;
end $$;

-- Verificación: lista todas las columnas de bookings tal cual quedaron, para confirmar a ojo
-- que no falta ninguna y que ninguna tiene mayúsculas donde no debería.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'bookings'
order by ordinal_position;
