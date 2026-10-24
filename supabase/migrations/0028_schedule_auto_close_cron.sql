-- GarageGo — programa el auto-cierre de reservas olvidadas.
-- Requiere la extensión pg_cron habilitada primero:
--   Supabase Dashboard > Database > Extensions > buscar "pg_cron" > Enable
-- Ejecutar DESPUÉS de eso en Supabase Dashboard > SQL Editor > New query > Run
--
-- Corre auto_close_stale_bookings() (definida en la 0024) cada 15 minutos. Esa función cierra
-- las reservas `confirmed` cuyo horario terminó hace más de 2 horas: cobra el excedente solo
-- hasta ese margen (no hasta el momento en que corre el job) y acredita al propietario, igual
-- que un cierre manual. Sin esto, una reserva que nadie finaliza queda abierta para siempre.
--
-- Idempotente: unschedule + schedule, así que correrlo de nuevo (para cambiar el intervalo,
-- por ejemplo) no duplica el job.

select cron.unschedule('garagego-auto-close-bookings')
where exists (select 1 from cron.job where jobname = 'garagego-auto-close-bookings');

select cron.schedule(
  'garagego-auto-close-bookings',
  '*/15 * * * *',
  $$select public.auto_close_stale_bookings()$$
);

-- Verificación: confirma que el job quedó programado.
select jobid, jobname, schedule, active from cron.job where jobname = 'garagego-auto-close-bookings';
