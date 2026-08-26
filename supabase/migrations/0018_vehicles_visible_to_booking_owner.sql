-- GarageGo — el propietario necesita ver la patente/marca/modelo del vehículo de una reserva
-- que recibió, pero la policy de "vehicles" (0016) solo deja ver el vehículo a su propio dueño.
-- Se agrega una policy adicional: el propietario de un estacionamiento puede ver un vehículo
-- SI ese vehículo está asociado a una reserva hecha en uno de sus estacionamientos (no puede
-- ver vehículos que nunca reservaron con él). Las policies de RLS para un mismo comando (select)
-- se combinan con OR, así que esto se suma a "vehicles_select_own" sin reemplazarla.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: seguro de re-correr.

drop policy if exists vehicles_select_via_booking on public.vehicles;
create policy vehicles_select_via_booking on public.vehicles for select to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      join public.parking_lots p on p.id = b.parking_lot_id
      where b.vehicle_id = vehicles.id
        and p.owner_id = auth.uid()
    )
  );
