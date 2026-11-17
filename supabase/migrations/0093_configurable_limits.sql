-- GarageGo — límites configurables desde el panel (Configuración → Límites).
-- Requiere 0033 (is_admin), 0061 (app_settings), 0084 (begin_mp_topup) y 0091 (vehículos por país).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, ON CONFLICT, DROP IF EXISTS y CREATE OR REPLACE. Re-correr
-- es seguro y NO pisa valores que el equipo ya haya cambiado.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────────────────
-- Los límites de negocio estaban escritos como números fijos en triggers y funciones (y repetidos
-- en la app). Ahora viven en `app_settings` (0061) y el equipo los cambia desde el panel:
--
--   clave                      hoy         lo usa
--   max_parking_images         3           enforce_max_parking_images (0023)
--   max_vehicles_per_region    3           enforce_max_vehicles (0091), por país
--   parking_capacity_min       1           trigger nuevo de capacidad (reemplaza el check de la 0064)
--   parking_capacity_max       50          ídem
--   wallet_max_balance         200000      begin_mp_topup (0084) y topup_wallet (0074)
--   topup_min                  100         begin_mp_topup
--   topup_max                  50000       begin_mp_topup y topup_wallet
--   topup_quick_amounts        [5000, …]   solo la app (botones de la pantalla de recarga)
--
-- Al correr la migración los valores son los de hoy: nada cambia hasta que el equipo los edite.
--
-- ── Reglas ────────────────────────────────────────────────────────────────────────────────
--   * Se escriben solo con `admin_update_settings`, que valida tipo, rango y reglas cruzadas en el
--     servidor (un valor absurdo no entra aunque se saltee el panel). Si algo no cierra, no guarda
--     nada y avisa `setting_invalid: <clave>`.
--   * Bajar un límite no rompe lo que ya existe: los triggers controlan al agregar (o, la
--     capacidad, al cambiarla). Quien tiene 3 vehículos y el límite pasa a 2 los conserva.
--   * La app lee los públicos con `public_settings()` y, si no puede, usa los valores de hoy.


-- 1. app_settings: sección, nombre, si la app lo puede leer y quién lo cambió ------------------------
alter table public.app_settings add column if not exists section text;
alter table public.app_settings add column if not exists label text;
alter table public.app_settings add column if not exists is_public boolean not null default false;
alter table public.app_settings add column if not exists updated_by uuid references public.profiles (id) on delete set null;

insert into public.app_settings (key, value, section, label, is_public, description) values
  ('max_parking_images', '3', 'limits', 'Fotos por publicación', true,
   'Cuántas fotos puede tener cada cochera. Bajarlo no borra las fotos que ya existen.'),
  ('max_vehicles_per_region', '3', 'limits', 'Vehículos por cuenta y país', true,
   'Cuántos vehículos puede cargar cada usuario en cada país. Bajarlo no borra los que ya existen.'),
  ('parking_capacity_min', '1', 'limits', 'Capacidad mínima de una cochera', true,
   'Menor cantidad de autos a la vez que se puede indicar al publicar.'),
  ('parking_capacity_max', '50', 'limits', 'Capacidad máxima de una cochera', true,
   'Mayor cantidad de autos a la vez que se puede indicar al publicar.'),
  ('wallet_max_balance', '200000', 'limits', 'Saldo máximo de la billetera', true,
   'No se puede recargar si el saldo pasaría este monto (en pesos). Los cobros del propietario no tienen tope.'),
  ('topup_min', '100', 'limits', 'Recarga mínima', true,
   'Monto mínimo de cada recarga con Mercado Pago (en pesos).'),
  ('topup_max', '50000', 'limits', 'Recarga máxima', true,
   'Monto máximo de cada recarga (en pesos).'),
  ('topup_quick_amounts', '[5000, 10000, 15000, 20000]', 'limits', 'Montos rápidos de recarga', true,
   'Botones que ve el usuario en la pantalla de recarga (en pesos).')
on conflict (key) do update
  set section = excluded.section, label = excluded.label, is_public = excluded.is_public,
      description = excluded.description;

-- El equipo puede leer todos los ajustes (para el panel). Escribir, solo con la RPC de abajo.
grant select on public.app_settings to authenticated;
drop policy if exists app_settings_admin_select on public.app_settings;
create policy app_settings_admin_select on public.app_settings for select to authenticated
  using (public.is_admin(auth.uid()));

-- Si otro admin cambia un límite, el panel abierto se actualiza solo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_settings'
  ) then
    alter publication supabase_realtime add table public.app_settings;
  end if;
end $$;


