-- GarageGo — borra las excepciones de disponibilidad (días bloqueados) cuya fecha ya pasó.
-- Requiere pg_cron (ya habilitado para la 0028).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE y re-programación del job. Re-correr OK.
--
-- Un día bloqueado que ya pasó no sirve para nada: el servidor solo mira excepciones de fechas
-- futuras al validar una reserva. Se limpian una vez por día (03:05, hora de Buenos Aires) y,
-- como la app además las oculta en la lista del propietario, no hace falta esperar al job.

create or replace function public.purge_past_availability_exceptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.parking_availability_exceptions
  where date < (now() at time zone 'America/Argentina/Buenos_Aires')::date;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_past_availability_exceptions() from public, anon, authenticated;

-- Limpieza inicial: borra ya las que se acumularon.
select public.purge_past_availability_exceptions() as excepciones_borradas;

select cron.unschedule('garagego-purge-past-exceptions')
where exists (select 1 from cron.job where jobname = 'garagego-purge-past-exceptions');

-- 06:05 UTC = 03:05 en Buenos Aires.
select cron.schedule(
  'garagego-purge-past-exceptions',
  '5 6 * * *',
  $$select public.purge_past_availability_exceptions()$$
);

-- Verificación: el job quedó programado.
select jobid, jobname, schedule, active from cron.job where jobname = 'garagego-purge-past-exceptions';
