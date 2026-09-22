-- GarageGo — verificación de las correcciones de la auditoría técnica (migraciones 0046-0053).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr las migraciones.
--
-- NO deja datos: todo es un único bloque DO que termina con un error a propósito. Ese error
-- revierte todo (fixtures incluidos) y su mensaje ES el reporte: el SQL Editor lo muestra como
-- "ERROR: RESULTADOS …" con una línea OK / FALLA por prueba. Que termine en error es lo esperado.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Completar los dos ids del principio del bloque con datos reales del proyecto:
--   gg.driver  → un usuario conductor que tenga al menos un vehículo cargado
--   gg.owner   → otro usuario (dueño de la cochera de prueba que arma este script)
-- La cochera NO es una real: el script crea una propia, con disponibilidad controlada
-- (08:00-20:00 todos los días), para que ningún horario real cargado por un propietario
-- interfiera con lo que se está probando. Se borra sola con el rollback final.
-- La prueba 12 (perfiles ajenos) solo pasa si ya se corrió la 0051.
--
-- ── Qué NO cubre este script ─────────────────────────────────────────────────────────────
-- Las carreras reales necesitan dos conexiones simultáneas. Para probarlas a mano:
--   1. Crear una reserva confirmada de prueba (o usar una real de testing).
--   2. Abrir dos pestañas del SQL Editor. En cada una:
--        begin;
--        select set_config('request.jwt.claims', '{"sub":"<id del conductor>","role":"authenticated"}', true);
--        set local role authenticated;
--        select public.cancel_booking('<id de la reserva>');
--   3. Ejecutar la primera SIN hacer commit, después la segunda: la segunda queda esperando.
--   4. Hacer `commit;` en la primera. La segunda tiene que fallar con "ya no se puede cancelar".
--   5. Verificar: select type, count(*) from wallet_transactions
--                 where related_booking_id = '<id>' group by type;   → un solo 'refund'.
--   Lo mismo con complete_booking (propietario en una pestaña, conductor en la otra).

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_det text;
  v_other uuid;
  v_others int;
  v_out text;
  v_price numeric;
  v_public int;
  v_refunds int;
  v_res text;
  v_saved uuid;
