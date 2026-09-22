-- GarageGo — verificación de las migraciones del backlog (0054, 0055, 0056).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr esas
-- migraciones. Mismo patrón que supabase/tests/audit_checks.sql: un único bloque DO que arma
-- sus propios datos de prueba, revierte todo con un ROLLBACK final y devuelve el resultado
-- como el mensaje de un error a propósito. Que termine en "ERROR" es lo esperado.
--
-- Antes de correr, completar estos tres ids reales del proyecto:
--   gg.driver → un conductor cualquiera
--   gg.owner  → un propietario cualquiera (distinto de gg.driver)
--   gg.admin  → un usuario con is_admin = true (el que usás para entrar al panel)
--
-- No hace falta ninguna cochera real: el script arma la suya propia, igual que
-- audit_checks.sql, para no depender de disponibilidad ni ubicación ya cargadas.

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_res text;
  v_det text;
  -- Tipada como la tabla (no `record`): así, si el insert de más abajo falla dentro de su
  -- propio `begin/exception`, v_ticket.id queda en NULL en vez de disparar "record is not
  -- assigned yet" al leerlo después.
  v_ticket public.support_tickets;
  v_msg_count int;
  v_rpc_content text;
  v_rpc_created_at timestamptz;
  v_real_content text;
  v_real_created_at timestamptz;
  v_leak_count int;
  v_near_included boolean;
  v_far_included boolean;
  v_rpc_vehicles int;
  v_real_vehicles int;
  v_rpc_bookings_made int;
  v_real_bookings_made int;
  v_rpc_lots_total int;
  v_real_lots_total int;
  v_rpc_earnings numeric;
  v_real_earnings numeric;
