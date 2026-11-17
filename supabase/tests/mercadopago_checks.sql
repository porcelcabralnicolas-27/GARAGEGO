-- GarageGo — verificación de la migración 0084 (Mercado Pago: reservas, recargas y reembolsos).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr la 0084.
--
-- No necesita Mercado Pago: llama a apply_mp_payment / record_mp_refund directamente, como lo
-- harían las Edge Functions con un pago ya consultado en la API.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (fixtures incluidos) y su mensaje ES el reporte, con una línea OK / FALLA por prueba.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Los mismos dos ids que lists_checks.sql / features_checks.sql (un conductor y un propietario
-- distintos).

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_driver uuid;
  v_owner uuid;
  v_vehicle uuid;
  v_vehicle2 uuid;
  v_vehicle3 uuid;
  v_lot uuid := 'ffffffff-0000-0000-0000-0000000084a1';
  v_lot2 uuid := 'ffffffff-0000-0000-0000-0000000084a2';
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_p6 uuid; v_w1 uuid;
  v_a1 uuid; v_a2 uuid; v_a3 uuid; v_a5 uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid;
  v_status text;
  v_method text;
  v_deadline timestamptz;
  v_paid_at timestamptz;
  v_balance numeric;
  v_balance0 numeric;
  v_count int;
  v_other int;
  v_extra int;
  v_count2 int;
  v_text text;
  v_res text;
  v_ok boolean;
