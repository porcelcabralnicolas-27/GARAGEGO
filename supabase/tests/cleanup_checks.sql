-- GarageGo — verificación de las migraciones 0080 (al eliminar una publicación se cierran los chats y
-- el soporte) y 0081 (editar una publicación aprobada la manda de nuevo a revisión), contra las
-- policies REALES del proyecto.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr las dos.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (fixtures incluidos) y su mensaje ES el reporte, con una línea OK / FALLA por prueba.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Completar los dos ids del principio del bloque (los mismos que features_checks.sql):
--   gg.driver → un usuario conductor (hace de cliente de las reservas de prueba)
--   gg.owner  → otro usuario (dueño de las cocheras de prueba que arma este script)

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_count int;
  v_other int;
  v_text text;
  v_vehicle uuid;
  v_lot_a uuid := 'ffffffff-0000-0000-0000-0000000000b1';  -- se va a eliminar (con historial)
  v_lot_b uuid := 'ffffffff-0000-0000-0000-0000000000b2';  -- aprobada, para probar la re-revisión
  v_booking_a uuid := 'ffffffff-0000-0000-0000-0000000000c1';
begin
  perform set_config('gg.driver', '58c73669-a744-4eff-8fe1-f74d1f2af37b', true);  -- ← completar
  perform set_config('gg.owner',  'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar

  select id into v_vehicle from public.vehicles where user_id = current_setting('gg.driver')::uuid limit 1;
  if v_vehicle is null then
    insert into public.vehicles (user_id, plate, brand, model)
    values (current_setting('gg.driver')::uuid, 'GGTEST1', 'Prueba', 'Prueba')
    returning id into v_vehicle;
  end if;

  -- Fixtures (como postgres, se revierten al final) ---------------------------------------
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, is_active, approval_status, moderation_state)
  values
    (v_lot_a, current_setting('gg.owner')::uuid, 'Cochera A (cleanup_checks)', 'Dirección de prueba',
     -34.6037, -58.3816, 100, 1, true, 'approved', 'live'),
    (v_lot_b, current_setting('gg.owner')::uuid, 'Cochera B (cleanup_checks)', 'Dirección de prueba',
     -34.6037, -58.3816, 100, 1, true, 'approved', 'live');

  -- Una reserva ya finalizada en la cochera A, con un mensaje y su aviso.
  insert into public.bookings (id, user_id, parking_lot_id, date, start_time, end_time, status, total_price, vehicle_id)
  values (v_booking_a, current_setting('gg.driver')::uuid, v_lot_a, current_date - 400, '10:00', '11:00', 'completed', 100, v_vehicle);
  insert into public.messages (booking_id, sender_id, content)
  values (v_booking_a, current_setting('gg.driver')::uuid, 'mensaje de prueba (cleanup_checks)');

  -- 1. Eliminar una cochera con historial la archiva y borra sus chats; la reserva queda.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_text := public.delete_parking_lot(v_lot_a);
    execute 'reset role';
    select count(*) into v_count from public.messages where booking_id = v_booking_a;
    select count(*) into v_other from public.bookings where id = v_booking_a;
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'eliminar: se archiva, se borran los chats y queda el historial (0080)',
      case when v_text = 'archived' and v_count = 0 and v_other = 1 then 'OK' else 'FALLA' end,
      format('resultado: %s / mensajes que quedaron: %s / reserva: %s', v_text, v_count, v_other));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'eliminar y cerrar chats', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. No se puede escribir en el chat de una cochera eliminada (ni el cliente ni el dueño).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.messages (booking_id, sender_id, content)
      values (v_booking_a, current_setting('gg.driver')::uuid, 'no debería entrar');
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 2, 'escribir en un chat eliminado', 'FALLA', 'el mensaje entró');
    exception when others then
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 2, 'escribir en un chat eliminado', 'OK', sqlerrm);
    end;
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'escribir en un chat eliminado', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. La conversación deja de listarse para las dos partes.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_count from public.list_conversations('client', 100) where parking_lot_id = v_lot_a;
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_other from public.list_conversations('owner', 100) where parking_lot_id = v_lot_a;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'la conversación ya no se lista',
      case when v_count = 0 and v_other = 0 then 'OK' else 'FALLA' end,
      format('conductor: %s / propietario: %s', v_count, v_other));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'la conversación ya no se lista', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. No se abre un ticket sobre la reserva ni sobre la cochera eliminada; uno general sí.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.create_support_ticket('client', 'sobre cochera eliminada', 'other', 'texto', v_booking_a, null);
      v_text := 'la dejó crear';
    exception when others then
      v_text := sqlerrm;
    end;
    perform public.create_support_ticket('client', 'consulta general (cleanup_checks)', 'other', 'texto', null, null);
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.create_support_ticket('owner', 'sobre mi cochera eliminada', 'other', 'texto', null, v_lot_a);
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 4, 'tickets sobre una cochera eliminada', 'FALLA', 'el propietario pudo reportar');
    exception when others then
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 4, 'tickets sobre una cochera eliminada',
        case when v_text like '%fue eliminada%' and sqlerrm like '%fue eliminada%' then 'OK' else 'FALLA' end,
        format('conductor: %s / propietario: %s', v_text, sqlerrm));
    end;
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'tickets sobre una cochera eliminada', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 5. Guardar sin cambios no manda a revisión; cambiar el nombre, sí.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.parking_lots set name = name, price_per_hour = 100, capacity = 1 where id = v_lot_b;
    execute 'reset role';
    select approval_status into v_text from public.parking_lots where id = v_lot_b;
    v_other := case when v_text = 'approved' then 1 else 0 end;
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.parking_lots set name = 'Cochera B renombrada (cleanup_checks)' where id = v_lot_b;
    execute 'reset role';
    select approval_status into v_text from public.parking_lots where id = v_lot_b;
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'editar datos: sin cambios no revisa, con cambios sí (0081)',
      case when v_other = 1 and v_text = 'pending' then 'OK' else 'FALLA' end,
      format('sin cambios quedó aprobada: %s / con cambios: %s', v_other = 1, v_text));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'editar datos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 6. Cambiar la tarifa o la capacidad también la manda a revisión; el horario, no.
  begin
    update public.parking_lots set approval_status = 'approved' where id = v_lot_b;  -- como postgres
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.parking_availability_recurring (parking_lot_id, day_of_week, start_time, end_time)
    values (v_lot_b, 1, '08:00', '12:00');
    execute 'reset role';
    select approval_status into v_text from public.parking_lots where id = v_lot_b;
    v_other := case when v_text = 'approved' then 1 else 0 end;
    execute 'set local role authenticated';
    update public.parking_lots set price_per_hour = 150 where id = v_lot_b;
    execute 'reset role';
    select approval_status into v_text from public.parking_lots where id = v_lot_b;
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'el horario no revisa, la tarifa sí',
      case when v_other = 1 and v_text = 'pending' then 'OK' else 'FALLA' end,
      format('tras cargar horario aprobada: %s / tras cambiar tarifa: %s', v_other = 1, v_text));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'el horario no revisa, la tarifa sí', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 7. Agregar o quitar una foto la manda a revisión.
  begin
    update public.parking_lots set approval_status = 'approved' where id = v_lot_b;  -- como postgres
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.parking_images (parking_lot_id, storage_path, position)
    values (v_lot_b, current_setting('gg.owner') || '/' || v_lot_b::text || '/foto.jpg', 0);
    execute 'reset role';
    select approval_status into v_text from public.parking_lots where id = v_lot_b;
    v_report := v_report || e'\n' || concat_ws(' | ', 7, 'agregar una foto revisa de nuevo',
      case when v_text = 'pending' then 'OK' else 'FALLA' end, v_text);
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 7, 'agregar una foto revisa de nuevo', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 8. Una pendiente que se edita sigue pendiente, y el cliente no puede aprobarse sola.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.parking_lots set approval_status = 'approved', description = 'otra descripción' where id = v_lot_b;
    execute 'reset role';
    select approval_status into v_text from public.parking_lots where id = v_lot_b;
    v_report := v_report || e'\n' || concat_ws(' | ', 8, 'el propietario no se aprueba sola',
      case when v_text = 'pending' then 'OK' else 'FALLA' end, v_text);
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 8, 'el propietario no se aprueba sola', 'ERROR INESPERADO', sqlerrm);
  end;

  -- Revierte todo y muestra el reporte.
  raise exception '%', v_report;
end $$;
