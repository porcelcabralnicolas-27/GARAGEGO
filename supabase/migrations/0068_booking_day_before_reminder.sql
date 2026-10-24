-- GarageGo — recordatorio un día antes de una reserva futura.
-- Requiere pg_cron (ya habilitado para la 0028) y la 0066.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS y CREATE OR REPLACE. Re-correr OK.
--
-- 24 horas antes del inicio de una reserva confirmada que todavía no empezó, el conductor recibe
-- una notificación en la lista de la app ("Tenés una reserva mañana"). Una sola vez por reserva
-- (bookings.day_before_reminder_sent_at). La app además programa una notificación local en el
-- celular, como con el aviso de fin de reserva de la 0066.
--
-- Una reserva hecha con menos de 24 horas de anticipación no recibe este aviso: ya la acaba de
-- crear, y decirle "mañana" a alguien que reservó para dentro de dos horas sería confuso.

alter table public.bookings add column if not exists day_before_reminder_sent_at timestamptz;


create or replace function public.send_booking_day_before_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead interval := interval '24 hours';
  v_now_local timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_sent integer;
begin
  -- El UPDATE ... RETURNING marca y selecciona en un solo paso: si dos corridas se pisaran, la
  -- segunda no encuentra la reserva (day_before_reminder_sent_at ya no es null).
  with due as (
    update public.bookings b
    set day_before_reminder_sent_at = now()
    from public.parking_lots p
    where p.id = b.parking_lot_id
      and b.status = 'confirmed'
      and b.actual_start_at is null
      and b.day_before_reminder_sent_at is null
      and v_now_local >= (b.date + b.start_time) - v_lead
      and v_now_local < (b.date + b.start_time)
      and (b.created_at at time zone 'America/Argentina/Buenos_Aires') <= (b.date + b.start_time) - v_lead
    returning b.id, b.user_id, b.date, b.start_time, p.name as lot_name
  )
  insert into public.notifications (user_id, title, description, type, related_booking_id)
  select
    due.user_id,
    'Tenés una reserva mañana',
    format('Tu reserva en %s es el %s a las %s.', due.lot_name, to_char(due.date, 'DD/MM/YYYY'), to_char(due.start_time, 'HH24:MI')),
    'booking_reminder',
    due.id
  from due;

  get diagnostics v_sent = row_count;
  return v_sent;
end;
$$;

revoke all on function public.send_booking_day_before_reminders() from public, anon, authenticated;


-- El job de pg_cron (0066) ahora corre también este aviso.
create or replace function public.run_booking_jobs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.send_booking_day_before_reminders();
  perform public.send_booking_end_reminders();
  perform public.auto_close_stale_bookings();
end;
$$;

revoke all on function public.run_booking_jobs() from public, anon, authenticated;
