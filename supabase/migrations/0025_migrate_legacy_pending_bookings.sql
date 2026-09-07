-- GarageGo — promueve las reservas 'pending' que quedaron del modelo viejo (Fase 8.6).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: si no queda ninguna 'pending', no hace nada.
--
-- Por qué hace falta:
--   Desde la 0024, `create_booking` crea las reservas directamente en 'confirmed' y se quitó
--   el paso de aprobación del propietario (Q1·A). Pero las reservas que se crearon ANTES de
--   esa migración quedaron en 'pending', y en ese estado están muertas:
--     · el conductor ya pagó (create_booking le debitó la billetera),
--     · `start_booking` exige 'confirmed', así que no puede usar el lugar,
--     · el propietario ya no tiene botón "Confirmar" en la app,
--     · y como nunca se finalizan, tampoco se le acredita nada al propietario.
--
--   Se promueven a 'confirmed', que es el estado que habrían tenido si se hubieran creado hoy.
--   Las canceladas y finalizadas no se tocan.

update public.bookings
set status = 'confirmed'
where status = 'pending';

-- Para verificar antes de correrlo, en una query aparte:
--   select id, date, start_time, end_time, total_price from public.bookings where status = 'pending';
