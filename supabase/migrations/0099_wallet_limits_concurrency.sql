-- GarageGo — el tope de saldo se respeta también con recargas de Mercado Pago simultáneas.
-- Requiere 0084 (Mercado Pago), 0088 (profiles.deleted_at) y 0093 (límites configurables).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE con las mismas firmas. Re-correr es seguro.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────────────────
-- Antes, `begin_mp_topup` miraba el saldo sin bloquear la billetera y `apply_mp_payment` acreditaba
-- sin volver a mirar el tope. Con varias recargas abiertas a la vez (o pagadas a la vez) el saldo
-- podía pasar el máximo configurado.
--   1. `begin_mp_topup` bloquea la billetera (FOR UPDATE) y cuenta el saldo MÁS lo de las recargas
--      abiertas sin vencer. Si no entra: `topup_limit_reached` (solo con el saldo) o
--      `topup_pending_limit` (por las recargas que todavía esperan el pago). El máximo de recargas
--      abiertas (3) se cuenta con la billetera bloqueada, así dos pedidos simultáneos no lo pasan.
--      Las vencidas no cuentan.
--   2. `apply_mp_payment` (recarga) bloquea la billetera antes de decidir, vuelve a leer el tope
--      vigente y no acredita si se pasaría o si la cuenta fue eliminada: el pago queda
--      `refund_required` (motivo `limit_exceeded` o `account_deleted`) y la Edge Function lo
--      devuelve, como ya hacía con los importes que no coinciden.
-- La idempotencia no cambia: los índices únicos de la 0084 siguen evitando acreditar dos veces el
-- mismo pago. La recarga de prueba `topup_wallet` no se toca (ya bloqueaba la billetera).