begin
  perform set_config('gg.driver', '58c73669-a744-4eff-8fe1-f74d1f2af37b', true);  -- ← completar
  perform set_config('gg.owner',  'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar
  v_driver := current_setting('gg.driver')::uuid;
  v_owner := current_setting('gg.owner')::uuid;

  -- Fixtures (como postgres, se revierten al final) ---------------------------------------
  -- Tres vehículos (uno por reserva simultánea, regla de la 0067), dos cocheras de capacidad 1
  -- abiertas todos los días de 8 a 20, y el saldo del conductor en 0.
  insert into public.vehicles (user_id, plate, brand, model)
  select v_driver, 'GGMP' || n, 'Prueba', 'Prueba'
  from generate_series(1, 3 - (select count(*) from public.vehicles where user_id = v_driver)::int) n;
  select (array_agg(id order by created_at))[1], (array_agg(id order by created_at))[2], (array_agg(id order by created_at))[3]
  into v_vehicle, v_vehicle2, v_vehicle3
  from public.vehicles where user_id = v_driver;

  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, is_active, approval_status, moderation_state)
  values
    (v_lot, v_owner, 'Cochera de prueba (mercadopago_checks)', 'Dirección de prueba', -34.6037, -58.3816, 100, 1, true, 'approved', 'live'),
    (v_lot2, v_owner, 'Cochera 2 de prueba (mercadopago_checks)', 'Dirección de prueba', -34.6037, -58.3816, 100, 1, true, 'approved', 'live');

  insert into public.parking_availability_recurring (parking_lot_id, day_of_week, start_time, end_time)
  select l, d, '08:00', '20:00' from generate_series(0, 6) d, unnest(array[v_lot, v_lot2]) l;

  update public.wallets set balance = 0 where user_id = v_driver;

  -- Las reservas de MP que el conductor ya tuviera pendientes ocuparían el tope de 2.
  update public.bookings set status = 'cancelled'
  where user_id = v_driver and status = 'pending' and payment_method = 'mercadopago';

  -- 1. Reserva pendiente: sin plata en la billetera, sin movimientos ni aviso al propietario.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_p1 := public.create_booking_pending_payment(v_lot, current_date + 600, '10:00', '11:00', v_vehicle);
    execute 'reset role';

    select status, payment_method, payment_deadline into v_status, v_method, v_deadline from public.bookings where id = v_p1;
    select count(*) into v_count from public.wallet_transactions where related_booking_id = v_p1;
    select count(*) into v_other from public.notifications where related_booking_id = v_p1;
    v_ok := v_status = 'pending' and v_method = 'mercadopago'
      and v_deadline between now() + interval '9 minutes' and now() + interval '11 minutes'
      and v_count = 0 and v_other = 0;
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'reserva pendiente sin saldo, sin movimientos ni aviso',
      case when v_ok then 'OK' else 'FALLA' end,
      format('estado: %s / método: %s / plazo en %s min / movimientos: %s / avisos: %s',
             v_status, v_method, round(extract(epoch from (v_deadline - now())) / 60), v_count, v_other));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'reserva pendiente sin saldo, sin movimientos ni aviso', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. Valida igual que create_booking.
  v_res := '';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.create_booking_pending_payment(v_lot2, current_date - 1, '10:00', '11:00', v_vehicle2);
      v_res := v_res || 'pasado: entró';
    exception when others then v_res := v_res || 'pasado: ' || sqlerrm; end;
    begin
      perform public.create_booking_pending_payment(v_lot2, current_date + 600, '14:00', '15:00', gen_random_uuid());
      v_res := v_res || ' / vehículo ajeno: entró';
    exception when others then v_res := v_res || ' / vehículo ajeno: ' || sqlerrm; end;
    begin
      perform public.create_booking_pending_payment(v_lot2, current_date + 600, '10:00', '11:00', v_vehicle);
      v_res := v_res || ' / vehículo ocupado: entró';
    exception when others then v_res := v_res || ' / vehículo ocupado: ' || sqlerrm; end;
    begin
      perform public.create_booking_pending_payment(v_lot, current_date + 600, '10:30', '11:30', v_vehicle2);
      v_res := v_res || ' / lugar ocupado por una pendiente: entró';
    exception when others then v_res := v_res || ' / lugar ocupado por una pendiente: ' || sqlerrm; end;
    execute 'reset role';
    v_ok := v_res like 'pasado: booking_in_past%' and v_res like '%vehículo ajeno: vehicle_not_found%'
      and v_res like '%vehículo ocupado: vehicle_busy%' and v_res like '%pendiente: buffer_conflict%';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'mismas validaciones que create_booking',
      case when v_ok then 'OK' else 'FALLA' end, v_res);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'mismas validaciones que create_booking', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. Tope de 2 reservas esperando pago.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_p2 := public.create_booking_pending_payment(v_lot, current_date + 601, '10:00', '11:00', v_vehicle2);
    begin
      perform public.create_booking_pending_payment(v_lot, current_date + 602, '10:00', '11:00', v_vehicle3);
      v_res := 'entró una tercera';
    exception when others then v_res := sqlerrm; end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'tope de 2 pendientes',
      case when v_res like '%too_many_pending_payments%' then 'OK' else 'FALLA' end, 'tercera: ' || v_res);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'tope de 2 pendientes', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. Intentos de pago: solo el dueño de la reserva, con plazo, hasta 5.
  v_res := '';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform * from public.begin_mp_payment_attempt(v_p1);
      v_res := 'otro usuario: entró';
    exception when others then v_res := 'otro usuario: ' || sqlerrm; end;
    execute 'reset role';

    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    for i in 1..6 loop
      select attempt_id into v_a2 from public.begin_mp_payment_attempt(v_p2);
    end loop;
    v_res := v_res || ' / sexto intento: entró';
    execute 'reset role';
  exception when others then
    -- El sexto intento revierte el bloque entero (también los cinco anteriores).
    v_res := v_res || ' / sexto intento: ' || sqlerrm;
  end;
  -- El bloque de arriba se revirtió entero en el sexto intento: se rehacen los intentos válidos.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select attempt_id into v_a1 from public.begin_mp_payment_attempt(v_p1);
    select attempt_id into v_a2 from public.begin_mp_payment_attempt(v_p2);
    execute 'reset role';

    update public.bookings set payment_deadline = now() + interval '30 seconds' where id = v_p2;
    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform * from public.begin_mp_payment_attempt(v_p2);
      v_res := v_res || ' / plazo casi vencido: entró';
    exception when others then v_res := v_res || ' / plazo casi vencido: ' || sqlerrm; end;
    execute 'reset role';
    update public.bookings set payment_deadline = now() + interval '10 minutes' where id = v_p2;

    v_ok := v_res like 'otro usuario: Reserva no encontrada%' and v_res like '%sexto intento: too_many_payment_attempts%'
      and v_res like '%plazo casi vencido: payment_window_over%' and v_a1 is not null and v_a2 is not null;
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'intentos: dueño, plazo y tope de 5',
      case when v_ok then 'OK' else 'FALLA' end, v_res);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'intentos: dueño, plazo y tope de 5', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 5. Pago aprobado: confirma, recarga + pago de reserva (saldo igual) y los dos avisos.
  begin
    select balance into v_balance0 from public.wallets where user_id = v_driver;
    v_text := public.apply_mp_payment(v_a1, 'TEST-PAY-A1', 'TEST-ORD-1', 'approved', 'accredited', 100, 'ARS');
    select status, paid_at into v_status, v_paid_at from public.bookings where id = v_p1;
    select balance into v_balance from public.wallets where user_id = v_driver;
    select count(*) into v_count from public.wallet_transactions
    where related_booking_id = v_p1
      and ((type = 'topup' and amount = 100 and payment_gateway_ref = 'mp:TEST-PAY-A1')
        or (type = 'booking_payment' and amount = -100));
    select count(*) into v_other from public.notifications
    where related_booking_id = v_p1
      and ((type = 'booking_created' and user_id = v_owner) or (type = 'payment_approved' and user_id = v_driver));
    v_ok := v_text = 'confirmed' and v_status = 'confirmed' and v_paid_at is not null
      and v_balance = v_balance0 and v_count = 2 and v_other = 2;
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'aprobado: confirma, saldo igual, avisos',
      case when v_ok then 'OK' else 'FALLA' end,
      format('resultado: %s / estado: %s / saldo antes %s después %s / movimientos: %s de 2 / avisos: %s de 2',
             v_text, v_status, v_balance0, v_balance, v_count, v_other));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'aprobado: confirma, saldo igual, avisos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 6. El mismo pago otra vez (webhook repetido): no hace nada.
  begin
    v_text := public.apply_mp_payment(v_a1, 'TEST-PAY-A1', 'TEST-ORD-1', 'approved', 'accredited', 100, 'ARS');
    select count(*) into v_count from public.wallet_transactions where related_booking_id = v_p1;
    select count(*) into v_other from public.notifications where related_booking_id = v_p1;
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'mismo pago dos veces',
      case when v_text = 'already_applied' and v_count = 2 and v_other = 2 then 'OK' else 'FALLA' end,
      format('resultado: %s / movimientos: %s / avisos: %s', v_text, v_count, v_other));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'mismo pago dos veces', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 7. Rechazado y después aprobado en el mismo intento: confirma.
  begin
    v_text := public.apply_mp_payment(v_a2, 'TEST-PAY-R2', 'TEST-ORD-2', 'rejected', 'cc_rejected_other_reason', 100, 'ARS');
    select status into v_status from public.bookings where id = v_p2;
    v_res := format('rechazado: %s (reserva %s)', v_text, v_status);
    v_text := public.apply_mp_payment(v_a2, 'TEST-PAY-A2', 'TEST-ORD-2', 'approved', 'accredited', 100, 'ARS');
    select status into v_status from public.bookings where id = v_p2;
    v_res := v_res || format(' / aprobado: %s (reserva %s)', v_text, v_status);
    v_report := v_report || e'\n' || concat_ws(' | ', 7, 'rechazado y después aprobado',
      case when v_res = 'rechazado: recorded (reserva pending) / aprobado: confirmed (reserva confirmed)' then 'OK' else 'FALLA' end, v_res);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 7, 'rechazado y después aprobado', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 8. Monto distinto: se marca para reembolsar y la reserva sigue esperando.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_p3 := public.create_booking_pending_payment(v_lot, current_date + 602, '10:00', '11:00', v_vehicle3);
    select attempt_id into v_a3 from public.begin_mp_payment_attempt(v_p3);
    execute 'reset role';
    v_text := public.apply_mp_payment(v_a3, 'TEST-PAY-M3', 'TEST-ORD-3', 'approved', 'accredited', 99, 'ARS');
    select status into v_status from public.bookings where id = v_p3;
    select refund_status || '/' || refund_reason into v_res from public.mp_payments where mp_payment_id = 'TEST-PAY-M3';
    v_report := v_report || e'\n' || concat_ws(' | ', 8, 'monto distinto se reembolsa',
      case when v_text = 'refund_required' and v_status = 'pending' and v_res = 'required/amount_mismatch' then 'OK' else 'FALLA' end,
      format('resultado: %s / reserva: %s / reembolso: %s', v_text, v_status, v_res));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 8, 'monto distinto se reembolsa', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 9. Cancelar una pendiente sin pagar: sin reintegro, intentos vencidos, sin aviso al dueño.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.cancel_booking(v_p3);
    execute 'reset role';
    select status into v_status from public.bookings where id = v_p3;
    select count(*) into v_count from public.wallet_transactions where related_booking_id = v_p3;
    select count(*) into v_other from public.notifications where related_booking_id = v_p3 and user_id = v_owner;
    select count(*) into v_extra from public.mp_checkout_attempts where booking_id = v_p3 and status = 'created';
    v_report := v_report || e'\n' || concat_ws(' | ', 9, 'cancelar pendiente sin pagar',
      case when v_status = 'cancelled' and v_count = 0 and v_other = 0 and v_extra = 0 then 'OK' else 'FALLA' end,
      format('estado: %s / movimientos: %s / avisos al dueño: %s / intentos abiertos: %s', v_status, v_count, v_other, v_extra));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 9, 'cancelar pendiente sin pagar', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 10. Aprobado sobre una reserva cancelada: se reembolsa (tarde), se registra y avisa una vez.
  begin
    v_text := public.apply_mp_payment(v_a3, 'TEST-PAY-L3', 'TEST-ORD-3', 'approved', 'accredited', 100, 'ARS');
    v_res := 'aprobado tarde: ' || v_text;
    select refund_reason into v_status from public.mp_payments where mp_payment_id = 'TEST-PAY-L3';
    v_res := v_res || ' (' || v_status || ')';
    perform public.record_mp_refund('TEST-PAY-L3', 'TEST-REF-L3', true);
    perform public.record_mp_refund('TEST-PAY-L3', 'TEST-REF-L3', true);
    select refund_status into v_status from public.mp_payments where mp_payment_id = 'TEST-PAY-L3';
    select count(*) into v_count from public.notifications where related_booking_id = v_p3 and type = 'payment_refunded';
    v_text := public.apply_mp_payment(v_a3, 'TEST-PAY-L3', 'TEST-ORD-3', 'approved', 'accredited', 100, 'ARS');
    v_res := v_res || format(' / reembolso: %s / avisos: %s / reaplicar: %s', v_status, v_count, v_text);
    v_report := v_report || e'\n' || concat_ws(' | ', 10, 'aprobado sobre cancelada: reembolso',
      case when v_res = 'aprobado tarde: refund_required (late) / reembolso: done / avisos: 1 / reaplicar: already_refunded' then 'OK' else 'FALLA' end, v_res);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 10, 'aprobado sobre cancelada: reembolso', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 11. Un segundo pago aprobado sobre una reserva ya pagada: se reembolsa.
  begin
    v_text := public.apply_mp_payment(v_a1, 'TEST-PAY-D1', 'TEST-ORD-1', 'approved', 'accredited', 100, 'ARS');
    select refund_status || '/' || refund_reason into v_res from public.mp_payments where mp_payment_id = 'TEST-PAY-D1';
    select count(*) into v_count from public.wallet_transactions where related_booking_id = v_p1;
    v_report := v_report || e'\n' || concat_ws(' | ', 11, 'segundo pago sobre reserva pagada',
      case when v_text = 'refund_required' and v_res = 'required/duplicate' and v_count = 2 then 'OK' else 'FALLA' end,
      format('resultado: %s / reembolso: %s / movimientos: %s', v_text, v_res, v_count));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 11, 'segundo pago sobre reserva pagada', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 12. Cancelar reservas pagadas con MP (conductor y propietario): devolución a MP, saldo igual.
  begin
    select balance into v_balance0 from public.wallets where user_id = v_driver;
    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.cancel_booking(v_p1);
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.cancel_booking(v_p2);
    execute 'reset role';

    select balance into v_balance from public.wallets where user_id = v_driver;
    select count(*) into v_count from public.wallet_transactions
    where (related_booking_id = v_p1 and ((type = 'refund' and amount = 100)
             or (type = 'adjustment' and amount = -100 and payment_gateway_ref = 'mp-refund:TEST-PAY-A1')))
       or (related_booking_id = v_p2 and ((type = 'refund' and amount = 100)
             or (type = 'adjustment' and amount = -100 and payment_gateway_ref = 'mp-refund:TEST-PAY-A2')));
    select count(*) into v_other from public.mp_payments
    where mp_payment_id in ('TEST-PAY-A1', 'TEST-PAY-A2') and refund_status = 'required' and refund_reason = 'cancelled';
    v_text := public.apply_mp_payment(v_a1, 'TEST-PAY-A1', 'TEST-ORD-1', 'approved', 'accredited', 100, 'ARS');
    v_report := v_report || e'\n' || concat_ws(' | ', 12, 'cancelar pagadas con MP: devolución a MP',
      case when v_balance = v_balance0 and v_count = 4 and v_other = 2 and v_text = 'already_applied' then 'OK' else 'FALLA' end,
      format('saldo antes %s después %s / movimientos: %s de 4 / reembolsos pendientes: %s de 2 / reaplicar: %s',
             v_balance0, v_balance, v_count, v_other, v_text));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 12, 'cancelar pagadas con MP: devolución a MP', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 13. Recargas: topes, acreditación única, vencida igual se acredita, monto distinto se reembolsa.
  v_res := '';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform * from public.begin_mp_topup(50001);
      v_res := 'más de $50.000: entró';
    exception when others then v_res := 'más de $50.000: ' || sqlerrm; end;
    execute 'reset role';

    update public.wallets set balance = 199000 where user_id = v_driver;
    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform * from public.begin_mp_topup(5000);
      v_res := v_res || ' / pasando el tope: entró';
    exception when others then v_res := v_res || ' / pasando el tope: ' || sqlerrm; end;
    execute 'reset role';
    update public.wallets set balance = 0 where user_id = v_driver;

    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select attempt_id into v_t1 from public.begin_mp_topup(5000);
    select attempt_id into v_t2 from public.begin_mp_topup(5000);
    select attempt_id into v_t3 from public.begin_mp_topup(5000);
    execute 'reset role';

    v_text := public.apply_mp_payment(v_t1, 'TEST-PAY-T1', 'TEST-ORD-T1', 'approved', 'accredited', 5000, 'ARS');
    v_res := v_res || ' / recarga: ' || v_text;
    v_text := public.apply_mp_payment(v_t1, 'TEST-PAY-T1', 'TEST-ORD-T1', 'approved', 'accredited', 5000, 'ARS');
    v_res := v_res || ' / repetida: ' || v_text;

    update public.mp_checkout_attempts set expires_at = now() - interval '10 minutes' where id = v_t2;
    perform public.expire_unpaid_bookings();
    select status into v_status from public.mp_checkout_attempts where id = v_t2;
    v_text := public.apply_mp_payment(v_t2, 'TEST-PAY-T2', 'TEST-ORD-T2', 'approved', 'accredited', 5000, 'ARS');
    v_res := v_res || format(' / vencida (%s): %s', v_status, v_text);

    v_text := public.apply_mp_payment(v_t3, 'TEST-PAY-T3', 'TEST-ORD-T3', 'approved', 'accredited', 4000, 'ARS');
    v_res := v_res || ' / monto distinto: ' || v_text;

    select balance into v_balance from public.wallets where user_id = v_driver;
    select count(*) into v_count from public.wallet_transactions where payment_gateway_ref in ('mp:TEST-PAY-T1', 'mp:TEST-PAY-T2', 'mp:TEST-PAY-T3');
    select count(*) into v_other from public.notifications where user_id = v_driver and type = 'topup_approved' and created_at >= now();
    v_ok := v_res = 'más de $50.000: invalid_topup_amount / pasando el tope: topup_limit_reached / recarga: credited / repetida: already_applied / vencida (expired): credited / monto distinto: refund_required'
      and v_balance = 10000 and v_count = 2 and v_other = 2;
    v_report := v_report || e'\n' || concat_ws(' | ', 13, 'recargas con Mercado Pago',
      case when v_ok then 'OK' else 'FALLA' end,
      v_res || format(' / saldo: %s (esperado 10000) / movimientos: %s / avisos: %s', v_balance, v_count, v_other));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 13, 'recargas con Mercado Pago', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 14. Regresión: pagar y cancelar con billetera sigue igual (reintegro a la billetera).
  begin
    update public.wallets set balance = 10000 where user_id = v_driver;
    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_w1 := public.create_booking(v_lot, current_date + 603, '10:00', '11:00', v_vehicle);
    select balance into v_balance0 from public.wallets where user_id = v_driver;
    perform public.cancel_booking(v_w1);
    execute 'reset role';
    select balance into v_balance from public.wallets where user_id = v_driver;
    select payment_method into v_method from public.bookings where id = v_w1;
    v_report := v_report || e'\n' || concat_ws(' | ', 14, 'billetera: pagar y cancelar igual que antes',
      case when v_method = 'wallet' and v_balance0 = 9900 and v_balance = 10000 then 'OK' else 'FALLA' end,
      format('método: %s / saldo después de pagar: %s / después de cancelar: %s', v_method, v_balance0, v_balance));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 14, 'billetera: pagar y cancelar igual que antes', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 15. Vencimiento: cancela solo las vencidas y avisa; las demás siguen esperando.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_p4 := public.create_booking_pending_payment(v_lot, current_date + 604, '10:00', '11:00', v_vehicle2);
    v_p5 := public.create_booking_pending_payment(v_lot, current_date + 605, '10:00', '11:00', v_vehicle3);
    execute 'reset role';
    update public.bookings set payment_deadline = now() - interval '6 minutes' where id = v_p4;
    perform public.expire_unpaid_bookings();
    select status into v_status from public.bookings where id = v_p4;
    select status into v_text from public.bookings where id = v_p5;
    select count(*) into v_count from public.notifications where related_booking_id = v_p4 and type = 'payment_expired';
    v_report := v_report || e'\n' || concat_ws(' | ', 15, 'vencimiento de pendientes',
      case when v_status = 'cancelled' and v_text = 'pending' and v_count = 1 then 'OK' else 'FALLA' end,
      format('vencida: %s / en plazo: %s / avisos: %s', v_status, v_text, v_count));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 15, 'vencimiento de pendientes', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 16. Reserva pagada con MP que finaliza: el propietario cobra el total.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select attempt_id into v_a5 from public.begin_mp_payment_attempt(v_p5);
    execute 'reset role';
    v_text := public.apply_mp_payment(v_a5, 'TEST-PAY-A5', 'TEST-ORD-5', 'approved', 'accredited', 100, 'ARS');
    perform public._finalize_booking(v_p5, now() at time zone 'America/Argentina/Buenos_Aires');
    select status into v_status from public.bookings where id = v_p5;
    select count(*) into v_count from public.wallet_transactions where related_booking_id = v_p5 and type = 'earning' and amount = 100;
    v_report := v_report || e'\n' || concat_ws(' | ', 16, 'al finalizar el propietario cobra',
      case when v_text = 'confirmed' and v_status = 'completed' and v_count = 1 then 'OK' else 'FALLA' end,
      format('pago: %s / estado: %s / cobros: %s', v_text, v_status, v_count));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 16, 'al finalizar el propietario cobra', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 17. Permisos: la app no puede aplicar pagos, registrar reembolsos, vencer ni tocar las tablas.
  v_res := '';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.apply_mp_payment(v_a5, 'TEST-PAY-X', null, 'approved', null, 100, 'ARS');
      v_res := v_res || 'apply: permitido';
    exception when insufficient_privilege then v_res := v_res || 'apply: bloqueado'; end;
    begin
      perform public.record_mp_refund('TEST-PAY-D1', 'X', true);
      v_res := v_res || ' / record: permitido';
    exception when insufficient_privilege then v_res := v_res || ' / record: bloqueado'; end;
    begin
      perform public.expire_unpaid_bookings();
      v_res := v_res || ' / expire: permitido';
    exception when insufficient_privilege then v_res := v_res || ' / expire: bloqueado'; end;
    begin
      perform 1 from public.mp_payments limit 1;
      v_res := v_res || ' / leer pagos: permitido';
    exception when insufficient_privilege then v_res := v_res || ' / leer pagos: bloqueado'; end;
    begin
      insert into public.mp_checkout_attempts (kind, user_id, amount, expires_at) values ('topup', v_driver, 1, now());
      v_res := v_res || ' / crear intento: permitido';
    exception when insufficient_privilege then v_res := v_res || ' / crear intento: bloqueado'; end;
    select count(*) into v_count from public.get_booking_payment_status(v_p5);
    execute 'reset role';

    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_other from public.get_booking_payment_status(v_p5);
    execute 'reset role';
    v_res := v_res || format(' / estado propio: %s / estado ajeno: %s', v_count, v_other);

    v_report := v_report || e'\n' || concat_ws(' | ', 17, 'permisos',
      case when v_res = 'apply: bloqueado / record: bloqueado / expire: bloqueado / leer pagos: bloqueado / crear intento: bloqueado / estado propio: 1 / estado ajeno: 0' then 'OK' else 'FALLA' end, v_res);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 17, 'permisos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 18. El propietario no ve las reservas de MP sin pagar (ni pendientes ni vencidas).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_p6 := public.create_booking_pending_payment(v_lot, current_date + 606, '10:00', '11:00', v_vehicle2);
    execute 'reset role';

    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_count from public.list_owner_bookings('active', 100) r where r.id = v_p6;
    select count(*) into v_other from public.list_owner_bookings('history', 100) r where r.id = v_p4;
    select count(*) into v_extra from public.get_owner_booking(v_p4);
    select count(*) into v_count2 from public.get_owner_booking(v_p5);
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 18, 'el propietario no ve las sin pagar',
      case when v_count = 0 and v_other = 0 and v_extra = 0 and v_count2 = 1 then 'OK' else 'FALLA' end,
      format('pendiente en su lista: %s / vencida en historial: %s / detalle de la vencida: %s / detalle de la pagada: %s',
             v_count, v_other, v_extra, v_count2));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 18, 'el propietario no ve las sin pagar', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 19. El job de pg_cron corre sin errores con el paso nuevo.
  begin
    perform public.run_booking_jobs();
    v_report := v_report || e'\n' || concat_ws(' | ', 19, 'run_booking_jobs con vencimiento', 'OK', 'corrió sin errores');
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 19, 'run_booking_jobs con vencimiento', 'FALLA', sqlerrm);
  end;

  -- Revierte todo y muestra el reporte.
  raise exception '%', v_report;
end $$;
