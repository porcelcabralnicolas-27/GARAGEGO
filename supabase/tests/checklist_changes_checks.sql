-- GarageGo — verificación de la migración 0096 (checklist según lo que cambió), contra las policies y
-- RPC REALES del proyecto.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr la 0096.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (cochera de prueba, aprobación y ajustes cambiados incluidos) y su mensaje ES el reporte, con
-- una línea OK / FALLA por prueba.
--
-- Supone los 4 puntos de base del checklist (0092) activos y conectados como los deja la 0096
-- (fotos, dirección, tarifa, descripción).
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Completar los dos ids del principio del bloque (los mismos que checklist_checks.sql):
--   gg.owner → un usuario cualquiera (dueño de la cochera de prueba)
--   gg.admin → un usuario con is_admin = true

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_lot uuid := 'ffffffff-0000-0000-0000-0000000000f6';
  c_photos constant uuid := 'c0920000-0000-0000-0000-000000000001';
  c_address constant uuid := 'c0920000-0000-0000-0000-000000000002';
  c_price constant uuid := 'c0920000-0000-0000-0000-000000000003';
  c_description constant uuid := 'c0920000-0000-0000-0000-000000000004';
  v_ids uuid[];
  v_required uuid[];
  v_changes text[];
  v_status text;
  v_text text;
  v_err text;
begin
  perform set_config('gg.owner', 'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar
  perform set_config('gg.admin', 'fa32b803-09e1-4120-8c15-0112a8371373', true);  -- ← completar

  -- Fixture (como postgres): cochera pendiente, nunca aprobada, con una foto y titularidad verificada
  -- (así no se piden documentos y el punto del DNI no aparece).
  insert into public.parking_lots
    (id, owner_id, name, description, address, latitude, longitude, price_per_hour, capacity,
     is_active, approval_status, ownership_verified_at)
  values (v_lot, current_setting('gg.owner')::uuid, 'Cochera (checklist_changes)', 'Sin datos de contacto',
          'Dirección de prueba', -34.6037, -58.3816, 100, 1, false, 'pending', now());
  insert into public.parking_images (parking_lot_id, storage_path, position)
  values (v_lot, current_setting('gg.owner') || '/' || v_lot::text || '/foto1.jpg', 0);

  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);

  -- 1. Alta nueva: no hay "qué cambió" y aparecen los 4 puntos conectados.
  begin
    execute 'set local role authenticated';
    v_changes := public.lot_review_changes(v_lot);
    select array_agg(id) into v_ids from public.lot_checklist_items(v_lot);
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'alta nueva: se revisa todo',
      case when v_changes is null and v_ids @> array[c_photos, c_address, c_price, c_description] then 'OK' else 'FALLA' end,
      format('cambios: %s / puntos: %s', coalesce(v_changes::text, 'null'), cardinality(v_ids)));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'alta nueva', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. Edición que solo cambió la tarifa: aparece el punto de la tarifa y no los de fotos, dirección
  --    ni descripción. (Como postgres se arma la foto de lo aprobado y se cambia el precio.)
  begin
    update public.parking_lots
      set approved_snapshot = public.lot_review_snapshot(v_lot)
            || jsonb_build_object('lot_type', lot_type, 'lat', latitude, 'lng', longitude)
      where id = v_lot;
    update public.parking_lots set price_per_hour = 150 where id = v_lot;
    execute 'set local role authenticated';
    v_changes := public.lot_review_changes(v_lot);
    select array_agg(id) into v_ids from public.lot_checklist_items(v_lot);
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'edición de la tarifa: solo su punto',
      case when v_changes = array['price'] and c_price = any(v_ids)
                and not v_ids && array[c_photos, c_address, c_description] then 'OK' else 'FALLA' end,
      format('cambios: %s / puntos: %s', v_changes, cardinality(v_ids)));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'edición de la tarifa', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. Aprobar esa edición: sin el punto de la tarifa no deja; con los obligatorios que corresponden,
  --    sí (los de fotos, dirección y descripción no se exigen).
  begin
    execute 'set local role authenticated';
    select coalesce(array_agg(id) filter (where required), '{}') into v_required from public.lot_checklist_items(v_lot);
    begin
      perform public.admin_review_parking_lot(v_lot, 'approved', null, null, array_remove(v_required, c_price));
      v_err := 'aprobó sin el punto de la tarifa';
    exception when others then
      v_err := case when sqlerrm like '%checklist_incomplete%' then 'no aprobó sin la tarifa' else sqlerrm end;
    end;
    perform public.admin_review_parking_lot(v_lot, 'approved', null, null, v_required);
    execute 'reset role';
    select approval_status into v_status from public.parking_lots where id = v_lot;
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'se exigen solo los puntos que aplican',
      case when v_err = 'no aprobó sin la tarifa' and v_status = 'approved' then 'OK' else 'FALLA' end,
      v_err || ' / estado final: ' || v_status);
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'aprobar la edición', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. Detecta cambios de fotos y de ubicación (y el orden de las fotos no cuenta).
  begin
    insert into public.parking_images (parking_lot_id, storage_path, position)
    values (v_lot, current_setting('gg.owner') || '/' || v_lot::text || '/foto2.jpg', 1);
    update public.parking_lots set latitude = -34.6040 where id = v_lot;
    execute 'set local role authenticated';
    v_changes := public.lot_review_changes(v_lot);
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'cambios de fotos y ubicación',
      case when v_changes @> array['photos', 'location'] and not v_changes && array['address', 'price'] then 'OK' else 'FALLA' end,
      format('cambios: %s', v_changes));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'cambios de fotos y ubicación', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 5. El factor del control de tarifa se valida en el servidor (de 2 a 10).
  begin
    execute 'set local role authenticated';
    v_text := '';
    begin
      perform public.admin_update_settings('{"review_price_factor": 1}');
      v_text := '1: lo dejó';
    exception when others then
      v_text := case when sqlerrm like '%setting_invalid: review_price_factor%' then '1: no' else sqlerrm end;
    end;
    begin
      perform public.admin_update_settings('{"review_price_factor": 11}');
      v_text := v_text || ' / 11: lo dejó';
    exception when others then
      v_text := v_text || case when sqlerrm like '%setting_invalid: review_price_factor%' then ' / 11: no' else ' / ' || sqlerrm end;
    end;
    perform public.admin_update_settings('{"review_price_factor": 3}');
    execute 'reset role';
    select value::text into v_err from public.app_settings where key = 'review_price_factor';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'factor de tarifa validado',
      case when v_text = '1: no / 11: no' and v_err = '3' then 'OK' else 'FALLA' end,
      v_text || ' / guardado: ' || coalesce(v_err, '—'));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'factor de tarifa', 'ERROR INESPERADO', sqlerrm);
  end;

  raise exception '%', v_report;
end $$;
