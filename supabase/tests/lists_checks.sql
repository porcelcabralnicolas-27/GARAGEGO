-- GarageGo — verificación de las migraciones 0059 (listados paginados), 0060 (Realtime del
-- panel) y 0061 (recarga de prueba), contra las policies REALES del proyecto.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr las tres.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (fixtures incluidos) y su mensaje ES el reporte, con una línea OK / FALLA por prueba.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Completar los dos ids, igual que en audit_checks.sql:
--   gg.driver  → un usuario conductor con al menos un vehículo (que NO sea admin)
--   gg.owner   → otro usuario (dueño de la cochera de prueba que arma este script)
--
-- Lo que se prueba es sobre todo aislamiento: que cada función nueva devuelva solo lo que ese
-- usuario ya podía leer, porque son SECURITY INVOKER y dependen de la RLS.

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_count int;
  v_other int;
  v_text text;
  v_bool boolean;
  v_booking uuid := 'eeeeeeee-0000-0000-0000-00000000000b';
begin
  perform set_config('gg.driver', '58c73669-a744-4eff-8fe1-f74d1f2af37b', true);  -- ← completar
  perform set_config('gg.owner',  'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar
  perform set_config('gg.lot',    'eeeeeeee-0000-0000-0000-00000000000c', true);

  -- Fixtures (como postgres, se revierten al final) ---------------------------------------
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, is_active, approval_status, moderation_state)
  values (
    current_setting('gg.lot')::uuid, current_setting('gg.owner')::uuid, 'Cochera de prueba (lists_checks)',
    'Dirección de prueba', -34.6037, -58.3816, 100, true, 'approved', 'live'
  );
  insert into public.bookings (id, user_id, parking_lot_id, date, start_time, end_time, status, total_price, vehicle_id)
  values (v_booking, current_setting('gg.driver')::uuid, current_setting('gg.lot')::uuid,
          current_date - 400, '10:00', '11:00', 'completed', 100,
          (select id from public.vehicles where user_id = current_setting('gg.driver')::uuid limit 1));
  insert into public.messages (booking_id, sender_id, content)
  values (v_booking, current_setting('gg.owner')::uuid, 'mensaje de prueba (lists_checks)');

  -- 1. list_client_bookings: el conductor ve la suya, con el nombre de la cochera; nada ajeno.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) filter (where r.id = v_booking and r.parking_lot_name = 'Cochera de prueba (lists_checks)'),
           count(*) filter (where r.user_id <> current_setting('gg.driver')::uuid)
    into v_count, v_other
    from public.list_client_bookings('history', 100) r;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'list_client_bookings',
      case when v_count = 1 and v_other = 0 then 'OK' else 'FALLA' end,
      format('propia: %s / ajenas: %s', v_count, v_other));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'list_client_bookings', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. list_owner_bookings: el dueño la ve con el nombre del cliente; el conductor no ve reservas de cocheras ajenas.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) filter (where r.id = v_booking and r.client_name is not null) into v_count
    from public.list_owner_bookings('history', 100) r;
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_other from public.list_owner_bookings('history', 100) r where r.id = v_booking;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'list_owner_bookings',
      case when v_count = 1 and v_other = 0 then 'OK' else 'FALLA' end,
      format('dueño la ve: %s / conductor la ve como dueño: %s', v_count, v_other));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'list_owner_bookings', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. get_client_booking: el dueño de la cochera no la obtiene por esta vía (es del conductor).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_count from public.get_client_booking(v_booking);
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'get_client_booking de otro usuario',
      case when v_count = 0 then 'OK' else 'FALLA' end, format('filas: %s', v_count));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'get_client_booking de otro usuario', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. list_conversations: los dos ven el hilo, con el último mensaje.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_count from public.list_conversations('client', 100) r
    where r.parking_lot_id = current_setting('gg.lot')::uuid and r.last_message = 'mensaje de prueba (lists_checks)';
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_other from public.list_conversations('owner', 100) r
    where r.parking_lot_id = current_setting('gg.lot')::uuid and r.peer_id = current_setting('gg.driver')::uuid;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'list_conversations',
      case when v_count = 1 and v_other = 1 then 'OK' else 'FALLA' end,
      format('conductor: %s / propietario: %s', v_count, v_other));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'list_conversations', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 5. list_notifications / list_my_tickets: solo filas propias.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_count from public.list_notifications('client', 100) r where r.user_id <> current_setting('gg.driver')::uuid;
    select count(*) into v_other from public.list_my_tickets(100) r where r.reporter_id <> current_setting('gg.driver')::uuid;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'notificaciones y tickets ajenos',
      case when v_count = 0 and v_other = 0 then 'OK' else 'FALLA' end,
      format('notificaciones ajenas: %s / tickets ajenos: %s', v_count, v_other));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'notificaciones y tickets ajenos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 6. search_parking_lots (nueva firma, con PostGIS) y reseñas / dueño de la ficha pública.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_count from public.search_parking_lots(-34.6037, -58.3816, 1, null, null, 200) r
    where r.id = current_setting('gg.lot')::uuid;
    perform * from public.list_parking_lot_ratings(current_setting('gg.lot')::uuid, 10);
    v_text := public.parking_lot_owner_name(current_setting('gg.lot')::uuid);
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'búsqueda y ficha pública',
      case when v_count = 1 and v_text is not null then 'OK' else 'FALLA' end,
      format('encontrada: %s / dueño: %s', v_count, coalesce(v_text, 'null')));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'búsqueda y ficha pública', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 7. Funciones del panel: un usuario común no puede usarlas.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_count := 0;
    begin
      perform * from public.admin_tickets_page(10);
    exception when insufficient_privilege then v_count := v_count + 1;
    end;
    begin
      perform * from public.admin_transactions(10);
    exception when insufficient_privilege then v_count := v_count + 1;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 7, 'funciones del panel sin ser admin',
      case when v_count = 2 then 'OK' else 'FALLA' end, format('rechazadas: %s de 2', v_count));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 7, 'funciones del panel sin ser admin', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 8. 0060: parking_lots y support_tickets publicadas en Realtime.
  select count(*) into v_count from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('parking_lots', 'support_tickets');
  v_report := v_report || e'\n' || concat_ws(' | ', 8, 'Realtime del panel (0060)',
    case when v_count = 2 then 'OK' else 'FALLA' end, format('tablas publicadas: %s de 2', v_count));

  -- 9. 0061: el flag se lee por la función, la tabla no se expone, y apagado rechaza la recarga.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_bool := public.demo_topup_enabled();
    begin
      perform 1 from public.app_settings;
      v_text := 'app_settings legible';
    exception when insufficient_privilege then
      v_text := 'app_settings cerrada';
    end;
    execute 'reset role';

    update public.app_settings set value = 'false' where key = 'demo_topup_enabled';
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.topup_wallet(100);
      v_text := v_text || ' / recargó con el flag apagado';
    exception when others then
      v_text := v_text || ' / apagado: ' || sqlerrm;
    end;
    execute 'reset role';

    v_report := v_report || e'\n' || concat_ws(' | ', 9, 'recarga de prueba (0061)',
      case when v_bool is not null and v_text = 'app_settings cerrada / apagado: topup_disabled' then 'OK' else 'FALLA' end,
      format('flag: %s / %s', v_bool, v_text));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 9, 'recarga de prueba (0061)', 'ERROR INESPERADO', sqlerrm);
  end;

  -- Revierte todo y muestra el reporte.
  raise exception '%', v_report;
end $$;
