-- GarageGo — verificación de la migración 0088 (eliminar la cuenta), contra las policies REALES.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr la 0088.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (fixtures, perfiles anonimizados y cocheras archivadas incluidos) y su mensaje ES el
-- reporte, con una línea OK / FALLA por prueba.
--
-- La baja en Auth (borrado suave) la hace la Edge Function y no se prueba acá: este script solo
-- toca la base.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Completar los dos ids del principio del bloque (los mismos que photo_address_checks.sql):
--   gg.driver → un usuario cualquiera, con al menos un vehículo
--   gg.owner  → otro usuario (dueño de la cochera de prueba que arma este script)

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_lot uuid := 'ffffffff-0000-0000-0000-0000000000e1';
  v_booking uuid := 'ffffffff-0000-0000-0000-0000000000e2';
  v_driver int;
  v_owner int;
  v_text text;
  v_flag text;
begin
  perform set_config('gg.driver', '58c73669-a744-4eff-8fe1-f74d1f2af37b', true);  -- ← completar
  perform set_config('gg.owner',  'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar

  -- Fixtures (como postgres): una cochera del propietario con una reserva confirmada del conductor.
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, is_active, approval_status)
  values (v_lot, current_setting('gg.owner')::uuid, 'Cochera (account_deletion_checks)', 'Dirección de prueba',
          -34.6037, -58.3816, 100, 1, true, 'approved');

  insert into public.bookings (id, user_id, parking_lot_id, date, start_time, end_time, status, total_price, vehicle_id)
  values (v_booking, current_setting('gg.driver')::uuid, v_lot, current_date + 320, '10:00', '11:00', 'confirmed', 1000,
          (select id from public.vehicles where user_id = current_setting('gg.driver')::uuid limit 1));

  -- 1. El chequeo previo ve la reserva desde los dos lados.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select driver_bookings into v_driver from public.account_deletion_check();
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    select owner_bookings into v_owner from public.account_deletion_check();
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'account_deletion_check',
      case when v_driver >= 1 and v_owner >= 1 then 'OK' else 'FALLA' end,
      format('conductor: %s / propietario: %s', v_driver, v_owner));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'account_deletion_check', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. El cliente no puede llamar a la baja directamente (solo la Edge Function).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.delete_account_data(current_setting('gg.driver')::uuid);
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 2, 'cliente llama delete_account_data', 'FALLA', 'lo dejó');
    exception when others then
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 2, 'cliente llama delete_account_data',
        case when sqlstate = '42501' then 'OK' else 'FALLA' end, sqlerrm);
    end;
  end;

  -- 3 y 4. Con la reserva confirmada no se puede dar de baja ni al conductor ni al propietario.
  begin
    perform public.delete_account_data(current_setting('gg.driver')::uuid);
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'conductor con reserva próxima', 'FALLA', 'lo dio de baja');
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'conductor con reserva próxima',
      case when sqlerrm like '%account_has_active_bookings%' then 'OK' else 'FALLA' end, sqlerrm);
  end;

  begin
    perform public.delete_account_data(current_setting('gg.owner')::uuid);
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'propietario con reserva en su cochera', 'FALLA', 'lo dio de baja');
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'propietario con reserva en su cochera',
      case when sqlerrm like '%account_has_active_bookings%' then 'OK' else 'FALLA' end, sqlerrm);
  end;

  -- 5. Terminada la reserva, la baja del propietario anonimiza el perfil y archiva sus cocheras.
  begin
    update public.bookings set status = 'completed' where id = v_booking;  -- como postgres
    -- Cualquier otra reserva real que tenga el propietario de prueba también bloquearía.
    update public.bookings b set status = 'cancelled'
      from public.parking_lots l
      where l.id = b.parking_lot_id and l.owner_id = current_setting('gg.owner')::uuid
        and b.status in ('pending', 'confirmed');
    update public.bookings set status = 'cancelled'
      where user_id = current_setting('gg.owner')::uuid and status in ('pending', 'confirmed');

    perform public.delete_account_data(current_setting('gg.owner')::uuid);

    select first_name || ' ' || last_name, (deleted_at is not null)::text into v_text, v_flag
    from public.profiles where id = current_setting('gg.owner')::uuid;
    select count(*) into v_owner from public.parking_lots
    where owner_id = current_setting('gg.owner')::uuid and (archived_at is null or is_active);
    select count(*) into v_driver from public.bookings where id = v_booking;
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'baja: perfil anónimo, cocheras archivadas, reservas intactas',
      case when v_text = 'Usuario eliminado' and v_flag = 'true' and v_owner = 0 and v_driver = 1 then 'OK' else 'FALLA' end,
      format('perfil: %s / marca: %s / cocheras sin archivar: %s / reserva: %s', v_text, v_flag, v_owner, v_driver));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'baja del propietario', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 6. El cliente no se puede sacar la marca de cuenta eliminada.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.profiles set deleted_at = null where id = current_setting('gg.owner')::uuid;
    execute 'reset role';
    select (deleted_at is not null)::text into v_flag from public.profiles where id = current_setting('gg.owner')::uuid;
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'el cliente no toca deleted_at',
      case when v_flag = 'true' then 'OK' else 'FALLA' end, format('sigue marcada: %s', v_flag));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'el cliente no toca deleted_at', 'ERROR INESPERADO', sqlerrm);
  end;

  raise exception '%', v_report;
end $$;
