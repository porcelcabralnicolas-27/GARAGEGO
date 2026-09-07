-- GarageGo — el cargo por tiempo excedido no puede vaciar la billetera ni crecer sin techo.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: solo CREATE OR REPLACE de _finalize_booking (misma firma). Seguro de re-correr.
--
-- Dos bugs que aparecen con una reserva vieja sin finalizar (ej. 68 h de exceso):
--
--   1. `_finalize_booking` debitaba el cargo por exceso con `balance = balance - cargo` sin
--      mirar el saldo. Con muchas horas de exceso el cargo es enorme y el UPDATE viola el
--      constraint `wallets_balance_check` (balance >= 0). Resultado: "Finalizar" falla con
--      "new row for relation wallets violates check constraint" tanto para el conductor como
--      para el propietario.
--
--   2. `auto_close_stale_bookings()` llama a `_finalize_booking` dentro de un loop. Ese mismo
--      error aborta TODA la función, así que el cron nunca cerró ninguna reserva — por eso la
--      reserva quedó abierta días a pesar de estar programado cada 15 min.
--
-- Arreglo:
--   a. El exceso que se cobra se topea a 2 h (v_max_overtime). Da igual si la reserva se
--      cierra sola o si alguien toca "Finalizar" tres días después: el medidor se corta 2 h
--      después del horario de fin. Coincide con el margen del auto-cierre.
--   b. Si el saldo no alcanza para ese cargo topeado, se cobra lo que haya (la billetera queda
--      en 0). No hay pasarela real para perseguir la diferencia; en este MVP el penalti no
--      cobrado se pierde. Lo que se guarda en `bookings.overtime_charge` y lo que se avisa por
--      notificación es el monto realmente cobrado, para que cuadre con la billetera.
--   c. `actual_end_at` sigue siendo la hora real de cierre (no la topeada): es el registro de
--      cuándo se cerró, no cuánto se cobró.

create or replace function public._finalize_booking(p_booking_id uuid, p_closed_at_local timestamp)
returns table (overtime_minutes integer, overtime_charge numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grace interval := interval '5 minutes';
  v_max_overtime interval := interval '2 hours';
  v_overtime_rate_multiplier numeric := 1.5;
  v_owner_id uuid;
  v_client_id uuid;
  v_price_per_hour numeric;
  v_total_price numeric;
  v_scheduled_end timestamp;
  v_charge_until timestamp;
  v_overtime_minutes integer := 0;
  v_overtime_charge numeric := 0;
  v_overtime_collected numeric := 0;
  v_client_wallet_id uuid;
  v_client_balance numeric;
  v_owner_wallet_id uuid;
begin
  select p.owner_id, p.price_per_hour, b.user_id, b.total_price, b.date + b.end_time
  into v_owner_id, v_price_per_hour, v_client_id, v_total_price, v_scheduled_end
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  where b.id = p_booking_id;

  -- El exceso se mide hasta el cierre, pero nunca más allá del techo de 2 h.
  v_charge_until := least(p_closed_at_local, v_scheduled_end + v_max_overtime);

  if v_charge_until > v_scheduled_end + v_grace then
    v_overtime_minutes := ceil(extract(epoch from (v_charge_until - v_scheduled_end)) / 60.0);
    v_overtime_charge := round((v_overtime_minutes * (v_price_per_hour * v_overtime_rate_multiplier / 60.0))::numeric, 2);
  end if;

  -- Cargo del excedente al conductor, topeado a lo que tenga en la billetera.
  if v_overtime_charge > 0 then
    select id, balance into v_client_wallet_id, v_client_balance
    from public.wallets where user_id = v_client_id for update;

    if v_client_wallet_id is not null then
      v_overtime_collected := least(v_overtime_charge, v_client_balance);
      if v_overtime_collected > 0 then
        update public.wallets set balance = balance - v_overtime_collected, updated_at = now()
        where id = v_client_wallet_id;

        insert into public.wallet_transactions (wallet_id, type, amount, related_booking_id, status)
        values (v_client_wallet_id, 'overtime_charge', -v_overtime_collected, p_booking_id, 'completed');
      end if;
    end if;

    insert into public.notifications (user_id, title, description, type, related_booking_id)
    values (
      v_client_id,
      'Cargo por tiempo excedido',
      format('Te quedaste %s minutos más de lo reservado. Se debitaron $%s de tu billetera.',
             v_overtime_minutes, v_overtime_collected),
      'overtime_charged',
      p_booking_id
    );
  end if;

  update public.bookings
  set status = 'completed',
      actual_end_at = p_closed_at_local at time zone 'America/Argentina/Buenos_Aires',
      overtime_minutes = v_overtime_minutes,
      overtime_charge = v_overtime_collected
  where id = p_booking_id;

  -- Acreditación al propietario (Q10). Solo total_price: el excedente no se le acredita.
  select id into v_owner_wallet_id from public.wallets where user_id = v_owner_id for update;
  if v_owner_wallet_id is not null then
    update public.wallets set balance = balance + v_total_price, updated_at = now()
    where id = v_owner_wallet_id;

    insert into public.wallet_transactions (wallet_id, type, amount, related_booking_id, status)
    values (v_owner_wallet_id, 'earning', v_total_price, p_booking_id, 'completed');
  end if;

  insert into public.notifications (user_id, title, description, type, related_booking_id)
  values (
    v_owner_id,
    'Cobro acreditado',
    format('Se acreditaron $%s a tu billetera por una reserva finalizada.', v_total_price),
    'booking_completed',
    p_booking_id
  );

  return query select v_overtime_minutes, v_overtime_collected;
end;
$$;

revoke all on function public._finalize_booking(uuid, timestamp) from public;

-- Cierra ya mismo las reservas que quedaron trabadas por el bug (sin esperar al cron).
select public.auto_close_stale_bookings();
