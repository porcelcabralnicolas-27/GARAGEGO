-- GarageGo — la recarga ficticia de saldo, identificada como simulación y controlable por entorno.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run  (DESPUÉS de la 0059)
--
-- Idempotente: IF NOT EXISTS / ON CONFLICT DO NOTHING / CREATE OR REPLACE, y DROP de la versión
-- anterior de admin_transactions (cambia su tipo de retorno). Re-correr OK.
--
-- ── El problema (auditoría técnica 2026-09-13, hallazgo 2.1 y recomendación 5.1) ──────────
-- `topup_wallet` acredita saldo sin pasarela: es la simulación de pagos del MVP. La 0057 le
-- puso un tope al saldo, pero quedaban tres cosas que pedía la auditoría:
--   1. poder apagarla por entorno (un proyecto de producción no debería tenerla prendida
--      cuando exista una pasarela real);
--   2. separar los datos demo: que un movimiento generado por la simulación se distinga de
--      uno real, para no mezclarlos cuando llegue Mercado Pago;
--   3. dejar documentado en la base que ese saldo no tiene valor monetario.
--
-- ── Arreglo ──────────────────────────────────────────────────────────────────────────────
--   * `app_settings`: configuración por entorno. Cada proyecto de Supabase tiene su propia
--     base, así que cada entorno tiene su propio valor. Nadie la lee ni la escribe por la API:
--     se cambia desde el SQL Editor y se consulta con funciones.
--   * `demo_topup_enabled` (true por defecto, para no cambiar nada hoy). Para apagarla:
--       update public.app_settings set value = 'false', updated_at = now()
--       where key = 'demo_topup_enabled';
--     La app deja de mostrar los botones de recarga y el servidor la rechaza igual
--     (`topup_disabled`), aunque alguien llame a la función directo.
--   * `wallet_transactions.is_demo`: true en las recargas simuladas (y en las que ya existían).
--     El panel las marca como "Demo".

-- 1. Configuración por entorno --------------------------------------------------------------

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
-- Sin policies y sin privilegios: la API no la expone.
revoke all on public.app_settings from anon, authenticated;

insert into public.app_settings (key, value, description)
values (
  'demo_topup_enabled',
  'true',
  'Recarga ficticia de saldo (topup_wallet). Es la simulación de pagos del MVP: el saldo que genera no tiene valor monetario. Apagarla (false) en un entorno con pasarela de pago real.'
)
on conflict (key) do nothing;

create or replace function public.demo_topup_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'demo_topup_enabled'), false);
$$;

revoke all on function public.demo_topup_enabled() from public, anon;
grant execute on function public.demo_topup_enabled() to authenticated;


-- 2. Movimientos demo ---------------------------------------------------------------------

alter table public.wallet_transactions add column if not exists is_demo boolean not null default false;

comment on column public.wallet_transactions.is_demo is
  'true = saldo ficticio generado por la recarga de prueba (topup_wallet). No tiene valor monetario.';

-- Las recargas que ya existían salieron todas de la simulación (0009 / 0057).
update public.wallet_transactions
set is_demo = true
where type = 'topup' and payment_gateway_ref = 'dev-manual-topup' and not is_demo;


-- 3. topup_wallet ---------------------------------------------------------------------------
-- Igual que la 0057 (tope de saldo de $50.000, recarga de hasta $10.000), más el flag y la marca.

create or replace function public.topup_wallet(p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_balance numeric := 50000;
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

  insert into public.wallet_transactions (wallet_id, type, amount, status, payment_gateway_ref, is_demo)
  values (v_wallet_id, 'topup', p_amount, 'completed', 'dev-manual-topup', true);
end;
$$;

comment on function public.topup_wallet(numeric) is
  'SIMULACIÓN DEL MVP: acredita saldo ficticio sin pasarela de pago. No tiene valor monetario. Se apaga por entorno con app_settings.demo_topup_enabled. La va a reemplazar Mercado Pago.';

revoke execute on function public.topup_wallet(numeric) from public, anon;
grant execute on function public.topup_wallet(numeric) to authenticated;


-- 4. Transacciones del panel de administración -----------------------------------------------
-- Antes (0045): los 300 movimientos más recientes, con los filtros (tipo, estado, búsqueda)
-- aplicados en el navegador sobre esos 300, así que un movimiento viejo no se podía encontrar
-- (auditoría, hallazgos 3.1 y 5.6). Ahora filtra el servidor, se pagina por cursor y devuelve
-- `is_demo`. Cambian los parámetros y el retorno: se borra la versión de la 0045.

create index if not exists wallet_transactions_keyset_idx on public.wallet_transactions (created_at desc, id desc);

drop function if exists public.admin_transactions(integer);

create or replace function public.admin_transactions(
  p_limit integer default 50,
  p_type text default null,
  p_status text default null,
  p_search text default null,
  p_cursor_created timestamptz default null,
  p_cursor_id uuid default null
)
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
  lot_name text,
  is_demo boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- Texto de búsqueda con los comodines de LIKE escapados: buscar "50%" busca eso literal.
  v_term text := replace(replace(replace(nullif(btrim(p_search), ''), '\', '\\'), '%', '\%'), '_', '\_');
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
    pl.name,
    t.is_demo
  from public.wallet_transactions t
  join public.wallets w on w.id = t.wallet_id
  left join public.profiles p on p.id = w.user_id
  left join public.bookings b on b.id = t.related_booking_id
  left join public.parking_lots pl on pl.id = b.parking_lot_id
  where (p_type is null or t.type = p_type)
    and (p_status is null or t.status = p_status)
    and (
      v_term is null
      or t.id::text ilike '%' || v_term || '%'
      or coalesce(t.payment_gateway_ref, '') ilike '%' || v_term || '%'
      or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike '%' || v_term || '%'
    )
    and (p_cursor_id is null or (t.created_at, t.id) < (p_cursor_created, p_cursor_id))
  order by t.created_at desc, t.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke all on function public.admin_transactions(integer, text, text, text, timestamptz, uuid) from public, anon;
grant execute on function public.admin_transactions(integer, text, text, text, timestamptz, uuid) to authenticated;
