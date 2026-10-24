-- GarageGo — lista de movimientos de dinero para el panel de administración.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: DROP + CREATE. Re-correr OK.
--
-- El admin no tiene RLS sobre `wallet_transactions` ni `wallets`. La tarjeta de resumen ya la
-- da `admin_transaction_summary` (0042); esto es la tabla: los N movimientos más recientes con
-- el titular y (si aplica) la cochera de la reserva asociada.
--
-- OJO: NO se devuelve "¿es propietario?" porque `profiles.is_owner_enabled` es un flag
-- permanente y no dice desde qué vista se hizo la acción. Eso se deduce del `type` en el panel
-- (todo lo de reservas/recargas es del conductor; 'earning' es del propietario).

drop function if exists public.admin_transactions(integer);

create or replace function public.admin_transactions(p_limit integer default 200)
returns table (
  id uuid,
  created_at timestamptz,
  type text,
  amount numeric,
  status text,
  payment_gateway_ref text,
  related_booking_id uuid,
  user_id uuid,
  user_name text,
  lot_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  select
    t.id,
    t.created_at,
    t.type,
    t.amount,
    t.status,
    t.payment_gateway_ref,
    t.related_booking_id,
    w.user_id,
    coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Usuario'),
    pl.name
  from public.wallet_transactions t
  join public.wallets w on w.id = t.wallet_id
  left join public.profiles p on p.id = w.user_id
  left join public.bookings b on b.id = t.related_booking_id
  left join public.parking_lots pl on pl.id = b.parking_lot_id
  order by t.created_at desc
  limit greatest(1, least(p_limit, 1000));
end;
$$;

grant execute on function public.admin_transactions(integer) to authenticated;
