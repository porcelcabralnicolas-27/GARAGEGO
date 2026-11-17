-- GarageGo — demo regional: el máximo de 3 vehículos es por país.
-- Requiere la 0016 (límite de vehículos) y la 0090 (vehicles.region).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE (mismo trigger y misma función que la 0016). Re-correr OK.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────────────────
-- Desde la 0090 cada vehículo es de un país y la app muestra solo los del país activo, pero el
-- trigger de la 0016 seguía contando TODOS: con 2 autos en Argentina, en Estados Unidos se podía
-- cargar uno solo. Ahora se pueden tener 3 en Argentina y 3 en Estados Unidos.
--
-- El país se toma del perfil (igual que `set_vehicle_region`, 0090) y no de `new.region`: los
-- triggers corren por orden alfabético y `vehicles_max_three` corre antes que
-- `vehicles_set_region`, así que acá `new.region` todavía tiene el valor por defecto.

create or replace function public.enforce_max_vehicles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_region text := coalesce((select region from public.profiles where id = new.user_id), 'AR');
begin
  if (select count(*) from public.vehicles where user_id = new.user_id and region = v_region) >= 3 then
    raise exception 'max_vehicles_reached';
  end if;
  return new;
end;
$$;
