-- GarageGo — corrige el casing de la columna actual_end_at.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Síntoma: "column actual_End_at of relation bookings does not exist" al finalizar una
-- reserva (tanto del lado del conductor como del propietario).
--
-- Causa: en algún punto la columna quedó creada en la base con otro casing que el de la
-- migración 0015 (`actual_end_at`), probablemente por una edición manual desde el Table Editor
-- que la guardó entre comillas con mayúscula (`"actual_End_at"`). Postgres normaliza a
-- minúsculas cualquier identificador SIN comillas, así que ninguna función que escriba
-- `actual_end_at` (como `_finalize_booking` de la 0024) puede encontrar esa columna aunque el
-- código esté bien escrito: son dos nombres distintos para Postgres.
--
-- Esto busca la columna real (sea cual sea su casing) y la renombra a la forma correcta sin
-- perder los datos que ya tenga. Si no existe en ningún casing, la crea. Idempotente.

do $$
declare
  v_col text;
begin
  select column_name into v_col
  from information_schema.columns
  where table_schema = 'public' and table_name = 'bookings' and lower(column_name) = 'actual_end_at';

  if v_col is null then
    alter table public.bookings add column actual_end_at timestamptz;
  elsif v_col <> 'actual_end_at' then
    execute format('alter table public.bookings rename column %I to actual_end_at', v_col);
  end if;
end $$;

-- Chequeo de la misma clase de problema en las otras columnas que toca el mismo flujo
-- (por si la edición manual afectó a más de una).
do $$
declare
  v_col text;
  v_expected text;
begin
  foreach v_expected in array array['actual_start_at', 'overtime_minutes', 'overtime_charge', 'vehicle_id']
  loop
    select column_name into v_col
    from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and lower(column_name) = v_expected;

    if v_col is not null and v_col <> v_expected then
      execute format('alter table public.bookings rename column %I to %I', v_col, v_expected);
    end if;
  end loop;
end $$;
