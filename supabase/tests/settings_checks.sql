-- GarageGo — verificación de la migración 0093 (límites configurables), contra las policies REALES
-- del proyecto.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr la 0093.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (fixtures y ajustes cambiados incluidos) y su mensaje ES el reporte, con una línea OK / FALLA
-- por prueba.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Completar los dos ids del principio del bloque (los mismos que checklist_checks.sql):
--   gg.owner → un usuario cualquiera (dueño de la cochera de prueba)
--   gg.admin → un usuario con is_admin = true

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_lot uuid := 'ffffffff-0000-0000-0000-0000000000f3';
  v_count int;
  v_text text;
  v_json jsonb;
  v_err text;  -- resultado de cada intento (el error capturado o qué pasó)
begin
  perform set_config('gg.owner', 'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar
  perform set_config('gg.admin', 'fa32b803-09e1-4120-8c15-0112a8371373', true);  -- ← completar

  -- Fixture (como postgres): cochera con capacidad 1 y una foto.
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, is_active, approval_status)
  values (v_lot, current_setting('gg.owner')::uuid, 'Cochera (settings_checks)', 'Dirección de prueba',
          -34.6037, -58.3816, 100, 1, false, 'pending');
  insert into public.parking_images (parking_lot_id, storage_path, position)
  values (v_lot, current_setting('gg.owner') || '/' || v_lot::text || '/foto1.jpg', 0);

  -- 1. Un usuario común lee los límites públicos, pero no la tabla ni puede cambiarlos.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_json := public.public_settings();
    select count(*) into v_count from public.app_settings;
    begin
      perform public.admin_update_settings('{"max_vehicles_per_region": 9}');
      v_err := 'lo dejó';
    exception when others then
      v_err := sqlstate;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'el cliente lee los públicos y no cambia nada',
      case when v_json ? 'max_vehicles_per_region' and not v_json ? 'demo_topup_enabled'
                and v_count = 0 and v_err = '42501' then 'OK' else 'FALLA' end,
      format('claves públicas: %s / filas visibles: %s / guardar: %s',
             (select count(*) from jsonb_object_keys(v_json)), v_count, v_err));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'el cliente lee los públicos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. El servidor rechaza valores absurdos aunque se saltee el panel.
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_text := '';
  for v_json, v_err in values
    ('{"topup_max": 999999999}'::jsonb, 'topup_max'),
    ('{"parking_capacity_min": 20, "parking_capacity_max": 10}'::jsonb, 'parking_capacity_max'),
    ('{"topup_quick_amounts": [5000, 5000]}'::jsonb, 'topup_quick_amounts'),
    ('{"topup_quick_amounts": [60000]}'::jsonb, 'topup_quick_amounts'),
    ('{"max_parking_images": 2.5}'::jsonb, 'max_parking_images'),
    ('{"max_vehicles_per_region": 0}'::jsonb, 'max_vehicles_per_region'),
    ('{"demo_topup_enabled": true}'::jsonb, 'setting_unknown')
  loop
    begin
      perform public.admin_update_settings(v_json);
      v_text := v_text || format(' [%s: lo guardó]', v_err);
    exception when others then
      if sqlerrm not like '%' || v_err || '%' then
        v_text := v_text || format(' [%s: %s]', v_err, sqlerrm);
      end if;
    end;
  end loop;
  execute 'reset role';
  v_report := v_report || e'\n' || concat_ws(' | ', 2, 'valores inválidos rechazados',
    case when v_text = '' then 'OK' else 'FALLA' end, coalesce(nullif(v_text, ''), '7 de 7 rechazados'));

  -- 3. El admin guarda: queda quién lo cambió y los montos ordenados.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_json := public.admin_update_settings(
      '{"max_parking_images": 1, "parking_capacity_min": 2, "parking_capacity_max": 5,
        "topup_max": 1000, "topup_quick_amounts": [1000, 500]}');
    select updated_by::text into v_text from public.app_settings where key = 'max_parking_images';
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'el admin guarda y queda constancia',
      case when v_text = current_setting('gg.admin') and v_json->'topup_quick_amounts' = '[500, 1000]'::jsonb
           then 'OK' else 'FALLA' end,
      format('updated_by: %s / montos: %s', v_text, v_json->'topup_quick_amounts'));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'el admin guarda', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. Fotos: con el máximo en 1, la cochera (que ya tiene 1) no puede sumar otra.
  begin
    insert into public.parking_images (parking_lot_id, storage_path, position)
    values (v_lot, current_setting('gg.owner') || '/' || v_lot::text || '/foto2.jpg', 1);
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'máximo de fotos configurado', 'FALLA', 'dejó subir la segunda');
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'máximo de fotos configurado',
      case when sqlerrm like '%max_parking_images_reached%' then 'OK' else 'FALLA' end, sqlerrm);
  end;

  -- 5. Capacidad (rango 2 a 5): no se puede poner 6, pero la cochera con 1 (ya existente) se puede
  --    editar en lo demás.
  begin
    begin
      update public.parking_lots set capacity = 6 where id = v_lot;
      v_err := 'dejó poner 6';
    exception when others then
      v_err := case when sqlerrm like '%capacity_out_of_range%' then 'rechazó 6' else sqlerrm end;
    end;
    update public.parking_lots set name = 'Cochera (settings_checks) editada' where id = v_lot;
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'capacidad configurada sin romper lo existente',
      case when v_err = 'rechazó 6' then 'OK' else 'FALLA' end, v_err || ' / editar el nombre: ok');
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'capacidad configurada', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 6. Recarga: con el máximo en $1.000, una de $2.000 se rechaza.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.begin_mp_topup(2000);
      v_err := 'la aceptó';
    exception when others then
      v_err := sqlerrm;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'recarga máxima configurada',
      case when v_err like '%invalid_topup_amount%' then 'OK' else 'FALLA' end, v_err);
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'recarga máxima configurada', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 7. Vehículos: con el máximo en (los que ya tiene en su país + 1), puede sumar uno y no dos.
  begin
    select count(*) into v_count from public.vehicles v
    where v.user_id = current_setting('gg.owner')::uuid
      and v.region = coalesce((select region from public.profiles where id = current_setting('gg.owner')::uuid), 'AR');
    if v_count >= 10 then
      v_report := v_report || e'\n' || concat_ws(' | ', 7, 'máximo de vehículos configurado', 'SALTEADA', 'el usuario ya tiene 10');
    else
      update public.app_settings set value = to_jsonb(v_count + 1) where key = 'max_vehicles_per_region';
      insert into public.vehicles (user_id, plate, brand, model)
      values (current_setting('gg.owner')::uuid, 'TST9301', 'Prueba', 'Uno');
      begin
        insert into public.vehicles (user_id, plate, brand, model)
        values (current_setting('gg.owner')::uuid, 'TST9302', 'Prueba', 'Dos');
        v_err := 'dejó cargar el segundo';
      exception when others then
        v_err := sqlerrm;
      end;
      v_report := v_report || e'\n' || concat_ws(' | ', 7, 'máximo de vehículos configurado',
        case when v_err like '%max_vehicles_reached%' then 'OK' else 'FALLA' end,
        format('tenía %s, máximo %s: %s', v_count, v_count + 1, v_err));
    end if;
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 7, 'máximo de vehículos configurado', 'ERROR INESPERADO', sqlerrm);
  end;

  raise exception '%', v_report;
end $$;