begin
  perform set_config('gg.driver', '58c73669-a744-4eff-8fe1-f74d1f2af37b', true);  -- ← completar
  perform set_config('gg.owner',  'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar
  perform set_config('gg.admin',  'fa32b803-09e1-4120-8c15-0112a8371373', true);  -- ← completar
  perform set_config('gg.lot', 'dddddddd-0000-0000-0000-00000000000d', true);
  perform set_config('gg.lot_near', 'eeeeeeee-0000-0000-0000-00000000000e', true);
  perform set_config('gg.lot_far', 'ffffffff-0000-0000-0000-00000000000f', true);
  perform set_config('gg.booking_a', 'aaaaaaaa-1111-0000-0000-00000000000a', true);
  perform set_config('gg.booking_b', 'bbbbbbbb-1111-0000-0000-00000000000b', true);

  -- Fixtures ------------------------------------------------------------------------------
  -- Cochera propia de prueba (mismo motivo que en audit_checks.sql: no depender de la
  -- disponibilidad ni la ubicación real que haya cargado un propietario de verdad).
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, is_active, approval_status, moderation_state)
  values (
    current_setting('gg.lot')::uuid, current_setting('gg.owner')::uuid, 'Cochera de prueba (backlog_checks)',
    'Dirección de prueba', -34.6037, -58.3816, 100, true, 'approved', 'live'
  );

  -- Dos reservas del conductor en esa cochera, para tener con qué armar un ticket y mensajes.
  insert into public.bookings (id, user_id, parking_lot_id, date, start_time, end_time, status, total_price)
  values
    (current_setting('gg.booking_a')::uuid, current_setting('gg.driver')::uuid, current_setting('gg.lot')::uuid,
     current_date + 310, '10:00', '11:00', 'confirmed', 1000),
    (current_setting('gg.booking_b')::uuid, current_setting('gg.driver')::uuid, current_setting('gg.lot')::uuid,
     current_date + 311, '10:00', '11:00', 'confirmed', 1000);

  -- Dos mensajes en la reserva A, el segundo más nuevo: last_message_per_booking tiene que
  -- devolver el segundo, no el primero que encuentre.
  insert into public.messages (booking_id, sender_id, content, created_at)
  values
    (current_setting('gg.booking_a')::uuid, current_setting('gg.driver')::uuid, 'primer mensaje', now() - interval '10 minutes'),
    (current_setting('gg.booking_a')::uuid, current_setting('gg.owner')::uuid, 'mensaje mas nuevo', now());

  -- Dos cocheras más para el radio de búsqueda: una a ~100 m (siempre visible) y otra a
  -- ~30 km (tiene que quedar afuera aunque se pida un radio de 1000 km, por el tope de 25 km).
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, is_active, approval_status, moderation_state)
  values
    (current_setting('gg.lot_near')::uuid, current_setting('gg.owner')::uuid, 'Cochera cercana (backlog_checks)',
     'Dirección de prueba', -34.604, -58.3816, 100, true, 'approved', 'live'),
    (current_setting('gg.lot_far')::uuid, current_setting('gg.owner')::uuid, 'Cochera lejana (backlog_checks)',
     'Dirección de prueba', -34.6037 + 0.27, -58.3816, 100, true, 'approved', 'live');

  -- 1. create_support_ticket: el ticket y su primer mensaje se crean juntos ------------------
  v_res := null; v_det := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      select * into v_ticket from public.create_support_ticket(
        'client', 'Prueba backlog_checks', 'other', 'Cuerpo de prueba',
        current_setting('gg.booking_a')::uuid, null
      );
      v_det := 'ticket creado: ' || v_ticket.code;
    exception when others then
      v_det := 'ERROR INESPERADO: ' || sqlerrm;
    end;
    execute 'reset role';
    select count(*) into v_msg_count from public.support_ticket_messages where ticket_id = v_ticket.id;
    v_res := case when v_ticket.id is not null and v_msg_count = 1 then 'OK' else 'FALLA' end;
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'create_support_ticket crea ticket + mensaje', v_res,
      v_det || ' / mensajes del ticket: ' || v_msg_count);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'create_support_ticket crea ticket + mensaje', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. create_support_ticket: rechaza un vínculo que no es del que llama --------------------
  v_res := null; v_det := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      -- El conductor intenta abrir un ticket de PROPIETARIO sobre una cochera que no es suya.
      perform public.create_support_ticket('owner', 'Intento cruzado', 'other', 'x', null, current_setting('gg.lot')::uuid);
      v_det := 'se pudo crear con un vínculo ajeno';
    exception when others then
      v_det := sqlerrm;
    end;
    execute 'reset role';
    v_res := case when v_det like '%no te pertenece%' then 'OK' else 'FALLA' end;
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'create_support_ticket rechaza vínculo ajeno', v_res, v_det);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'create_support_ticket rechaza vínculo ajeno', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. last_message_per_booking: devuelve el mensaje más nuevo, no el primero que aparezca --
  v_res := null; v_det := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select content, created_at into v_rpc_content, v_rpc_created_at
    from public.last_message_per_booking(array[current_setting('gg.booking_a')::uuid]);
    execute 'reset role';

    select content, created_at into v_real_content, v_real_created_at
    from public.messages where booking_id = current_setting('gg.booking_a')::uuid
    order by created_at desc limit 1;

    v_res := case when v_rpc_content = v_real_content and v_rpc_created_at = v_real_created_at then 'OK' else 'FALLA' end;
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'last_message_per_booking devuelve el más nuevo', v_res,
      format('RPC: %s (%s) / real: %s (%s)', v_rpc_content, v_rpc_created_at, v_real_content, v_real_created_at));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'last_message_per_booking devuelve el más nuevo', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. last_message_per_booking: no filtra mensajes de una reserva ajena --------------------
  v_res := null; v_det := null;
  begin
    -- Un tercero sin ningún vínculo con la reserva A (ni conductor ni propietario de esa
    -- cochera) no tiene que recibir nada, aunque pida ese booking_id explícitamente.
    perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_leak_count from public.last_message_per_booking(array[current_setting('gg.booking_a')::uuid]);
    execute 'reset role';
    v_res := case when v_leak_count = 0 then 'OK' else 'FALLA' end;
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'last_message_per_booking no filtra a terceros', v_res,
      'filas devueltas a un tercero: ' || v_leak_count);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'last_message_per_booking no filtra a terceros', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 5. search_parking_lots: el radio queda topeado a 25 km aunque se pida más ---------------
  v_res := null; v_det := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select exists(
      select 1 from public.search_parking_lots(-34.6037, -58.3816, 1000) s where s.id = current_setting('gg.lot_near')::uuid
    ) into v_near_included;
    select exists(
      select 1 from public.search_parking_lots(-34.6037, -58.3816, 1000) s where s.id = current_setting('gg.lot_far')::uuid
    ) into v_far_included;
    execute 'reset role';
    v_res := case when v_near_included and not v_far_included then 'OK' else 'FALLA' end;
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'search_parking_lots topea el radio a 25 km', v_res,
      format('cercana incluida: %s / lejana incluida: %s (debería ser false)', v_near_included, v_far_included));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'search_parking_lots topea el radio a 25 km', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 6. admin_user_directory: los agregados agrupados dan lo mismo que contarlos a mano ------
  v_res := null; v_det := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      select vehicles_count, bookings_made, lots_total, earnings
      into v_rpc_vehicles, v_rpc_bookings_made, v_rpc_lots_total, v_rpc_earnings
      from public.admin_user_directory() where id = current_setting('gg.owner')::uuid;
      v_det := 'consulta ejecutada';
    exception when others then
      v_det := 'ERROR (¿gg.admin tiene is_admin = true?): ' || sqlerrm;
    end;
    execute 'reset role';

    select count(*) into v_real_vehicles from public.vehicles where user_id = current_setting('gg.owner')::uuid;
    select count(*) into v_real_bookings_made from public.bookings where user_id = current_setting('gg.owner')::uuid;
    select count(*) into v_real_lots_total from public.parking_lots where owner_id = current_setting('gg.owner')::uuid;
    select coalesce(sum(t.amount), 0) into v_real_earnings
    from public.wallet_transactions t join public.wallets w on w.id = t.wallet_id
    where w.user_id = current_setting('gg.owner')::uuid and t.type = 'earning' and t.status = 'completed';

    v_res := case
      when v_rpc_vehicles = v_real_vehicles and v_rpc_bookings_made = v_real_bookings_made
       and v_rpc_lots_total = v_real_lots_total and v_rpc_earnings = v_real_earnings
      then 'OK' else 'FALLA' end;
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'admin_user_directory coincide con el conteo manual', v_res,
      format('%s / RPC(vehiculos=%s,reservas=%s,cocheras=%s,ganancias=%s) real(vehiculos=%s,reservas=%s,cocheras=%s,ganancias=%s)',
        v_det, v_rpc_vehicles, v_rpc_bookings_made, v_rpc_lots_total, v_rpc_earnings,
        v_real_vehicles, v_real_bookings_made, v_real_lots_total, v_real_earnings));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'admin_user_directory coincide con el conteo manual', 'ERROR INESPERADO', sqlerrm);
  end;

  -- Revierte todo (tickets, reservas, mensajes, cocheras de prueba) y muestra el reporte.
  raise exception '%', v_report;
end $$;
