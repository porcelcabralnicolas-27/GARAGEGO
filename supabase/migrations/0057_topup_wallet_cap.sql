-- GarageGo — tope de saldo para la recarga ficticia del MVP.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE (misma firma). Re-correr OK.
--
-- ── El problema (auditoría técnica 2026-09-13, hallazgo 2.1) ─────────────────────────────
-- `topup_wallet` (0009) acredita saldo directo, sin pasarela: es el placeholder de desarrollo
-- del MVP. El tope de 10.000 es POR LLAMADA, así que cualquiera puede llamarla en loop y
-- quedar con un saldo arbitrario. Como el saldo es ficticio, esto no es fraude real, pero
-- ensucia los datos (cuentas con saldos absurdos) y no deja distinguir una prueba de un uso
-- normal.
--
-- ── Decisión del equipo (2026-09-22) ────────────────────────────────────────────────────
-- Tope al SALDO TOTAL, no a la recarga acumulada: no se puede recargar si el saldo quedaría
-- por encima de $50.000. Se puede recargar cuantas veces se quiera mientras se vaya gastando,
-- que es justo lo que hace falta para probar; lo que ya no se puede es acumular sin límite.
--
-- Esta función la va a reemplazar Mercado Pago (ver la decisión de integración): esto es un
-- parche mientras tanto, no el diseño final del dinero.

create or replace function public.topup_wallet(p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Saldo máximo que puede quedar después de una recarga de prueba.
  v_max_balance numeric := 50000;
  v_user_id uuid := auth.uid();
  v_wallet_id uuid;
  v_balance numeric;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;
  if p_amount <= 0 or p_amount > 10000 then
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

  insert into public.wallet_transactions (wallet_id, type, amount, status, payment_gateway_ref)
  values (v_wallet_id, 'topup', p_amount, 'completed', 'dev-manual-topup');
end;
$$;

revoke execute on function public.topup_wallet(numeric) from public, anon;
grant execute on function public.topup_wallet(numeric) to authenticated;
