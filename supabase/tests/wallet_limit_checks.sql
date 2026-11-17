-- GarageGo — verificación de la migración 0099 (tope de saldo con recargas de Mercado Pago), contra
-- las RPC REALES del proyecto. Sin pagos reales: los "pagos" se simulan llamando a apply_mp_payment
-- como lo hace la Edge Function (rol de servicio).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr la 0099.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (saldos, intentos, pagos y ajustes) y su mensaje ES el reporte.
--
-- Las carreras con conexiones simultáneas de verdad están en scripts/concurrency-checks.mjs.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
--   gg.owner → un usuario cualquiera (sin reservas ni recargas en curso de importancia: todo se revierte)

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_user uuid;
  v_wallet uuid;
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_res text;
  v_res2 text;
  v_balance numeric;
  v_count int;
  v_err text;
  v_err2 text;
  v_text text;
begin
  perform set_config('gg.owner', 'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar
  v_user := current_setting('gg.owner')::uuid;
  select id into v_wallet from public.wallets where user_id = v_user;

  -- Topes conocidos para la prueba (se revierten). Sin recargas abiertas previas del usuario.
  update public.app_settings set value = '200000' where key = 'wallet_max_balance';
  update public.app_settings set value = '100' where key = 'topup_min';
  update public.app_settings set value = '50000' where key = 'topup_max';
  update public.mp_checkout_attempts set status = 'expired' where user_id = v_user and kind = 'topup' and status = 'created';
  update public.profiles set deleted_at = null where id = v_user;
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);

  -- 1. Con saldo 190.000: una recarga de 6.000 entra; una segunda de 6.000 ya no, porque la primera
  --    todavía espera el pago y juntas pasarían el tope.
  begin
    update public.wallets set balance = 190000 where id = v_wallet;
    execute 'set local role authenticated';
    select attempt_id into v_a from public.begin_mp_topup(6000);
    begin
      perform public.begin_mp_topup(6000);
      v_err := 'dejó la segunda';
    exception when others then
      v_err := case when sqlerrm like '%topup_pending_limit%' then 'no dejó la segunda' else sqlerrm end;
    end;
    begin
      perform public.begin_mp_topup(20000);
      v_err2 := 'dejó pasar el saldo';
    exception when others then
      v_err2 := case when sqlerrm like '%topup_limit_reached%' then 'no dejó pasar el saldo' else sqlerrm end;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'el tope cuenta las recargas abiertas',
      case when v_a is not null and v_err = 'no dejó la segunda' and v_err2 = 'no dejó pasar el saldo' then 'OK' else 'FALLA' end,
      v_err || ' / ' || v_err2);
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'el tope cuenta las recargas abiertas', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. Máximo de 3 recargas abiertas.
  begin
    update public.mp_checkout_attempts set status = 'expired' where user_id = v_user and kind = 'topup' and status = 'created';
    update public.wallets set balance = 0 where id = v_wallet;
    execute 'set local role authenticated';
    perform public.begin_mp_topup(1000);
    perform public.begin_mp_topup(1000);
    perform public.begin_mp_topup(1000);
    begin
      perform public.begin_mp_topup(1000);
      v_err := 'dejó una cuarta';
    exception when others then
      v_err := case when sqlerrm like '%too_many_open_topups%' then 'no dejó una cuarta' else sqlerrm end;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'máximo de recargas abiertas',
      case when v_err = 'no dejó una cuarta' then 'OK' else 'FALLA' end, v_err);
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'máximo de recargas abiertas', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. Dos recargas abiertas desde antes (cuando el saldo era menor) se pagan: la primera se
  --    acredita, la segunda pasaría el tope y queda para devolver, sin tocar el saldo.
  begin
    update public.mp_checkout_attempts set status = 'expired' where user_id = v_user and kind = 'topup' and status = 'created';
    update public.wallets set balance = 190000 where id = v_wallet;
    insert into public.mp_checkout_attempts (kind, user_id, amount, expires_at)
      values ('topup', v_user, 6000, now() + interval '30 minutes') returning id into v_b;
    insert into public.mp_checkout_attempts (kind, user_id, amount, expires_at)
      values ('topup', v_user, 6000, now() + interval '30 minutes') returning id into v_c;
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    execute 'set local role service_role';
    v_res := public.apply_mp_payment(v_b, 'ggtest-wallet-1', null, 'approved', 'accredited', 6000, 'ARS');
    v_res2 := public.apply_mp_payment(v_c, 'ggtest-wallet-2', null, 'approved', 'accredited', 6000, 'ARS');
    execute 'reset role';
    select balance into v_balance from public.wallets where id = v_wallet;
    select refund_reason into v_text from public.mp_payments where mp_payment_id = 'ggtest-wallet-2';
    select status into v_err from public.mp_checkout_attempts where id = v_c;
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'el tope se vuelve a mirar al acreditar',
      case when v_res = 'credited' and v_res2 = 'refund_required' and v_text = 'limit_exceeded'
                and v_balance = 196000 and v_err = 'failed' then 'OK' else 'FALLA' end,
      format('1º: %s / 2º: %s (%s, intento %s) / saldo: %s', v_res, v_res2, v_text, v_err, v_balance));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'el tope al acreditar', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. El mismo pago dos veces no acredita dos veces; un importe distinto no se acredita.
  begin
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    execute 'set local role service_role';
    v_res := public.apply_mp_payment(v_b, 'ggtest-wallet-1', null, 'approved', 'accredited', 6000, 'ARS');
    update public.wallets set balance = 0 where id = v_wallet;
    insert into public.mp_checkout_attempts (kind, user_id, amount, expires_at)
      values ('topup', v_user, 5000, now() + interval '30 minutes') returning id into v_a;
    v_res2 := public.apply_mp_payment(v_a, 'ggtest-wallet-3', null, 'approved', 'accredited', 4000, 'ARS');
    execute 'reset role';
    select count(*) into v_count from public.wallet_transactions where payment_gateway_ref = 'mp:ggtest-wallet-1';
    select refund_reason into v_text from public.mp_payments where mp_payment_id = 'ggtest-wallet-3';
    select balance into v_balance from public.wallets where id = v_wallet;
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'idempotencia e importe incorrecto',
      case when v_res = 'already_applied' and v_count = 1 and v_res2 = 'refund_required'
                and v_text = 'amount_mismatch' and v_balance = 0 then 'OK' else 'FALLA' end,
      format('repetido: %s (%s movimiento) / importe distinto: %s (%s) / saldo: %s', v_res, v_count, v_res2, v_text, v_balance));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'idempotencia e importe incorrecto', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 5. Una cuenta eliminada no recibe acreditaciones: el pago queda para devolver.
  begin
    update public.profiles set deleted_at = now() where id = v_user;
    insert into public.mp_checkout_attempts (kind, user_id, amount, expires_at)
      values ('topup', v_user, 1000, now() + interval '30 minutes') returning id into v_a;
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    execute 'set local role service_role';
    v_res := public.apply_mp_payment(v_a, 'ggtest-wallet-4', null, 'approved', 'accredited', 1000, 'ARS');
    execute 'reset role';
    select refund_reason into v_text from public.mp_payments where mp_payment_id = 'ggtest-wallet-4';
    select balance into v_balance from public.wallets where id = v_wallet;
    update public.profiles set deleted_at = null where id = v_user;
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'cuenta eliminada no acredita',
      case when v_res = 'refund_required' and v_text = 'account_deleted' and v_balance = 0 then 'OK' else 'FALLA' end,
      format('%s (%s) / saldo: %s', v_res, v_text, v_balance));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'cuenta eliminada no acredita', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 6. La recarga de prueba (billetera ficticia) sigue respetando el tope.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    update public.wallets set balance = 199000 where id = v_wallet;
    execute 'set local role authenticated';
    begin
      perform public.topup_wallet(5000);
      v_err := 'pasó el tope';
    exception when others then
      v_err := case
        when sqlerrm like '%topup_limit_reached%' then 'respeta el tope'
        when sqlerrm like '%topup_disabled%' then 'recarga de prueba apagada en este entorno'
        else sqlerrm end;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'billetera ficticia sin cambios',
      case when v_err in ('respeta el tope', 'recarga de prueba apagada en este entorno') then 'OK' else 'FALLA' end, v_err);
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'billetera ficticia', 'ERROR INESPERADO', sqlerrm);
  end;

  raise exception '%', v_report;
end $$;