-- 1. begin_mp_topup ------------------------------------------------------------------------------
create or replace function public.begin_mp_topup(p_amount numeric)
returns table (attempt_id uuid, amount numeric, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min_topup numeric := public.setting_numeric('topup_min', 100);
  v_max_topup numeric := public.setting_numeric('topup_max', 50000);
  v_max_balance numeric := public.setting_numeric('wallet_max_balance', 200000);
  v_max_open constant integer := 3;
  v_window constant interval := interval '30 minutes';
  v_user_id uuid := auth.uid();
  v_amount numeric := round(p_amount, 2);
  v_balance numeric;
  v_open_count integer;
  v_open_amount numeric;
  v_attempt_id uuid;
  v_expires_at timestamptz := now() + v_window;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;
  if v_amount is null or v_amount < v_min_topup or v_amount > v_max_topup then
    raise exception 'invalid_topup_amount';
  end if;

  -- Con la billetera bloqueada, dos pedidos simultáneos del mismo usuario se resuelven de a uno.
  select balance into v_balance from public.wallets where user_id = v_user_id for update;
  if v_balance is null then
    raise exception 'No se encontró tu billetera';
  end if;
  if v_balance + v_amount > v_max_balance then
    raise exception 'topup_limit_reached';
  end if;

  select count(*)::integer, coalesce(sum(a.amount), 0)
  into v_open_count, v_open_amount
  from public.mp_checkout_attempts a
  where a.user_id = v_user_id and a.kind = 'topup' and a.status = 'created' and a.expires_at > now();

  if v_open_count >= v_max_open then
    raise exception 'too_many_open_topups';
  end if;
  if v_balance + v_open_amount + v_amount > v_max_balance then
    raise exception 'topup_pending_limit';
  end if;

  insert into public.mp_checkout_attempts (kind, user_id, amount, expires_at)
  values ('topup', v_user_id, v_amount, v_expires_at)
  returning id into v_attempt_id;

  return query select v_attempt_id, v_amount, v_expires_at;
end;
$$;

revoke all on function public.begin_mp_topup(numeric) from public, anon;
grant execute on function public.begin_mp_topup(numeric) to authenticated;


-- 2. apply_mp_payment ----------------------------------------------------------------------------
-- Igual a la de la 0084, salvo la rama de recarga: candado de billetera antes de decidir, tope
-- vigente y cuenta eliminada.
create or replace function public.apply_mp_payment(
  p_attempt_id uuid,
  p_payment_id text,
  p_order_id text,
  p_status text,
  p_status_detail text,
  p_amount numeric,
  p_currency text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_attempt public.mp_checkout_attempts%rowtype;
  v_booking record;
  v_payment public.mp_payments%rowtype;
  v_wallet_id uuid;
  v_balance numeric;
  v_max_balance numeric;
  v_deleted boolean := false;
  v_amount_ok boolean;
  v_reason text;
  v_rows integer;
begin
  if p_payment_id is null or p_status is null then
    raise exception 'Pago inválido';
  end if;

  -- Orden de locks: primero la reserva (si es de reserva), después el intento.
  select booking_id into v_booking_id from public.mp_checkout_attempts where id = p_attempt_id;
  if not found then
    return 'unknown_attempt';
  end if;

  if v_booking_id is not null then
    select b.id, b.user_id, b.status, b.payment_method, b.total_price, p.owner_id
    into v_booking
    from public.bookings b
    join public.parking_lots p on p.id = b.parking_lot_id
    where b.id = v_booking_id
    for update of b;
  end if;

  select * into v_attempt from public.mp_checkout_attempts where id = p_attempt_id for update;

  insert into public.mp_payments
    (mp_payment_id, mp_order_id, attempt_id, booking_id, status, status_detail, amount, currency)
  values
    (p_payment_id, p_order_id, p_attempt_id, v_attempt.booking_id, p_status, p_status_detail, p_amount, p_currency)
  on conflict (mp_payment_id) do update
    set status = excluded.status,
        status_detail = excluded.status_detail,
        amount = coalesce(excluded.amount, mp_payments.amount),
        currency = coalesce(excluded.currency, mp_payments.currency),
        mp_order_id = coalesce(excluded.mp_order_id, mp_payments.mp_order_id),
        updated_at = now();

  select * into v_payment from public.mp_payments where mp_payment_id = p_payment_id for update;

  if v_payment.attempt_id <> p_attempt_id then
    raise exception 'El pago % pertenece a otro intento', p_payment_id;
  end if;
  if v_payment.applied then
    return 'already_applied';
  end if;
  if p_status <> 'approved' then
    return 'recorded';
  end if;
  if v_payment.refund_status = 'done' then
    return 'already_refunded';
  end if;
  if v_payment.refund_status in ('required', 'failed') then
    return 'refund_required';
  end if;

  v_amount_ok := upper(coalesce(p_currency, '')) = 'ARS' and round(p_amount, 2) = v_attempt.amount;

  -- Recarga.
  if v_attempt.kind = 'topup' then
    -- La billetera se bloquea ANTES de decidir (0099): dos recargas aprobadas a la vez se acreditan
    -- de a una, y la segunda ve el saldo que dejó la primera.
    select id, balance into v_wallet_id, v_balance from public.wallets where user_id = v_attempt.user_id for update;
    if v_wallet_id is null then
      raise exception 'No se encontró la billetera del usuario';
    end if;
    v_deleted := exists (select 1 from public.profiles where id = v_attempt.user_id and deleted_at is not null);
    v_max_balance := public.setting_numeric('wallet_max_balance', 200000);

    if v_amount_ok
       and not v_deleted
       and v_balance + v_attempt.amount <= v_max_balance
       and not exists (select 1 from public.mp_payments m where m.attempt_id = p_attempt_id and m.applied)
    then
      update public.wallets set balance = balance + v_attempt.amount, updated_at = now() where id = v_wallet_id;
      insert into public.wallet_transactions (wallet_id, type, amount, status, payment_gateway_ref, is_demo)
      values (v_wallet_id, 'topup', v_attempt.amount, 'completed', 'mp:' || p_payment_id, false);

      update public.mp_payments set applied = true, updated_at = now() where mp_payment_id = p_payment_id;
      update public.mp_checkout_attempts set status = 'approved', updated_at = now() where id = p_attempt_id;

      insert into public.notifications (user_id, title, description, type, audience)
      values (
        v_attempt.user_id,
        'Recarga acreditada',
        format('Se acreditaron $%s a tu billetera con Mercado Pago.', v_attempt.amount),
        'topup_approved',
        'client'
      );
      return 'credited';
    end if;

    v_reason := case
      when not v_amount_ok then 'amount_mismatch'
      when v_deleted then 'account_deleted'
      when exists (select 1 from public.mp_payments m where m.attempt_id = p_attempt_id and m.applied) then 'duplicate'
      else 'limit_exceeded'
    end;

  -- Reserva cuya fila ya no existe: no hay a qué aplicarlo.
  elsif v_booking_id is null then
    v_reason := 'late';

  -- Reserva.
  else
    if v_amount_ok
       and v_booking.status = 'pending'
       and v_booking.payment_method = 'mercadopago'
       and round(v_booking.total_price, 2) = v_attempt.amount
       and not exists (select 1 from public.mp_payments m where m.booking_id = v_booking.id and m.applied)
    then
      update public.bookings set status = 'confirmed', paid_at = now()
      where id = v_booking.id and status = 'pending';
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception 'booking_state_changed';
      end if;

      select id into v_wallet_id from public.wallets where user_id = v_booking.user_id for update;
      if v_wallet_id is null then
        raise exception 'No se encontró la billetera del usuario';
      end if;

      -- Entra y sale en el mismo instante: el saldo no cambia.
      insert into public.wallet_transactions
        (wallet_id, type, amount, related_booking_id, status, payment_gateway_ref, is_demo)
      values
        (v_wallet_id, 'topup', v_booking.total_price, v_booking.id, 'completed', 'mp:' || p_payment_id, false);
      insert into public.wallet_transactions (wallet_id, type, amount, related_booking_id, status)
      values (v_wallet_id, 'booking_payment', -v_booking.total_price, v_booking.id, 'completed');

      update public.mp_payments set applied = true, updated_at = now() where mp_payment_id = p_payment_id;
      update public.mp_checkout_attempts set status = 'approved', updated_at = now() where id = p_attempt_id;
      update public.mp_checkout_attempts set status = 'superseded', updated_at = now()
      where booking_id = v_booking.id and id <> p_attempt_id and status = 'created';

      insert into public.notifications (user_id, title, description, type, related_booking_id)
      values (
        v_booking.owner_id,
        'Nueva reserva',
        format('Recibiste una reserva confirmada por $%s. El importe se acredita cuando finalice.', v_booking.total_price),
        'booking_created',
        v_booking.id
      );
      insert into public.notifications (user_id, title, description, type, related_booking_id)
      values (
        v_booking.user_id,
        'Pago aprobado',
        format('Pagaste $%s con Mercado Pago. Tu reserva está confirmada.', v_booking.total_price),
        'payment_approved',
        v_booking.id
      );
      return 'confirmed';
    end if;

    v_reason := case
      when not v_amount_ok or round(v_booking.total_price, 2) <> v_attempt.amount then 'amount_mismatch'
      when v_booking.status in ('pending', 'confirmed', 'completed')
        and exists (select 1 from public.mp_payments m where m.booking_id = v_booking.id and m.applied) then 'duplicate'
      else 'late'
    end;
  end if;

  -- Una recarga que no se acredita deja de contar como abierta (0099): ya no suma al tope de
  -- `begin_mp_topup` ni ocupa uno de los 3 lugares.
  if v_attempt.kind = 'topup' then
    update public.mp_checkout_attempts set status = 'failed', updated_at = now()
    where id = p_attempt_id and status = 'created';
  end if;

  update public.mp_payments
  set refund_status = 'required', refund_reason = v_reason, updated_at = now()
  where mp_payment_id = p_payment_id;
  return 'refund_required';
end;
$$;

revoke all on function public.apply_mp_payment(uuid, text, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.apply_mp_payment(uuid, text, text, text, text, numeric, text) to service_role;
