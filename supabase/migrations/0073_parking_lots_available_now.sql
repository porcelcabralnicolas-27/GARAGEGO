-- GarageGo — "disponible ahora": qué cocheras se pueden usar en este momento.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE. Re-correr OK. No toca tablas ni datos.
--
-- La app pinta el pin del mapa en verde (disponible ahora) o gris (no disponible ahora). Esta
-- función responde esa pregunta para una lista de cocheras. Una cochera está disponible ahora si
-- se cumplen las tres cosas, que son las mismas reglas con las que `_assert_slot_bookable`
-- (0048/0064) aceptaría o rechazaría una reserva que arranque ahora:
--
--   1. Publicación en vivo: activa, aprobada, sin pausa/suspensión del equipo y no archivada.
--   2. El horario de hoy lo permite durante al menos UNA HORA desde ahora (la duración mínima de
--      una reserva). Si hay una excepción para hoy, manda la excepción (un día bloqueado nunca
--      está disponible; un horario especial hay que cubrirlo entero). Si no, hay que estar
--      dentro de una franja recurrente del día de la semana actual.
--   3. Hay lugar: la ocupación máxima de esa hora, contando el margen de 15 minutos de cada
--      reserva pendiente o confirmada, no llega a la capacidad.
--
-- Todo se mide en hora de Argentina (no la del celular ni la del servidor). Si la hora que viene
-- cruza la medianoche, la ventana se recorta a 23:59: los horarios no se guardan pasada esa hora.
--
-- Por qué NO reutiliza `_assert_slot_bookable`: esa función toma un advisory lock por cochera
-- para serializar reservas. Llamarla para listar docenas de cocheras bloquearía reservas reales
-- y haría esperar a la gente. Acá se replica la cuenta sin lock, solo lectura (STABLE).
--
-- Es SECURITY DEFINER porque las reservas de otras personas no son legibles por RLS y hacen
-- falta para contar la ocupación; devuelve solo un sí/no por cochera, nunca datos de reservas.
-- La app replica la misma cuenta de ocupación en src/features/booking/availability.ts para
-- la pantalla de reservar.

create or replace function public.parking_lots_available_now(p_lot_ids uuid[])
returns table (parking_lot_id uuid, available_now boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_buffer constant interval := interval '15 minutes';
  v_min_window constant interval := interval '1 hour';
  v_now timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_date date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_start time := (now() at time zone 'America/Argentina/Buenos_Aires')::time;
  v_end time;
  v_window_end timestamp;
begin
  -- Tope para que nadie pida el cálculo de toda la tabla de una vez.
  if coalesce(cardinality(p_lot_ids), 0) > 200 then
    raise exception 'too_many_lots' using errcode = '22023';
  end if;

  -- Fin de la ventana: una hora desde ahora, recortada a las 23:59 si cruza la medianoche.
  if (v_now + v_min_window)::date > v_date then
    v_end := time '23:59';
  else
    v_end := (v_now + v_min_window)::time;
  end if;
  v_window_end := v_date + v_end;

  return query
  select
    l.id,
    (
      -- 1. Publicación en vivo.
      l.is_active
      and l.approval_status = 'approved'
      and l.moderation_state = 'live'
      and l.archived_at is null

      -- 2. Horario de hoy.
      and case
        when exists (
          select 1 from public.parking_availability_exceptions e
          where e.parking_lot_id = l.id and e.date = v_date
        ) then
          -- Excepción para hoy: manda la excepción. Un bloqueo anula cualquier horario especial.
          not exists (
            select 1 from public.parking_availability_exceptions e
            where e.parking_lot_id = l.id and e.date = v_date and not e.is_available
          )
          and exists (
            select 1 from public.parking_availability_exceptions e
            where e.parking_lot_id = l.id
              and e.date = v_date
              and e.is_available
              and e.start_time is not null
              and e.end_time is not null
              and e.start_time <= v_start
              and e.end_time >= v_end
          )
        else
          exists (
            select 1 from public.parking_availability_recurring r
            where r.parking_lot_id = l.id
              and r.day_of_week = extract(dow from v_date)::smallint
              and r.start_time <= v_start
              and r.end_time >= v_end
          )
      end

      -- 3. Lugar libre: ocupación máxima de la ventana < capacidad. La ocupación solo sube en el
      -- inicio de la ventana o en el inicio de alguna reserva que la pise, así que alcanza con
      -- medirla en esos puntos (misma cuenta que `_assert_slot_bookable`, 0064).
      and coalesce((
        select max(
          (
            select count(*)
            from public.bookings b
            where b.parking_lot_id = l.id
              and b.status in ('pending', 'confirmed')
              and tsrange(b.date + b.start_time - v_buffer, b.date + b.end_time + v_buffer) @> pt.t
          )
        )
        from (
          select v_now as t
          union
          select b2.date + b2.start_time - v_buffer
          from public.bookings b2
          where b2.parking_lot_id = l.id
            and b2.status in ('pending', 'confirmed')
            and tsrange(b2.date + b2.start_time - v_buffer, b2.date + b2.end_time + v_buffer)
                && tsrange(v_now, v_window_end)
            and b2.date + b2.start_time - v_buffer > v_now
        ) pt
      ), 0) < l.capacity
    ) as available_now
  from public.parking_lots l
  where l.id = any(p_lot_ids);
end;
$$;

revoke all on function public.parking_lots_available_now(uuid[]) from public, anon;
grant execute on function public.parking_lots_available_now(uuid[]) to authenticated;

-- Verificación: ver cuáles de las cocheras publicadas están disponibles ahora.
-- select l.name, a.available_now
-- from public.parking_lots l
-- join public.parking_lots_available_now(array(select id from public.parking_lots)) a
--   on a.parking_lot_id = l.id
-- order by a.available_now desc, l.name;