begin
  perform set_config('gg.driver', '00000000-0000-0000-0000-000000000000', true);  -- ← completar
  perform set_config('gg.owner',  '00000000-0000-0000-0000-000000000000', true);  -- ← completar
  perform set_config('gg.lot',    'cccccccc-0000-0000-0000-00000000000c', true);

  -- Fixtures (como postgres, se revierten al final) ---------------------------------------
  -- Cochera de prueba propia, publicable, abierta todos los días de 08:00 a 20:00. No se
  -- reusa ninguna cochera real: así ningún horario que un propietario haya cargado de verdad
  -- puede interferir con lo que se está probando (ver nota al principio del archivo).
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, is_active, approval_status, moderation_state)
  values (
    current_setting('gg.lot')::uuid, current_setting('gg.owner')::uuid, 'Cochera de prueba (audit_checks)',
    'Dirección de prueba', -34.6037, -58.3816, 100, true, 'approved', 'live'
  );

  insert into public.parking_availability_recurring (parking_lot_id, day_of_week, start_time, end_time)
  select current_setting('gg.lot')::uuid, d, '08:00', '20:00' from generate_series(0, 6) d;

  -- Saldo de sobra para el conductor.
  update public.wallets set balance = balance + 100000 where user_id = current_setting('gg.driver')::uuid;

  -- Reservas de prueba, lejos en el futuro para no chocar con reservas reales.
  insert into public.bookings (id, user_id, parking_lot_id, date, start_time, end_time, status, total_price, vehicle_id)
  values
    -- A: confirmada, sin iniciar (para cancelar / finalizar / borrar cochera)
    ('aaaaaaaa-0000-0000-0000-00000000000a', current_setting('gg.driver')::uuid, current_setting('gg.lot')::uuid,
     current_date + 300, '10:00', '11:00', 'confirmed', 1000,
     (select id from public.vehicles where user_id = current_setting('gg.driver')::uuid limit 1)),
    -- B: completada (para calificar)
    ('bbbbbbbb-0000-0000-0000-00000000000b', current_setting('gg.driver')::uuid, current_setting('gg.lot')::uuid,
     current_date + 301, '10:00', '11:00', 'completed', 1000,
     (select id from public.vehicles where user_id = current_setting('gg.driver')::uuid limit 1));

  -- Día cerrado por excepción (para la prueba de disponibilidad).
  insert into public.parking_availability_exceptions (parking_lot_id, date, is_available)
  values (current_setting('gg.lot')::uuid, current_date + 302, false);

  -- 1. INSERT directo a bookings (0046) → tiene que fallar.
  v_res := null; v_det := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.bookings (user_id, parking_lot_id, date, start_time, end_time, total_price)
      values (current_setting('gg.driver')::uuid, current_setting('gg.lot')::uuid, current_date + 303, '10:00', '11:00', 1);
      v_res := 'FALLA'; v_det := 'se pudo insertar una reserva sin pagar';
    exception when others then
      v_res := 'OK'; v_det := sqlerrm;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'INSERT directo a bookings', v_res, v_det);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'INSERT directo a bookings', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. UPDATE directo de total_price (0046) → no tiene que cambiar nada.
  v_res := null; v_det := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      update public.bookings set total_price = 999999 where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
      v_det := 'el UPDATE no dio error';
    exception when others then
      v_det := sqlerrm;
    end;
    execute 'reset role';
    select total_price into v_price from public.bookings where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
    v_res := case when v_price = 1000 then 'OK' else 'FALLA' end;
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'UPDATE directo de total_price', v_res, v_det || ' / precio final: ' || v_price);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'UPDATE directo de total_price', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. Rating con parking_lot_id ajeno (0049) → se guarda con la cochera de la reserva.
  v_res := null; v_det := null;
  begin
    select id into v_other from public.parking_lots where id <> current_setting('gg.lot')::uuid limit 1;
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.ratings (booking_id, parking_lot_id, user_id, score, is_hidden)
      values ('bbbbbbbb-0000-0000-0000-00000000000b', coalesce(v_other, current_setting('gg.lot')::uuid),
              current_setting('gg.driver')::uuid, 1, true);
      v_det := 'insertado';
    exception when others then
      v_det := sqlerrm;
    end;
    execute 'reset role';
    select parking_lot_id into v_saved from public.ratings where booking_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
    v_res := case
      when v_saved = current_setting('gg.lot')::uuid
       and not (select is_hidden from public.ratings where booking_id = 'bbbbbbbb-0000-0000-0000-00000000000b')
      then 'OK' else 'FALLA' end;
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'Rating con cochera ajena', v_res, v_det || ' / guardado en: ' || coalesce(v_saved::text, 'nada'));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'Rating con cochera ajena', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. complete_booking sin iniciar (0047) → booking_not_started.
  v_res := null; v_det := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.complete_booking('aaaaaaaa-0000-0000-0000-00000000000a');
      v_res := 'FALLA'; v_det := 'se finalizó una reserva no iniciada';
    exception when others then
      v_res := case when sqlerrm like '%booking_not_started%' then 'OK' else 'FALLA' end; v_det := sqlerrm;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'Finalizar sin iniciar', v_res, v_det);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'Finalizar sin iniciar', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 5. Reservar un día cerrado por excepción (0048) → outside_availability.
  v_res := null; v_det := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.create_booking(current_setting('gg.lot')::uuid, current_date + 302, '10:00', '11:00',
        (select id from public.vehicles where user_id = current_setting('gg.driver')::uuid limit 1));
      v_res := 'FALLA'; v_det := 'se reservó un día cerrado';
    exception when others then
      v_res := case when sqlerrm like '%outside_availability%' then 'OK' else 'FALLA' end; v_det := sqlerrm;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'Reservar día cerrado', v_res, v_det);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'Reservar día cerrado', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 6. Reservar fuera del horario configurado (0048) → outside_availability.
  v_res := null; v_det := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.create_booking(current_setting('gg.lot')::uuid, current_date + 304, '21:00', '22:00',
        (select id from public.vehicles where user_id = current_setting('gg.driver')::uuid limit 1));
      v_res := 'FALLA'; v_det := 'se reservó fuera de horario';
    exception when others then
      v_res := case when sqlerrm like '%outside_availability%' then 'OK' else 'FALLA' end; v_det := sqlerrm;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'Reservar fuera de horario', v_res, v_det);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'Reservar fuera de horario', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 7. Reservar dentro del buffer de 15 min (0048) → buffer_conflict.
  v_res := null; v_det := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.create_booking(current_setting('gg.lot')::uuid, current_date + 300, '11:00', '11:30',
        (select id from public.vehicles where user_id = current_setting('gg.driver')::uuid limit 1));
      v_res := 'FALLA'; v_det := 'se reservó pegado a otra reserva';
    exception when others then
      v_res := case when sqlerrm like '%buffer_conflict%' then 'OK' else 'FALLA' end; v_det := sqlerrm;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 7, 'Reservar dentro del buffer', v_res, v_det);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 7, 'Reservar dentro del buffer', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 8. Borrar cochera con reservas vigentes (0053) → lot_has_active_bookings.
  v_res := null; v_det := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.delete_parking_lot(current_setting('gg.lot')::uuid);
      v_res := 'FALLA'; v_det := 'se borró una cochera con reservas vigentes';
    exception when others then
      v_res := case when sqlerrm like '%lot_has_active_bookings%' then 'OK' else 'FALLA' end; v_det := sqlerrm;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 8, 'Borrar cochera con reservas vigentes', v_res, v_det);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 8, 'Borrar cochera con reservas vigentes', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 9. Doble cancelación (0047) → la segunda falla y hay un solo reembolso.
  v_res := null; v_det := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.cancel_booking('aaaaaaaa-0000-0000-0000-00000000000a');
    begin
      perform public.cancel_booking('aaaaaaaa-0000-0000-0000-00000000000a');
      v_det := 'la segunda cancelación no dio error';
    exception when others then
      v_det := sqlerrm;
    end;
    execute 'reset role';
    select count(*) into v_refunds from public.wallet_transactions
    where related_booking_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and type = 'refund';
    v_res := case when v_refunds = 1 then 'OK' else 'FALLA' end;
    v_report := v_report || e'\n' || concat_ws(' | ', 9, 'Doble cancelación', v_res, v_det || ' / reembolsos: ' || v_refunds);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 9, 'Doble cancelación', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 10. Borrar cochera con historial y sin reservas vigentes (0053) → se archiva.
  v_res := null; v_det := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      -- Llega acá con la reserva A ya cancelada (prueba 9) y la B completada: ninguna
      -- pending/confirmed, pero con historial → tiene que archivar, no borrar.
      v_out := public.delete_parking_lot(current_setting('gg.lot')::uuid);
      v_det := 'devolvió ' || v_out;
    exception when others then
      v_det := sqlerrm;
    end;
    execute 'reset role';
    v_res := case
      when v_out = 'archived' and exists (select 1 from public.parking_lots where id = current_setting('gg.lot')::uuid and archived_at is not null) then 'OK'
      else 'FALLA' end;
    v_report := v_report || e'\n' || concat_ws(' | ', 10, 'Borrar cochera con historial → archivar', v_res, v_det);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 10, 'Borrar cochera con historial → archivar', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 11. RPC sin sesión (0052) → anon no puede llamar create_booking.
  v_res := null; v_det := null;
  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
    begin
      perform public.create_booking(current_setting('gg.lot')::uuid, current_date + 305, '10:00', '11:00', null);
      v_res := 'FALLA'; v_det := 'anon pudo ejecutar';
    exception when insufficient_privilege then
      v_res := 'OK'; v_det := sqlerrm;
    when others then
      v_res := 'FALLA'; v_det := 'error distinto a permiso: ' || sqlerrm;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 11, 'create_booking sin sesión', v_res, v_det);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 11, 'create_booking sin sesión', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 12. Perfiles ajenos (0050/0051) → `profiles` solo el propio; `public_profiles` sin teléfono.
  v_res := null; v_det := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_others from public.profiles where id <> current_setting('gg.driver')::uuid;
    select count(*) into v_public from public.public_profiles where id <> current_setting('gg.driver')::uuid;
    execute 'reset role';
    v_res := case when v_others = 0 and v_public > 0 then 'OK' else 'FALLA (¿se corrió la 0051?)' end;
    v_report := v_report || e'\n' || concat_ws(' | ', 12, 'Perfiles ajenos', v_res,
      format('profiles ajenos visibles: %s / public_profiles: %s', v_others, v_public));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 12, 'Perfiles ajenos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 13. has_booking_in_lot eliminada (0052).
  v_report := v_report || e'\n' || concat_ws(' | ', 13, 'has_booking_in_lot eliminada',
    case when to_regprocedure('public.has_booking_in_lot(uuid, uuid)') is null then 'OK' else 'FALLA' end);

  -- Revierte todo y muestra el reporte.
  raise exception '%', v_report;
end $$;
