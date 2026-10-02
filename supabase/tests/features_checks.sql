-- GarageGo — verificación de las migraciones 0062 (detalle de reserva del propietario), 0063
-- (tickets por rol) y 0064 (capacidad de la cochera), contra las policies REALES del proyecto.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr las tres.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (fixtures incluidos) y su mensaje ES el reporte, con una línea OK / FALLA por prueba.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Los mismos dos ids que lists_checks.sql:
--   gg.driver  → un usuario conductor con al menos un vehículo (que NO sea admin)
--   gg.owner   → otro usuario (dueño de las cocheras de prueba que arma este script)
--
-- Las carreras con conexiones simultáneas contra una cochera de capacidad 2 las prueba
-- scripts/concurrency-checks.mjs.

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_count int;
  v_other int;
  v_text text;
  v_res text;
  v_vehicle uuid;
  v_vehicle2 uuid;
  v_vehicle3 uuid;
  v_booking uuid := 'ffffffff-0000-0000-0000-00000000000b';
  v_lot uuid := 'ffffffff-0000-0000-0000-00000000000c';
  v_cap_lot uuid := 'ffffffff-0000-0000-0000-00000000000d';
begin
  perform set_config('gg.driver', '58c73669-a744-4eff-8fe1-f74d1f2af37b', true);  -- ← completar
  perform set_config('gg.owner',  'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar

  -- Desde la 0067 un vehículo no puede estar en dos reservas a la vez: las pruebas de capacidad
  -- necesitan tres vehículos distintos. Se completan hasta los 3 que permite el sistema (se
  -- revierten con el resto).
  insert into public.vehicles (user_id, plate, brand, model)
  select current_setting('gg.driver')::uuid, 'GGTEST' || n, 'Prueba', 'Prueba'
  from generate_series(1, 3 - (select count(*) from public.vehicles where user_id = current_setting('gg.driver')::uuid)::int) n;
  select (array_agg(id order by created_at))[1], (array_agg(id order by created_at))[2], (array_agg(id order by created_at))[3]
  into v_vehicle, v_vehicle2, v_vehicle3
  from public.vehicles where user_id = current_setting('gg.driver')::uuid;

  -- Fixtures (como postgres, se revierten al final) ---------------------------------------
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, is_active, approval_status, moderation_state)
  values
    (v_lot, current_setting('gg.owner')::uuid, 'Cochera de prueba (features_checks)', 'Dirección de prueba',
     -34.6037, -58.3816, 100, 1, true, 'approved', 'live'),
    (v_cap_lot, current_setting('gg.owner')::uuid, 'Cochera de capacidad 2 (features_checks)', 'Dirección de prueba',
     -34.6037, -58.3816, 100, 2, true, 'approved', 'live');

  insert into public.parking_availability_recurring (parking_lot_id, day_of_week, start_time, end_time)
  select l, d, '08:00', '20:00' from generate_series(0, 6) d, unnest(array[v_lot, v_cap_lot]) l;

  update public.wallets set balance = balance + 100000 where user_id = current_setting('gg.driver')::uuid;

  insert into public.bookings (id, user_id, parking_lot_id, date, start_time, end_time, status, total_price, vehicle_id)
  values (v_booking, current_setting('gg.driver')::uuid, v_lot, current_date - 400, '10:00', '11:00', 'completed', 100, v_vehicle);

  insert into public.support_tickets (reporter_id, reporter_role, subject, category)
  values
    (current_setting('gg.driver')::uuid, 'client', 'ticket como conductor (features_checks)', 'other'),
    (current_setting('gg.driver')::uuid, 'owner', 'ticket como propietario (features_checks)', 'other');

  -- 1. get_owner_booking: el dueño la ve con dirección y cliente; el conductor no.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_count from public.get_owner_booking(v_booking) r
    where r.parking_lot_address = 'Dirección de prueba' and r.client_name is not null;
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_other from public.get_owner_booking(v_booking);
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'get_owner_booking (0062)',
      case when v_count = 1 and v_other = 0 then 'OK' else 'FALLA' end,
      format('dueño: %s / conductor: %s', v_count, v_other));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'get_owner_booking (0062)', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. list_my_tickets: cada modo ve solo los tickets abiertos desde él.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) filter (where r.reporter_role <> 'client'),
           count(*) filter (where r.subject = 'ticket como conductor (features_checks)')
    into v_other, v_count
    from public.list_my_tickets('client', 100) r;
    select v_other + count(*) filter (where r.reporter_role <> 'owner'),
           v_count + count(*) filter (where r.subject = 'ticket como propietario (features_checks)')
    into v_other, v_count
    from public.list_my_tickets('owner', 100) r;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'tickets por rol (0063)',
      case when v_count = 2 and v_other = 0 then 'OK' else 'FALLA' end,
      format('encontrados en su modo: %s de 2 / en el modo equivocado: %s', v_count, v_other));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'tickets por rol (0063)', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. Capacidad 2: entran dos autos en el mismo horario y el tercero no.
  v_res := '';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.create_booking(v_cap_lot, current_date + 500, '10:00', '11:00', v_vehicle);
    perform public.create_booking(v_cap_lot, current_date + 500, '10:00', '11:00', v_vehicle2);
    begin
      perform public.create_booking(v_cap_lot, current_date + 500, '10:30', '11:30', v_vehicle3);
      v_res := 'entró un tercer auto';
    exception when others then
      v_res := sqlerrm;
    end;
    execute 'reset role';
    select count(*) into v_count from public.bookings where parking_lot_id = v_cap_lot and date = current_date + 500;
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'capacidad 2: dos sí, tercero no (0064)',
      case when v_count = 2 and v_res like '%buffer_conflict%' then 'OK' else 'FALLA' end,
      format('reservas: %s / tercera: %s', v_count, v_res));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'capacidad 2: dos sí, tercero no (0064)', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. Capacidad 2 mide el máximo simultáneo, no el total: 10-11 y 12-13 dejan lugar para 10-13.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.create_booking(v_cap_lot, current_date + 501, '10:00', '11:00', v_vehicle);
    perform public.create_booking(v_cap_lot, current_date + 501, '12:00', '13:00', v_vehicle);
    perform public.create_booking(v_cap_lot, current_date + 501, '10:00', '13:00', v_vehicle2);
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'capacidad: máximo y no total (0064)', 'OK', 'entró la de 10 a 13');
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'capacidad: máximo y no total (0064)', 'FALLA', sqlerrm);
  end;

  -- 5. Capacidad 1 sigue como antes: misma hora rechazada, y el margen de 15 min se respeta.
  v_res := '';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.create_booking(v_lot, current_date + 502, '10:00', '11:00', v_vehicle);
    begin
      perform public.create_booking(v_lot, current_date + 502, '10:00', '11:00', v_vehicle2);
      v_res := 'misma hora: entró';
    exception when others then
      v_res := 'misma hora: ' || sqlerrm;
    end;
    begin
      perform public.create_booking(v_lot, current_date + 502, '11:00', '11:30', v_vehicle3);
      v_res := v_res || ' / pegada: entró';
    exception when others then
      v_res := v_res || ' / pegada: ' || sqlerrm;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'capacidad 1 sin cambios (0064)',
      case when v_res like 'misma hora: %buffer_conflict% / pegada: %buffer_conflict%' then 'OK' else 'FALLA' end,
      v_res);
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'capacidad 1 sin cambios (0064)', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 6. El rango de capacidad lo valida la base (1 a 50).
  begin
    update public.parking_lots set capacity = 0 where id = v_lot;
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'capacidad fuera de rango (0064)', 'FALLA', 'aceptó capacidad 0');
  exception when check_violation then
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'capacidad fuera de rango (0064)', 'OK', sqlerrm);
  end;

  -- Revierte todo y muestra el reporte.
  raise exception '%', v_report;
end $$;
