-- GarageGo — verificación de la migración 0098 (separación por país en el servidor), contra las
-- policies y RPC REALES del proyecto.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr la 0098.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (cocheras, vehículos, reservas, saldos y regiones cambiadas) y su mensaje ES el reporte.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Completar los dos ids del principio del bloque (los mismos que checklist_checks.sql):
--   gg.owner → un usuario SIN permisos de admin: hace de conductor
--   gg.admin → un usuario con is_admin = true: es el dueño de las cocheras de prueba

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_lot_ar uuid := 'ffffffff-0000-0000-0000-0000000000a1';
  v_lot_us uuid := 'ffffffff-0000-0000-0000-0000000000a2';
  v_vehicle_ar uuid;
  v_vehicle_us uuid;
  v_found uuid[];
  v_count int;
  v_booking uuid;
  v_err text;
  v_err2 text;
  v_text text;
begin
  perform set_config('gg.owner', 'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar
  perform set_config('gg.admin', 'fa32b803-09e1-4120-8c15-0112a8371373', true);  -- ← completar

  -- Fixtures (como postgres): una cochera en Buenos Aires y otra en Manhattan, del admin, publicadas
  -- y abiertas todos los días. El conductor con saldo y un vehículo de cada país.
  update public.app_settings set value = '10' where key = 'max_vehicles_per_region';
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, is_active, approval_status, moderation_state)
  values
    (v_lot_ar, current_setting('gg.admin')::uuid, 'Cochera AR (region_checks)', 'Dirección AR', -34.6037, -58.3816, 100, 1, true, 'approved', 'live'),
    (v_lot_us, current_setting('gg.admin')::uuid, 'Cochera US (region_checks)', 'Dirección US', 40.7549, -73.9840, 100, 1, true, 'approved', 'live');
  update public.parking_lots set region = 'AR' where id = v_lot_ar;
  update public.parking_lots set region = 'US' where id = v_lot_us;
  insert into public.parking_availability_recurring (parking_lot_id, day_of_week, start_time, end_time)
  select l, d, '00:00', '23:59' from unnest(array[v_lot_ar, v_lot_us]) l, generate_series(0, 6) d;

  update public.wallets set balance = 100000 where user_id = current_setting('gg.owner')::uuid;
  update public.profiles set region = 'AR' where id = current_setting('gg.owner')::uuid;
  insert into public.vehicles (user_id, plate, brand, model) values (current_setting('gg.owner')::uuid, 'GGREG1', 'Prueba', 'AR')
    returning id into v_vehicle_ar;
  update public.profiles set region = 'US' where id = current_setting('gg.owner')::uuid;
  insert into public.vehicles (user_id, plate, brand, model) values (current_setting('gg.owner')::uuid, 'GGREG2', 'Prueba', 'US')
    returning id into v_vehicle_us;

  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);

  -- 1. Un conductor de Argentina busca y ve solo la cochera de Argentina; la de EE. UU. no la puede
  --    leer ni por id.
  begin
    update public.profiles set region = 'AR' where id = current_setting('gg.owner')::uuid;
    execute 'set local role authenticated';
    select array_agg(id) into v_found from (
      select id from public.search_parking_lots(-34.6037, -58.3816, 1000)
      union all
      select id from public.search_parking_lots(40.7549, -73.9840, 1000)
    ) s where id in (v_lot_ar, v_lot_us);
    select count(*) into v_count from public.parking_lots where id = v_lot_us;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'Argentina ve solo Argentina',
      case when v_found = array[v_lot_ar] and v_count = 0 then 'OK' else 'FALLA' end,
      format('encontradas: %s / la de EE. UU. por id: %s fila(s)', coalesce(v_found::text, '{}'), v_count));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'Argentina ve solo Argentina', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. El mismo conductor en EE. UU. ve solo la de EE. UU.
  begin
    update public.profiles set region = 'US' where id = current_setting('gg.owner')::uuid;
    execute 'set local role authenticated';
    select array_agg(id) into v_found from (
      select id from public.search_parking_lots(-34.6037, -58.3816, 1000)
      union all
      select id from public.search_parking_lots(40.7549, -73.9840, 1000)
    ) s where id in (v_lot_ar, v_lot_us);
    select count(*) into v_count from public.parking_lots where id = v_lot_ar;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'EE. UU. ve solo EE. UU.',
      case when v_found = array[v_lot_us] and v_count = 0 then 'OK' else 'FALLA' end,
      format('encontradas: %s / la de Argentina por id: %s fila(s)', coalesce(v_found::text, '{}'), v_count));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'EE. UU. ve solo EE. UU.', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. En EE. UU. no puede reservar la cochera de Argentina, ni con un vehículo de Argentina.
  begin
    execute 'set local role authenticated';
    begin
      perform public.create_booking(v_lot_ar, current_date + 7, '10:00', '11:00', v_vehicle_us);
      v_err := 'reservó en otro país';
    exception when others then
      v_err := case when sqlerrm like '%region_mismatch%' then 'no reservó en otro país' else sqlerrm end;
    end;
    begin
      perform public.create_booking(v_lot_us, current_date + 7, '10:00', '11:00', v_vehicle_ar);
      v_err2 := 'usó un vehículo de otro país';
    exception when others then
      v_err2 := case when sqlerrm like '%vehicle_region_mismatch%' then 'no usó el vehículo de otro país' else sqlerrm end;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'no se reserva cruzando países',
      case when v_err = 'no reservó en otro país' and v_err2 = 'no usó el vehículo de otro país' then 'OK' else 'FALLA' end,
      v_err || ' / ' || v_err2);
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'no se reserva cruzando países', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. En EE. UU., con un vehículo de EE. UU., la reserva sale y queda con la región de la cochera.
  begin
    execute 'set local role authenticated';
    v_booking := public.create_booking(v_lot_us, current_date + 7, '12:00', '13:00', v_vehicle_us);
    execute 'reset role';
    select region into v_text from public.bookings where id = v_booking;
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'reserva del mismo país',
      case when v_text = 'US' then 'OK' else 'FALLA' end, format('región de la reserva: %s', v_text));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'reserva del mismo país', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 5. Al volver a Argentina, la cochera reservada sigue visible (historial), aunque sea de otro país.
  begin
    update public.profiles set region = 'AR' where id = current_setting('gg.owner')::uuid;
    execute 'set local role authenticated';
    select count(*) into v_count from public.parking_lots where id = v_lot_us;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'el historial sigue visible',
      case when v_count = 1 then 'OK' else 'FALLA' end, format('cochera reservada visible: %s', v_count));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'el historial sigue visible', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 6. El dueño no puede cambiar la región de su cochera desde la app.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      update public.parking_lots set region = 'AR' where id = v_lot_us;
      v_err := 'la cambió';
    exception when others then
      v_err := case when sqlerrm like '%region_immutable%' then 'no la cambió' else sqlerrm end;
    end;
    execute 'reset role';
    select region into v_text from public.parking_lots where id = v_lot_us;
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'la región de una cochera no se cambia',
      case when v_err = 'no la cambió' and v_text = 'US' then 'OK' else 'FALLA' end,
      format('%s / región: %s', v_err, v_text));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'la región de una cochera no se cambia', 'ERROR INESPERADO', sqlerrm);
  end;

  raise exception '%', v_report;
end $$;
