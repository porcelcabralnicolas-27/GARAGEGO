-- GarageGo — sube los topes de la recarga de saldo de prueba.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE. Re-correr OK. No toca tablas ni saldos existentes.
--
-- `topup_wallet` es la simulación de pagos del MVP (saldo ficticio, sin valor monetario). Los
-- topes anteriores (0057/0061) eran de $50.000 de saldo total y $10.000 por recarga, y se
-- quedaban cortos para simular varias reservas seguidas en una demo. Nuevos valores:
--
--   * Saldo total máximo:  $200.000  (antes $50.000)
--   * Recarga máxima:       $50.000  (antes $10.000)
--
-- Se mantiene un tope (en vez de sacarlo) a propósito: deja claro que es saldo de prueba, evita
-- que se acumulen montos absurdos que ensucian las estadísticas del panel ("Movimientos 30 días"),
-- y es la misma estructura de límites que va a necesitar la integración real con Mercado Pago.
--
-- El tope solo aplica a esta recarga manual. Los cobros de reservas que se acreditan al
-- propietario (complete_booking) no pasan por acá y no tienen límite: una cuenta puede superar
-- el tope de recarga por haber cobrado.
--
-- Es el resto de la función idéntico a la 0061: mismo flag `demo_topup_enabled`, mismo bloqueo
-- de la fila de la billetera (`for update`) para que dos recargas simultáneas no se pisen, y
-- misma marca `is_demo` en la transacción.

create or replace function public.topup_wallet(p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_balance constant numeric := 200000;
  v_max_topup constant numeric := 50000;
  v_user_id uuid := auth.uid();
  v_wallet_id uuid;
  v_balance numeric;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;
  if not public.demo_topup_enabled() then
    raise exception 'topup_disabled';
  end if;
  if p_amount <= 0 or p_amount > v_max_topup then
    raise exception 'Monto inválido';
  end if;

  select id, balance into v_wallet_id, v_balance
  from public.wallets where user_id = v_user_id for update;
  if v_wallet_id is null then
    raise exception 'No se encontró tu billetera';
  end if;

  if v_balance + p_amount > v_max_balance then
    raise exception 'topup_limit_reached';
  end if;

  update public.wallets set balance = balance + p_amount, updated_at = now() where id = v_wallet_id;

  insert into public.wallet_transactions (wallet_id, type, amount, status, payment_gateway_ref, is_demo)
  values (v_wallet_id, 'topup', p_amount, 'completed', 'dev-manual-topup', true);
end;
$$;

comment on function public.topup_wallet(numeric) is
  'SIMULACIÓN DEL MVP: acredita saldo ficticio sin pasarela de pago. No tiene valor monetario. Tope de saldo $200.000 y de recarga $50.000 (0074). Se apaga por entorno con app_settings.demo_topup_enabled. La va a reemplazar Mercado Pago.';

revoke execute on function public.topup_wallet(numeric) from public, anon;
grant execute on function public.topup_wallet(numeric) to authenticated;
