-- GarageGo — acredita el pago al propietario cuando la reserva se finaliza
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run

alter table public.wallet_transactions drop constraint wallet_transactions_type_check;
alter table public.wallet_transactions
  add constraint wallet_transactions_type_check check (type in ('topup', 'booking_payment', 'refund', 'adjustment', 'earning'));

create or replace function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_status text;
  v_total_price numeric;
  v_owner_wallet_id uuid;
begin
  select p.owner_id, b.status, b.total_price into v_owner_id, v_status, v_total_price
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  where b.id = p_booking_id;

  if v_owner_id is null then
    raise exception 'Reserva no encontrada';
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'No autorizado';
  end if;
  if v_status <> 'confirmed' then
    raise exception 'Solo se pueden finalizar reservas confirmadas';
  end if;

  update public.bookings set status = 'completed' where id = p_booking_id;

  -- Acredita el importe al propietario recién ahora, al finalizar el servicio
  -- (no al confirmar), consistente con "el dinero se libera cuando el servicio se completó".
  select id into v_owner_wallet_id from public.wallets where user_id = v_owner_id for update;
  if v_owner_wallet_id is not null then
    update public.wallets set balance = balance + v_total_price, updated_at = now() where id = v_owner_wallet_id;

    insert into public.wallet_transactions (wallet_id, type, amount, related_booking_id, status)
    values (v_owner_wallet_id, 'earning', v_total_price, p_booking_id, 'completed');
  end if;
end;
$$;

grant execute on function public.complete_booking(uuid) to authenticated;
