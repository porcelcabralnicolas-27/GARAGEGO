-- GarageGo — eliminar la cuenta contempla también los pagos pendientes y los documentos.
-- Requiere 0078 (documentos de titularidad), 0084 (Mercado Pago), 0088 (eliminar la cuenta) y 0099.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: DROP IF EXISTS y CREATE. Re-correr es seguro.
--
-- ── Regla ─────────────────────────────────────────────────────────────────────────────────
-- Además de las reservas activas o próximas (0088), no se puede eliminar la cuenta con:
--   * recargas de Mercado Pago esperando el pago (`account_has_pending_topups`);
--   * devoluciones de Mercado Pago pendientes o fallidas (`account_has_pending_refunds`).
-- Lo controla `delete_account_data` (no la app), con la billetera bloqueada: así no se cruza con
-- una recarga que empieza o se acredita en ese momento. Si el pago llega después de la baja,
-- `apply_mp_payment` (0099) no lo acredita y lo devuelve.
--
-- ── Qué más se limpia ─────────────────────────────────────────────────────────────────────
-- Las filas de los documentos de titularidad pendientes de sus cocheras. Los archivos los borra la
-- Edge Function delete-account (la base no puede borrar archivos de Storage), igual que las fotos
-- de los vehículos.
--
-- ── Repetir la baja ───────────────────────────────────────────────────────────────────────
-- `delete_account_data` devuelve 'deleted' la primera vez y 'already_deleted' si la cuenta ya
-- estaba dada de baja, sin volver a tocar nada.


-- 1. Chequeo previo (para la app): suma recargas, devoluciones y documentos -------------------------
drop function if exists public.account_deletion_check();
create function public.account_deletion_check()
returns table (
  driver_bookings integer,
  owner_bookings integer,
  wallet_balance numeric,
  pending_topups integer,
  pending_refunds integer,
  pending_documents integer
)
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
    coalesce((select w.balance from public.wallets w where w.user_id = auth.uid()), 0),
    (select count(*)::integer from public.mp_checkout_attempts a
      where a.user_id = auth.uid() and a.kind = 'topup' and a.status = 'created'),
    (select count(*)::integer from public.mp_payments m
      join public.mp_checkout_attempts a on a.id = m.attempt_id
      where a.user_id = auth.uid() and m.refund_status in ('required', 'failed')),
    (select count(*)::integer from public.parking_lot_documents d
      join public.parking_lots l on l.id = d.parking_lot_id
      where l.owner_id = auth.uid());
$$;

revoke all on function public.account_deletion_check() from public, anon;
grant execute on function public.account_deletion_check() to authenticated;


-- 2. Baja de los datos: con los controles nuevos y repetible ---------------------------------------
-- Igual a la de la 0088, más: candado de la billetera, recargas y devoluciones pendientes, borrado
-- de las filas de documentos y retorno para saber si ya estaba dada de baja.
drop function if exists public.delete_account_data(uuid);
create function public.delete_account_data(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot uuid;
  v_deleted_at timestamptz;
begin
  if p_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  select deleted_at into v_deleted_at from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if v_deleted_at is not null then
    return 'already_deleted';
  end if;

  -- Mismo candado por cochera que create_booking: nadie puede reservar en sus cocheras mientras
  -- se decide. Orden fijo para no trabarse con otra transacción.
  for v_lot in select id from public.parking_lots where owner_id = p_user_id order by id loop
    perform pg_advisory_xact_lock(hashtextextended('garagego.booking:' || v_lot::text, 0));
  end loop;

  -- Mismo candado que begin_mp_topup y apply_mp_payment (0099): una recarga no puede empezar ni
  -- acreditarse en el medio.
  perform 1 from public.wallets where user_id = p_user_id for update;

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

  if exists (
    select 1 from public.mp_checkout_attempts
    where user_id = p_user_id and kind = 'topup' and status = 'created'
  ) then
    raise exception 'account_has_pending_topups' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.mp_payments m
    join public.mp_checkout_attempts a on a.id = m.attempt_id
    where a.user_id = p_user_id and m.refund_status in ('required', 'failed')
  ) then
    raise exception 'account_has_pending_refunds' using errcode = 'P0001';
  end if;

  -- Cocheras: archivadas, como las que el propietario borra con historial (0053).
  update public.parking_lots
    set is_active = false,
        archived_at = coalesce(archived_at, now()),
        updated_at = now()
    where owner_id = p_user_id;

  -- Documentos de titularidad que quedaban sin revisar: son datos sensibles que ya nadie va a
  -- revisar. Los archivos los borra la Edge Function.
  delete from public.parking_lot_documents d
  using public.parking_lots l
  where l.id = d.parking_lot_id and l.owner_id = p_user_id;

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
        deleted_at = now()
    where id = p_user_id;

  return 'deleted';
end;
$$;

revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
