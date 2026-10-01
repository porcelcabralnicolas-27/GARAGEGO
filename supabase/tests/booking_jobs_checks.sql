-- GarageGo — verificación de las migraciones 0065 (servicios de la cochera) y 0066 (cierre
-- automático a los 15 minutos, aviso previo y calificación solo con entrada).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr las dos.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (fixtures incluidos) y su mensaje ES el reporte, con una línea OK / FALLA por prueba.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Los mismos dos ids que lists_checks.sql / features_checks.sql.
-- Las reservas de prueba se arman alrededor de la hora actual de Argentina. Entre las 00:00 y
-- las 01:30 alguna podría cruzar la medianoche y fallar al insertarse: correrlo en otro horario.

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_now timestamp := date_trunc('minute', now() at time zone 'America/Argentina/Buenos_Aires');
  v_vehicle uuid;
  v_lot uuid := 'ffffffff-0000-0000-0000-0000000000a1';
  v_no_show uuid := 'ffffffff-0000-0000-0000-0000000000b1';
  v_forgot uuid := 'ffffffff-0000-0000-0000-0000000000b2';
  v_in_margin uuid := 'ffffffff-0000-0000-0000-0000000000b3';
  v_ending uuid := 'ffffffff-0000-0000-0000-0000000000b4';
  v_status text;
  v_start timestamptz;
  v_minutes int;
  v_count int;
  v_other int;
  v_res text;
