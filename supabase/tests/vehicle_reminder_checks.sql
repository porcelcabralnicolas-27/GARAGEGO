-- GarageGo — verificación de las migraciones 0067 (un vehículo no puede estar en dos reservas a
-- la vez) y 0068 (recordatorio un día antes de una reserva futura).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr las dos.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (fixtures incluidos) y su mensaje ES el reporte, con una línea OK / FALLA por prueba.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Los mismos dos ids que los otros scripts de supabase/tests. Las pruebas 3 y 4 arman reservas
-- alrededor de la hora actual de Argentina: correrlo entre las 03:00 y las 21:00 para que no
-- crucen la medianoche.

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_now timestamp := date_trunc('minute', now() at time zone 'America/Argentina/Buenos_Aires');
  v_vehicle uuid;
  v_lot_a uuid := 'ffffffff-0000-0000-0000-0000000000c1';
  v_lot_b uuid := 'ffffffff-0000-0000-0000-0000000000c2';
  v_busy uuid := 'ffffffff-0000-0000-0000-0000000000d1';
  v_in_use uuid := 'ffffffff-0000-0000-0000-0000000000d2';
  v_far uuid := 'ffffffff-0000-0000-0000-0000000000d3';
  v_soon uuid := 'ffffffff-0000-0000-0000-0000000000d4';
  v_res text;
  v_count int;
begin
  perform set_config('gg.driver', '58c73669-a744-4eff-8fe1-f74d1f2af37b', true);  -- ← completar
  perform set_config('gg.owner',  'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar

  select id into v_vehicle from public.vehicles where user_id = current_setting('gg.driver')::uuid limit 1;

  -- Fixtures (como postgres, se revierten al final) ---------------------------------------
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, is_active, approval_status, moderation_state)
  values
    (v_lot_a, current_setting('gg.owner')::uuid, 'Cochera A (vehicle_reminder_checks)', 'Dirección de prueba', -34.6037, -58.3816, 100, true, 'approved', 'live'),
    (v_lot_b, current_setting('gg.owner')::uuid, 'Cochera B (vehicle_reminder_checks)', 'Dirección de prueba', -34.6037, -58.3816, 100, true, 'approved', 'live');

  insert into public.parking_availability_recurring (parking_lot_id, day_of_week, start_time, end_time)
  select l, d, '00:00', '23:30' from generate_series(0, 6) d, unnest(array[v_lot_a, v_lot_b]) l;

  update public.wallets set balance = balance + 100000 where user_id = current_setting('gg.driver')::uuid;

  -- 1. Mismo vehículo, mismo horario, otra cochera → vehicle_busy.
  v_res := '';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.create_booking(v_lot_a, current_date + 700, '10:00', '11:00', v_vehicle);
    begin
      perform public.create_booking(v_lot_b, current_date + 700, '10:30', '11:30', v_vehicle);
      v_res := 'entró la superpuesta';
    exception when others then
      v_res := sqlerrm;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'mismo vehículo en el mismo horario (0067)',
      case when v_res like '%vehicle_busy%' then 'OK' else 'FALLA' end, v_res);
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'mismo vehículo en el mismo horario (0067)', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. Mismo vehículo, horario consecutivo (11:00 pegado al fin de la anterior) → se permite.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.create_booking(v_lot_b, current_date + 700, '11:00', '12:00', v_vehicle);
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'mismo vehículo, reserva consecutiva (0067)', 'OK', 'entró la de 11:00 a 12:00');
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'mismo vehículo, reserva consecutiva (0067)', 'FALLA', sqlerrm);
  end;

  -- 3. Iniciar con el vehículo ya en una sesión en curso → vehicle_in_use; al finalizar la otra, sí.
  v_res := '';
  begin
    insert into public.bookings
      (id, user_id, parking_lot_id, date, start_time, end_time, status, total_price, vehicle_id, actual_start_at)
    values
      -- En curso: empezó hace una hora y todavía no terminó.
      (v_in_use, current_setting('gg.driver')::uuid, v_lot_a, (v_now - interval '120 minutes')::date,
       (v_now - interval '120 minutes')::time, (v_now - interval '60 minutes')::time, 'confirmed', 100, v_vehicle,
       now() - interval '115 minutes'),
      -- A punto de empezar: dentro de la ventana de inicio.
      (v_busy, current_setting('gg.driver')::uuid, v_lot_b, (v_now - interval '10 minutes')::date,
       (v_now - interval '10 minutes')::time, (v_now + interval '50 minutes')::time, 'confirmed', 100, v_vehicle, null);

    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.start_booking(v_busy);
      v_res := 'inició con el vehículo ocupado';
    exception when others then
      v_res := sqlerrm;
    end;
    execute 'reset role';

    update public.bookings set status = 'completed', actual_end_at = now() where id = v_in_use;

    execute 'set local role authenticated';
    begin
      perform public.start_booking(v_busy);
      v_res := v_res || ' / tras finalizar la otra: inició';
    exception when others then
      v_res := v_res || ' / tras finalizar la otra: ' || sqlerrm;
    end;
    execute 'reset role';

    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'iniciar con el vehículo en curso (0067)',
      case when v_res like '%vehicle_in_use%tras finalizar la otra: inició' then 'OK' else 'FALLA' end, v_res);
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'iniciar con el vehículo en curso (0067)', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. Recordatorio un día antes: una sola vez, y solo a las reservas hechas con anticipación.
  begin
    insert into public.bookings
      (id, user_id, parking_lot_id, date, start_time, end_time, status, total_price, vehicle_id, created_at)
    values
      -- Hecha hace 3 días, empieza en 23 h 50 min: entra en la ventana de 24 h.
      (v_far, current_setting('gg.driver')::uuid, v_lot_a, (v_now + interval '1430 minutes')::date,
       (v_now + interval '1430 minutes')::time, (v_now + interval '1490 minutes')::time, 'confirmed', 100, v_vehicle,
       now() - interval '3 days'),
      -- Hecha recién, empieza en 23 h: está en la ventana pero se reservó con menos de 24 h.
      (v_soon, current_setting('gg.driver')::uuid, v_lot_b, (v_now + interval '1380 minutes')::date,
       (v_now + interval '1380 minutes')::time, (v_now + interval '1440 minutes')::time, 'confirmed', 100, v_vehicle,
       now());

    perform public.send_booking_day_before_reminders();
    perform public.send_booking_day_before_reminders();

    select count(*) into v_count from public.notifications where related_booking_id = v_far and type = 'booking_reminder';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'recordatorio un día antes, sin duplicar (0068)',
      case when v_count = 1 then 'OK' else 'FALLA' end, format('avisos: %s', v_count));

    select count(*) into v_count from public.notifications where related_booking_id = v_soon and type = 'booking_reminder';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'sin recordatorio si se reservó con menos de 24 h (0068)',
      case when v_count = 0 then 'OK' else 'FALLA' end, format('avisos: %s', v_count));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'recordatorio un día antes (0068)', 'ERROR INESPERADO', sqlerrm);
  end;

  -- Revierte todo y muestra el reporte.
  raise exception '%', v_report;
end $$;
