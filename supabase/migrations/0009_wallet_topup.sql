-- GarageGo — recarga de saldo manual (placeholder de desarrollo hasta integrar una pasarela de pago real)
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run

create or replace function public.topup_wallet(p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet_id uuid;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;
  if p_amount <= 0 or p_amount > 10000 then
    raise exception 'Monto inválido';
  end if;

  select id into v_wallet_id from public.wallets where user_id = v_user_id for update;
  if v_wallet_id is null then
    raise exception 'No se encontró tu billetera';
  end if;

  update public.wallets set balance = balance + p_amount, updated_at = now() where id = v_wallet_id;

  insert into public.wallet_transactions (wallet_id, type, amount, status, payment_gateway_ref)
  values (v_wallet_id, 'topup', p_amount, 'completed', 'dev-manual-topup');
end;
$$;

grant execute on function public.topup_wallet(numeric) to authenticated;
