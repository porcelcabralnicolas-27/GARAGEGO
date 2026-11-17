-- GarageGo — eliminar la cuenta desde Ajustes.
-- Requiere 0053 (archivado de cocheras), 0084 (Mercado Pago) y 0087 (región).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, DROP IF EXISTS y CREATE OR REPLACE. Re-correr es seguro.
--
-- ── Regla (decisión del equipo) ───────────────────────────────────────────────────────────────
-- No se puede eliminar la cuenta con reservas activas o próximas (estado 'pending' o 'confirmed'):
--   * como conductor: las suyas, incluidas las que esperan el pago de Mercado Pago;
--   * como propietario: las que otros hicieron en sus cocheras.
-- Primero tienen que terminar o cancelarse. Lo hace cumplir la base, no la app.
--
-- ── Qué se borra y qué se conserva ────────────────────────────────────────────────────────────
-- Las reservas y los movimientos de dinero se conservan: la otra parte también los necesita (lo
-- dice la política de privacidad). Por eso la cuenta NO se borra de verdad (un DELETE en
-- auth.users arrastraría en cascada el perfil, las reservas y la billetera). En cambio:
--   * el perfil se anonimiza ("Usuario eliminado", sin teléfono ni foto) y queda `deleted_at`;
--   * sus vehículos y sus notificaciones se borran;
--   * sus cocheras se archivan (salen de la búsqueda para siempre, como `delete_parking_lot`);
--   * el usuario de Auth se da de baja con el borrado "suave" de Supabase (la Edge Function
--     delete-account, con la clave de servicio): se le quitan el correo y el inicio con Google,
--     no puede volver a entrar y el correo queda libre para registrarse de nuevo.
-- El saldo que quede en la billetera se pierde: la app lo avisa antes de confirmar.

-- 1. Marca de cuenta eliminada ---------------------------------------------------------------------
alter table public.profiles add column if not exists deleted_at timestamptz;

-- El cliente no se la puede poner ni sacar: solo la RPC de abajo (security definer).
create or replace function public.protect_profile_deleted_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.deleted_at := old.deleted_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_deleted_at on public.profiles;
create trigger profiles_protect_deleted_at
  before update on public.profiles
  for each row execute function public.protect_profile_deleted_at();


-- 2. Chequeo previo (para la app) ----------------------------------------------------------------------
-- Lo que la app necesita para decidir qué mostrar antes de pedir la confirmación. Es solo
-- informativo: el control de verdad lo vuelve a hacer `delete_account_data`.
create or replace function public.account_deletion_check()
returns table (driver_bookings integer, owner_bookings integer, wallet_balance numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::integer from public.bookings b
      where b.user_id = auth.uid() and b.status in ('pending', 'confirmed')),
    (select count(*)::integer from public.bookings b
      join public.parking_lots l on l.id = b.parking_lot_id
      where l.owner_id = auth.uid() and b.status in ('pending', 'confirmed')),
    coalesce((select w.balance from public.wallets w where w.user_id = auth.uid()), 0);
$$;

revoke all on function public.account_deletion_check() from public, anon;
grant execute on function public.account_deletion_check() to authenticated;


-- 3. Baja de los datos ------------------------------------------------------------------------------------
-- Solo la llama la Edge Function delete-account (service_role), con el id sacado del JWT. Si la
-- llamara el cliente, quedaría un perfil anonimizado con el que todavía se puede entrar.
create or replace function public.delete_account_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot uuid;
begin
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  -- Mismo candado por cochera que create_booking: nadie puede reservar en sus cocheras mientras
  -- se decide. Orden fijo para no trabarse con otra transacción.
  for v_lot in select id from public.parking_lots where owner_id = p_user_id order by id loop
    perform pg_advisory_xact_lock(hashtextextended('garagego.booking:' || v_lot::text, 0));
  end loop;

  if exists (
    select 1 from public.bookings
    where user_id = p_user_id and status in ('pending', 'confirmed')
  ) or exists (
    select 1 from public.bookings b
    join public.parking_lots l on l.id = b.parking_lot_id
    where l.owner_id = p_user_id and b.status in ('pending', 'confirmed')
  ) then
    raise exception 'account_has_active_bookings' using errcode = 'P0001';
  end if;

  -- Cocheras: archivadas, como las que el propietario borra con historial (0053).
  update public.parking_lots
    set is_active = false,
        archived_at = coalesce(archived_at, now()),
        updated_at = now()
    where owner_id = p_user_id;

  -- Datos personales que nadie más necesita. Las reservas pierden el vínculo con el vehículo
  -- (on delete set null) pero se conservan.
  delete from public.vehicles where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  delete from public.hidden_bookings where user_id = p_user_id;

  update public.profiles
    set first_name = 'Usuario',
        last_name = 'eliminado',
        phone = null,
        avatar_url = null,
        is_owner_enabled = false,
        is_admin = false,
        deleted_at = coalesce(deleted_at, now())
    where id = p_user_id;
end;
$$;

revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
