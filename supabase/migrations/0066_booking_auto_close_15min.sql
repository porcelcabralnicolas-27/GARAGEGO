-- GarageGo — cierre automático a los 15 minutos, aviso previo y calificación solo con entrada.
-- Requiere pg_cron (ya habilitado para la 0028).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, DROP/CREATE POLICY y
-- unschedule + schedule del job. Re-correr OK.
--
-- ── Qué cambia ───────────────────────────────────────────────────────────────────────────
--   1. auto_close_stale_bookings (0047) cierra las reservas 15 minutos después del final, en
--      vez de 2 horas. Misma liquidación de _finalize_booking, así que:
--        * sin entrada (el conductor no se presentó): se cierra sin excedente y el propietario
--          cobra igual (el lugar quedó bloqueado para otros);
--        * con entrada y sin salida (se olvidó de finalizar): se cobran los 15 minutos de
--          excedente a la tarifa de excedente (1,5 × precio por hora).
--   2. send_booking_end_reminders: 15 minutos antes del final de una reserva en curso le deja
--      al conductor una notificación avisando que se cierra sola y se cobra excedente. Una sola
--      vez por reserva (bookings.end_reminder_sent_at). La app además programa una notificación
--      local en el celular.
--   3. El job de pg_cron pasa a correr cada minuto: cada 15 minutos, el cierre y el aviso
--      podían llegar hasta 15 minutos tarde.
--   4. ratings_insert_own (0001) exige además que la reserva tenga registro de entrada: no se
--      puede calificar una reserva a la que el conductor nunca llegó.

alter table public.bookings add column if not exists end_reminder_sent_at timestamptz;


-- 1. auto_close_stale_bookings -----------------------------------------------------------
-- Igual que la 0047, con margen de 15 minutos.

create or replace function public.auto_close_stale_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_margin interval := interval '15 minutes';
  v_now_local timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_booking record;
  v_closed integer := 0;
begin
  for v_booking in
    select b.id, b.date + b.end_time as scheduled_end
    from public.bookings b
    where b.status = 'confirmed'
      and (b.date + b.end_time) + v_margin < v_now_local
    for update skip locked
  loop
    begin
      perform public._finalize_booking(v_booking.id, v_booking.scheduled_end + v_margin);
      v_closed := v_closed + 1;
    exception when others then
      raise warning 'auto_close_stale_bookings: no se pudo cerrar la reserva %: %', v_booking.id, sqlerrm;
    end;
  end loop;

  return v_closed;
end;
$$;

revoke all on function public.auto_close_stale_bookings() from public, anon, authenticated;


-- 2. send_booking_end_reminders -----------------------------------------------------------
-- El UPDATE ... RETURNING marca y selecciona en un solo paso: si dos corridas se pisaran, la
-- segunda no encuentra la reserva (end_reminder_sent_at ya no es null) y no duplica el aviso.

create or replace function public.send_booking_end_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead interval := interval '15 minutes';
  v_now_local timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_sent integer;
begin
  with due as (
    update public.bookings b
    set end_reminder_sent_at = now()
    where b.status = 'confirmed'
      and b.actual_start_at is not null
      and b.end_reminder_sent_at is null
      and v_now_local >= (b.date + b.end_time) - v_lead
      and v_now_local < (b.date + b.end_time)
    returning b.id, b.user_id, b.end_time
  )
  insert into public.notifications (user_id, title, description, type, related_booking_id)
  select
    due.user_id,
    'Tu reserva termina en 15 minutos',
    format(
      'Termina a las %s. Si no la finalizás, se cierra sola 15 minutos después y se cobran esos 15 minutos como tiempo excedido.',
      to_char(due.end_time, 'HH24:MI')
    ),
    'booking_ending',
    due.id
  from due;

  get diagnostics v_sent = row_count;
  return v_sent;
end;
$$;

revoke all on function public.send_booking_end_reminders() from public, anon, authenticated;


-- 3. Job de pg_cron -------------------------------------------------------------------------
-- Mismo nombre que la 0028, ahora cada minuto y con los dos pasos. Primero el aviso: una
-- reserva que en esta corrida se cierra ya no está en la ventana del aviso, así que no se
-- pisan.

create or replace function public.run_booking_jobs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.send_booking_end_reminders();
  perform public.auto_close_stale_bookings();
end;
$$;

revoke all on function public.run_booking_jobs() from public, anon, authenticated;

select cron.unschedule('garagego-auto-close-bookings')
where exists (select 1 from cron.job where jobname = 'garagego-auto-close-bookings');

select cron.schedule(
  'garagego-auto-close-bookings',
  '* * * * *',
  $$select public.run_booking_jobs()$$
);


-- 4. Calificar solo con registro de entrada ---------------------------------------------------

drop policy if exists ratings_insert_own on public.ratings;
create policy ratings_insert_own on public.ratings for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = ratings.booking_id
        and b.user_id = auth.uid()
        and b.status = 'completed'
        and b.actual_start_at is not null
    )
  );


-- Verificación: el job quedó programado cada minuto.
select jobid, jobname, schedule, active from cron.job where jobname = 'garagego-auto-close-bookings';