-- 2. Leer --------------------------------------------------------------------------------------------
-- Para triggers y funciones: el valor numérico de un ajuste, o el default si falta o no es número.
create or replace function public.setting_numeric(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (value #>> '{}')::numeric from public.app_settings
     where key = p_key and jsonb_typeof(value) = 'number'),
    p_default
  );
$$;

revoke all on function public.setting_numeric(text, numeric) from public, anon, authenticated;

-- Para la app: los ajustes públicos como un objeto { clave: valor }. No son secretos (son los
-- mismos números que se muestran en pantalla), así que también los puede leer alguien sin sesión.
create or replace function public.public_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings where is_public;
$$;

revoke all on function public.public_settings() from public;
grant execute on function public.public_settings() to anon, authenticated;


-- 3. Escribir: solo el equipo, validado acá ------------------------------------------------------------
create or replace function public.admin_update_settings(p_values jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit_keys constant text[] := array[
    'max_parking_images', 'max_vehicles_per_region', 'parking_capacity_min', 'parking_capacity_max',
    'wallet_max_balance', 'topup_min', 'topup_max', 'topup_quick_amounts'
  ];
  v_new jsonb;      -- valores actuales con los cambios aplicados
  v_key text;
  v_value jsonb;
  v_amounts jsonb;
  v_amount numeric;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'setting_invalid: payload' using errcode = 'P0001';
  end if;

  -- Dos admins guardando a la vez: uno espera al otro y valida contra lo que quedó.
  perform pg_advisory_xact_lock(hashtext('garagego.app_settings'));

  for v_key in select jsonb_object_keys(p_values) loop
    if not v_key = any(v_limit_keys) then
      raise exception 'setting_unknown: %', v_key using errcode = 'P0001';
    end if;
  end loop;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) || p_values into v_new
  from public.app_settings where key = any(v_limit_keys);

  -- Enteros dentro de su rango.
  for v_key, v_value in select * from jsonb_each(v_new) where key <> 'topup_quick_amounts' loop
    if jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}')::numeric <> trunc((v_value #>> '{}')::numeric) then
      raise exception 'setting_invalid: %', v_key using errcode = 'P0001';
    end if;
  end loop;

  if (v_new->>'max_parking_images')::numeric not between 1 and 10 then
    raise exception 'setting_invalid: max_parking_images' using errcode = 'P0001';
  end if;
  if (v_new->>'max_vehicles_per_region')::numeric not between 1 and 10 then
    raise exception 'setting_invalid: max_vehicles_per_region' using errcode = 'P0001';
  end if;
  if (v_new->>'parking_capacity_min')::numeric not between 1 and 500 then
    raise exception 'setting_invalid: parking_capacity_min' using errcode = 'P0001';
  end if;
  if (v_new->>'parking_capacity_max')::numeric not between 1 and 500
     or (v_new->>'parking_capacity_max')::numeric < (v_new->>'parking_capacity_min')::numeric then
    raise exception 'setting_invalid: parking_capacity_max' using errcode = 'P0001';
  end if;
  if (v_new->>'wallet_max_balance')::numeric not between 1000 and 10000000 then
    raise exception 'setting_invalid: wallet_max_balance' using errcode = 'P0001';
  end if;
  if (v_new->>'topup_min')::numeric not between 100 and 10000000 then
    raise exception 'setting_invalid: topup_min' using errcode = 'P0001';
  end if;
  if (v_new->>'topup_max')::numeric < (v_new->>'topup_min')::numeric
     or (v_new->>'topup_max')::numeric > (v_new->>'wallet_max_balance')::numeric then
    raise exception 'setting_invalid: topup_max' using errcode = 'P0001';
  end if;

  -- Montos rápidos: de 1 a 6, enteros, sin repetir y entre la recarga mínima y la máxima.
  v_amounts := v_new->'topup_quick_amounts';
  if jsonb_typeof(v_amounts) <> 'array' or jsonb_array_length(v_amounts) not between 1 and 6 then
    raise exception 'setting_invalid: topup_quick_amounts' using errcode = 'P0001';
  end if;
  for v_value in select * from jsonb_array_elements(v_amounts) loop
    if jsonb_typeof(v_value) <> 'number' then
      raise exception 'setting_invalid: topup_quick_amounts' using errcode = 'P0001';
    end if;
    v_amount := (v_value #>> '{}')::numeric;
    if v_amount <> trunc(v_amount)
       or v_amount < (v_new->>'topup_min')::numeric
       or v_amount > (v_new->>'topup_max')::numeric then
      raise exception 'setting_invalid: topup_quick_amounts' using errcode = 'P0001';
    end if;
  end loop;
  if (select count(distinct e) from jsonb_array_elements(v_amounts) e) <> jsonb_array_length(v_amounts) then
    raise exception 'setting_invalid: topup_quick_amounts' using errcode = 'P0001';
  end if;
  -- Se guardan ordenados de menor a mayor.
  v_new := jsonb_set(v_new, '{topup_quick_amounts}',
    (select jsonb_agg(e order by (e #>> '{}')::numeric) from jsonb_array_elements(v_amounts) e));

  -- Guardar solo lo que cambió, con quién y cuándo.
  update public.app_settings s
  set value = v_new->s.key, updated_at = now(), updated_by = auth.uid()
  where s.key = any(v_limit_keys) and s.key in (select jsonb_object_keys(p_values))
    and s.value is distinct from v_new->s.key;

  return public.public_settings();
end;
$$;

revoke all on function public.admin_update_settings(jsonb) from public, anon;
grant execute on function public.admin_update_settings(jsonb) to authenticated;


-- 4. Las reglas leen el ajuste --------------------------------------------------------------------------

-- Fotos por publicación (antes 3 fijo, 0023).
create or replace function public.enforce_max_parking_images()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.parking_images where parking_lot_id = new.parking_lot_id)
     >= public.setting_numeric('max_parking_images', 3) then
    raise exception 'max_parking_images_reached';
  end if;
  return new;
end;
$$;

-- Vehículos por cuenta y país (antes 3 fijo, 0091). El país sale del perfil, como en la 0091.
create or replace function public.enforce_max_vehicles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_region text := coalesce((select region from public.profiles where id = new.user_id), 'AR');
begin
  if (select count(*) from public.vehicles where user_id = new.user_id and region = v_region)
     >= public.setting_numeric('max_vehicles_per_region', 3) then
    raise exception 'max_vehicles_reached';
  end if;
  return new;
end;
$$;

-- Capacidad: un check no puede leer otra tabla, así que el rango 1-50 de la 0064 pasa a un
-- trigger. Se controla solo al crear la cochera o al cambiarle la capacidad: si el equipo baja el
-- máximo, las cocheras que ya tenían más siguen funcionando (y se pueden editar en lo demás).
alter table public.parking_lots drop constraint if exists parking_lots_capacity_range;
alter table public.parking_lots drop constraint if exists parking_lots_capacity_positive;
alter table public.parking_lots add constraint parking_lots_capacity_positive check (capacity >= 1);

create or replace function public.enforce_parking_capacity_range()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.capacity is not distinct from old.capacity then
    return new;
  end if;
  if new.capacity < public.setting_numeric('parking_capacity_min', 1)
     or new.capacity > public.setting_numeric('parking_capacity_max', 50) then
    raise exception 'capacity_out_of_range' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists parking_lots_capacity_range on public.parking_lots;
create trigger parking_lots_capacity_range
  before insert or update of capacity on public.parking_lots
  for each row execute function public.enforce_parking_capacity_range();

-- Recarga con Mercado Pago (0084): mismos pasos, topes leídos del ajuste.
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
  v_attempt_id uuid;
  v_expires_at timestamptz := now() + v_window;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;
  if v_amount is null or v_amount < v_min_topup or v_amount > v_max_topup then
    raise exception 'invalid_topup_amount';
  end if;

  select balance into v_balance from public.wallets where user_id = v_user_id;
  if v_balance is null then
    raise exception 'No se encontró tu billetera';
  end if;
  if v_balance + v_amount > v_max_balance then
    raise exception 'topup_limit_reached';
  end if;

  if (
    select count(*) from public.mp_checkout_attempts a
    where a.user_id = v_user_id and a.kind = 'topup' and a.status = 'created' and a.expires_at > now()
  ) >= v_max_open then
    raise exception 'too_many_open_topups';
  end if;

  insert into public.mp_checkout_attempts (kind, user_id, amount, expires_at)
  values ('topup', v_user_id, v_amount, v_expires_at)
  returning id into v_attempt_id;

  return query select v_attempt_id, v_amount, v_expires_at;
end;
$$;

-- Recarga de prueba (0074): mismos topes que la de Mercado Pago.
create or replace function public.topup_wallet(p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_balance numeric := public.setting_numeric('wallet_max_balance', 200000);
  v_max_topup numeric := public.setting_numeric('topup_max', 50000);
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
  'SIMULACIÓN DEL MVP: acredita saldo ficticio sin pasarela de pago. No tiene valor monetario. Topes de saldo y de recarga configurables (app_settings, 0093). Se apaga por entorno con app_settings.demo_topup_enabled.';

revoke execute on function public.topup_wallet(numeric) from public, anon;
grant execute on function public.topup_wallet(numeric) to authenticated;
