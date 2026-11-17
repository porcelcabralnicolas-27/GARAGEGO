-- GarageGo — verificación de la migración 0100 (eliminar la cuenta con pagos y documentos
-- pendientes), contra las funciones REALES del proyecto.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr la 0100.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- TODO, incluida la baja de la cuenta de prueba. La Edge Function (archivos y Auth) no se llama.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
--   gg.owner → la cuenta que se "da de baja" durante la prueba (todo se revierte)
--   gg.admin → un usuario con is_admin = true: dueño de la cochera donde reserva gg.owner

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_user uuid;
  v_lot uuid := 'ffffffff-0000-0000-0000-0000000000b1';
  v_own_lot uuid := 'ffffffff-0000-0000-0000-0000000000b2';
  v_attempt uuid;
  v_booking uuid;
  v_row record;
  v_res text;
  v_res2 text;
  v_err text;
  v_err2 text;
  v_count int;
  v_text text;
begin
  perform set_config('gg.owner', 'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar
  perform set_config('gg.admin', 'fa32b803-09e1-4120-8c15-0112a8371373', true);  -- ← completar
  v_user := current_setting('gg.owner')::uuid;

  -- Punto de partida limpio (como postgres; se revierte): sin reservas activas, recargas abiertas ni
  -- devoluciones pendientes de la cuenta de prueba.
  update public.bookings set status = 'cancelled'
    where status in ('pending', 'confirmed')
      and (user_id = v_user or parking_lot_id in (select id from public.parking_lots where owner_id = v_user));
  update public.mp_checkout_attempts set status = 'expired' where user_id = v_user and kind = 'topup' and status = 'created';
  update public.mp_payments m set refund_status = 'done'
    from public.mp_checkout_attempts a
    where a.id = m.attempt_id and a.user_id = v_user and m.refund_status in ('required', 'failed');
  update public.profiles set deleted_at = null where id = v_user;

  -- Fixtures: una cochera del admin (para reservar) y una propia pendiente con un documento.
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, is_active, approval_status, moderation_state)
  values
    (v_lot, current_setting('gg.admin')::uuid, 'Cochera (deletion_checks)', 'Dirección', -34.6037, -58.3816, 100, 1, true, 'approved', 'live'),
    (v_own_lot, v_user, 'Propia (deletion_checks)', 'Dirección', -34.6037, -58.3816, 100, 1, false, 'pending', 'live');
  insert into public.parking_lot_documents (parking_lot_id, kind, storage_path)
    values (v_own_lot, 'dni', v_user::text || '/' || v_own_lot::text || '/dni.jpg');

  -- 1. Con una reserva pendiente y otra confirmada no se puede.
  begin
    insert into public.bookings (user_id, parking_lot_id, date, start_time, end_time, status, total_price)
      values (v_user, v_lot, current_date + 30, '10:00', '11:00', 'pending', 100) returning id into v_booking;
    begin
      perform public.delete_account_data(v_user);
      v_err := 'la dio de baja';
    exception when others then
      v_err := case when sqlerrm like '%account_has_active_bookings%' then 'bloqueó (pendiente)' else sqlerrm end;
    end;
    update public.bookings set status = 'confirmed' where id = v_booking;
    begin
      perform public.delete_account_data(v_user);
      v_err2 := 'la dio de baja';
    exception when others then
      v_err2 := case when sqlerrm like '%account_has_active_bookings%' then 'bloqueó (confirmada)' else sqlerrm end;
    end;
    update public.bookings set status = 'cancelled' where id = v_booking;
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'reservas activas bloquean',
      case when v_err = 'bloqueó (pendiente)' and v_err2 = 'bloqueó (confirmada)' then 'OK' else 'FALLA' end,
      v_err || ' / ' || v_err2);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'reservas activas bloquean', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. Una recarga esperando el pago bloquea, y el chequeo previo la informa.
  begin
    insert into public.mp_checkout_attempts (kind, user_id, amount, expires_at)
      values ('topup', v_user, 1000, now() + interval '30 minutes') returning id into v_attempt;
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select * into v_row from public.account_deletion_check();
    execute 'reset role';
    begin
      perform public.delete_account_data(v_user);
      v_err := 'la dio de baja';
    exception when others then
      v_err := case when sqlerrm like '%account_has_pending_topups%' then 'bloqueó' else sqlerrm end;
    end;
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'recarga pendiente bloquea',
      case when v_err = 'bloqueó' and v_row.pending_topups = 1 and v_row.pending_documents = 1 then 'OK' else 'FALLA' end,
      format('%s / chequeo: recargas %s, documentos %s', v_err, v_row.pending_topups, v_row.pending_documents));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'recarga pendiente bloquea', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. Una devolución pendiente bloquea.
  begin
    update public.mp_checkout_attempts set status = 'failed' where id = v_attempt;
    insert into public.mp_payments (mp_payment_id, attempt_id, status, amount, currency, refund_status, refund_reason)
      values ('ggtest-deletion-1', v_attempt, 'approved', 1000, 'ARS', 'required', 'limit_exceeded');
    begin
      perform public.delete_account_data(v_user);
      v_err := 'la dio de baja';
    exception when others then
      v_err := case when sqlerrm like '%account_has_pending_refunds%' then 'bloqueó' else sqlerrm end;
    end;
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'devolución pendiente bloquea',
      case when v_err = 'bloqueó' then 'OK' else 'FALLA' end, v_err);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'devolución pendiente bloquea', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. Sin nada pendiente se da de baja: perfil anonimizado, documentos y vehículos borrados,
  --    cocheras archivadas. Repetirla devuelve 'already_deleted' sin tocar nada.
  begin
    update public.mp_payments set refund_status = 'done' where mp_payment_id = 'ggtest-deletion-1';
    v_res := public.delete_account_data(v_user);
    v_res2 := public.delete_account_data(v_user);
    select count(*) into v_count from public.parking_lot_documents where parking_lot_id = v_own_lot;
    select first_name || ' ' || last_name into v_text from public.profiles where id = v_user;
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'baja completa y repetible',
      case when v_res = 'deleted' and v_res2 = 'already_deleted' and v_count = 0
                and v_text = 'Usuario eliminado'
                and not exists (select 1 from public.vehicles where user_id = v_user)
                and (select archived_at is not null from public.parking_lots where id = v_own_lot)
           then 'OK' else 'FALLA' end,
      format('1ª: %s / 2ª: %s / documentos: %s / perfil: %s', v_res, v_res2, v_count, v_text));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'baja completa y repetible', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 5. Una recarga que se paga después de la baja no se acredita.
  begin
    insert into public.mp_checkout_attempts (kind, user_id, amount, expires_at)
      values ('topup', v_user, 1000, now() + interval '30 minutes') returning id into v_attempt;
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    execute 'set local role service_role';
    v_res := public.apply_mp_payment(v_attempt, 'ggtest-deletion-2', null, 'approved', 'accredited', 1000, 'ARS');
    execute 'reset role';
    select refund_reason into v_text from public.mp_payments where mp_payment_id = 'ggtest-deletion-2';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'sin acreditaciones después de la baja',
      case when v_res = 'refund_required' and v_text = 'account_deleted' then 'OK' else 'FALLA' end,
      format('%s (%s)', v_res, v_text));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'sin acreditaciones después de la baja', 'ERROR INESPERADO', sqlerrm);
  end;

  raise exception '%', v_report;
end $$;