begin
  perform set_config('gg.driver', '58c73669-a744-4eff-8fe1-f74d1f2af37b', true);  -- ← completar
  perform set_config('gg.owner',  'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar

  select id into v_vehicle from public.vehicles where user_id = current_setting('gg.driver')::uuid limit 1;

  -- Fixtures (como postgres, se revierten al final) ---------------------------------------
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, amenities, is_active, approval_status, moderation_state)
  values
    (v_lot, current_setting('gg.owner')::uuid, 'Cochera de prueba (booking_jobs_checks)', 'Dirección de prueba',
     -34.6037, -58.3816, 120, 4, array['cameras', 'ev_charger'], true, 'approved', 'live');

  update public.wallets set balance = balance + 100000 where user_id = current_setting('gg.driver')::uuid;

  -- No-show: terminó hace 20 min y nunca se inició.
  -- Olvidada: terminó hace 20 min, iniciada y sin finalizar.
  -- En margen: terminó hace 10 min (todavía no se cierra).
  -- Por terminar: en curso, termina en 10 min (le toca el aviso).
  insert into public.bookings
    (id, user_id, parking_lot_id, date, start_time, end_time, status, total_price, vehicle_id, actual_start_at)
  values
    (v_no_show, current_setting('gg.driver')::uuid, v_lot, (v_now - interval '20 minutes')::date,
     (v_now - interval '80 minutes')::time, (v_now - interval '20 minutes')::time, 'confirmed', 120, v_vehicle, null),
    (v_forgot, current_setting('gg.driver')::uuid, v_lot, (v_now - interval '20 minutes')::date,
     (v_now - interval '80 minutes')::time, (v_now - interval '20 minutes')::time, 'confirmed', 120, v_vehicle,
     now() - interval '75 minutes'),
    (v_in_margin, current_setting('gg.driver')::uuid, v_lot, (v_now - interval '10 minutes')::date,
     (v_now - interval '70 minutes')::time, (v_now - interval '10 minutes')::time, 'confirmed', 120, v_vehicle,
     now() - interval '65 minutes'),
    (v_ending, current_setting('gg.driver')::uuid, v_lot, (v_now + interval '10 minutes')::date,
     (v_now - interval '50 minutes')::time, (v_now + interval '10 minutes')::time, 'confirmed', 120, v_vehicle,
     now() - interval '45 minutes');

  -- 1. Servicios: la base acepta los conocidos y rechaza un código inventado (0065).
  begin
    update public.parking_lots set amenities = array['sauna'] where id = v_lot;
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'servicios inválidos (0065)', 'FALLA', 'aceptó "sauna"');
  exception when check_violation then
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'servicios inválidos (0065)', 'OK', sqlerrm);
  end;

  -- 2. Aviso previo: una sola notificación para la que termina en 10 min, aunque corra dos veces.
  begin
    perform public.send_booking_end_reminders();
    perform public.send_booking_end_reminders();
    select count(*) into v_count from public.notifications
    where related_booking_id = v_ending and type = 'booking_ending';
    select count(*) into v_other from public.notifications
    where related_booking_id in (v_no_show, v_forgot, v_in_margin) and type = 'booking_ending';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'aviso 15 min antes, sin duplicar (0066)',
      case when v_count = 1 and v_other = 0 then 'OK' else 'FALLA' end,
      format('avisos a la que termina: %s / a las demás: %s', v_count, v_other));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'aviso 15 min antes, sin duplicar (0066)', 'ERROR INESPERADO', sqlerrm);
  end;

  perform public.auto_close_stale_bookings();

  -- 3. No-show: cerrada, sin entrada ni excedente, y el propietario cobró.
  begin
    select status, actual_start_at, overtime_minutes into v_status, v_start, v_minutes
    from public.bookings where id = v_no_show;
    select count(*) into v_count from public.wallet_transactions
    where related_booking_id = v_no_show and type = 'earning';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'no-show cerrada a los 15 min (0066)',
      case when v_status = 'completed' and v_start is null and v_minutes = 0 and v_count = 1 then 'OK' else 'FALLA' end,
      format('estado: %s / excedente: %s min / cobro al dueño: %s', v_status, v_minutes, v_count));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'no-show cerrada a los 15 min (0066)', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. Olvidada: cerrada con 15 min de excedente cobrados.
  begin
    select status, overtime_minutes into v_status, v_minutes from public.bookings where id = v_forgot;
    select count(*) into v_count from public.wallet_transactions
    where related_booking_id = v_forgot and type = 'overtime_charge';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'olvidada: excedente de 15 min (0066)',
      case when v_status = 'completed' and v_minutes = 15 and v_count = 1 then 'OK' else 'FALLA' end,
      format('estado: %s / excedente: %s min / cargos: %s', v_status, v_minutes, v_count));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'olvidada: excedente de 15 min (0066)', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 5. Dentro del margen: sigue abierta.
  select status into v_status from public.bookings where id = v_in_margin;
  v_report := v_report || e'\n' || concat_ws(' | ', 5, 'dentro de los 15 min sigue abierta (0066)',
    case when v_status = 'confirmed' then 'OK' else 'FALLA' end, format('estado: %s', v_status));

  -- 6. Calificar: la no-show no se puede, la olvidada (con entrada) sí.
  v_res := '';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.ratings (booking_id, parking_lot_id, user_id, score)
      values (v_no_show, v_lot, current_setting('gg.driver')::uuid, 5);
      v_res := 'no-show: calificó';
    exception when others then
      v_res := 'no-show: rechazada';
    end;
    begin
      insert into public.ratings (booking_id, parking_lot_id, user_id, score)
      values (v_forgot, v_lot, current_setting('gg.driver')::uuid, 5);
      v_res := v_res || ' / con entrada: calificó';
    exception when others then
      v_res := v_res || ' / con entrada: ' || sqlerrm;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'calificar solo con entrada (0066)',
      case when v_res = 'no-show: rechazada / con entrada: calificó' then 'OK' else 'FALLA' end, v_res);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'calificar solo con entrada (0066)', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 7. El job de pg_cron corre cada minuto.
  select count(*) into v_count from cron.job
  where jobname = 'garagego-auto-close-bookings' and schedule = '* * * * *' and active;
  v_report := v_report || e'\n' || concat_ws(' | ', 7, 'job cada minuto (0066)',
    case when v_count = 1 then 'OK' else 'FALLA' end, format('jobs: %s', v_count));

  -- Revierte todo y muestra el reporte.
  raise exception '%', v_report;
end $$;
