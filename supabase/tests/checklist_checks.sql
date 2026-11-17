-- GarageGo — verificación de la migración 0092 (checklist de aprobación configurable), contra las
-- policies REALES del proyecto.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr la 0092.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (fixtures y puntos de prueba incluidos) y su mensaje ES el reporte, con una línea OK / FALLA
-- por prueba.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Completar los dos ids del principio del bloque (los mismos que photo_address_checks.sql):
--   gg.owner → un usuario cualquiera (dueño de la cochera de prueba)
--   gg.admin → un usuario con is_admin = true

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_lot uuid := 'ffffffff-0000-0000-0000-0000000000f1';
  v_extra uuid := 'ffffffff-0000-0000-0000-0000000000f2';
  v_count int;
  v_text text;
begin
  perform set_config('gg.owner', 'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar
  perform set_config('gg.admin', 'fa32b803-09e1-4120-8c15-0112a8371373', true);  -- ← completar

  -- Fixtures (como postgres): cochera pendiente con foto y documentos completos.
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, is_active, approval_status)
  values (v_lot, current_setting('gg.owner')::uuid, 'Cochera (checklist_checks)', 'Dirección de prueba',
          -34.6037, -58.3816, 100, 1, false, 'pending');
  insert into public.parking_images (parking_lot_id, storage_path, position)
  values (v_lot, current_setting('gg.owner') || '/' || v_lot::text || '/foto.jpg', 0);
  insert into public.parking_lot_documents (parking_lot_id, kind, storage_path) values
    (v_lot, 'dni', current_setting('gg.owner') || '/' || v_lot::text || '/dni.jpg'),
    (v_lot, 'tax_bill', current_setting('gg.owner') || '/' || v_lot::text || '/boleta.jpg');

  -- 1. El propietario no ve ni edita el checklist.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_count from public.review_checklist_items;
    begin
      insert into public.review_checklist_items (label) values ('Punto trucho del propietario');
      v_text := 'lo dejó insertar';
    exception when others then
      v_text := 'no lo dejó insertar';
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'el cliente no ve ni edita el checklist',
      case when v_count = 0 and v_text = 'no lo dejó insertar' then 'OK' else 'FALLA' end,
      format('ve %s puntos / %s', v_count, v_text));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'el cliente no ve ni edita el checklist', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. El equipo agrega un punto obligatorio solo para altas nuevas: se aplica a esta cochera, que
  --    nunca fue aprobada, y la base anota quién lo cargó.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.review_checklist_items (id, label, required, applies_to, position)
    values (v_extra, 'Punto de prueba (checklist_checks)', true, 'new', 99);
    select count(*) into v_count from public.lot_checklist_items(v_lot) where id = v_extra;
    select updated_by::text into v_text from public.review_checklist_items where id = v_extra;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'el admin agrega un punto y se aplica a un alta',
      case when v_count = 1 and v_text = current_setting('gg.admin') then 'OK' else 'FALLA' end,
      format('aplica: %s / updated_by: %s', v_count, v_text));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'el admin agrega un punto', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. Aprobar sin tildar los obligatorios falla.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.admin_review_parking_lot(v_lot, 'approved', null, null, array[v_extra]);
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 3, 'aprobar con el checklist incompleto', 'FALLA', 'la aprobó');
    exception when others then
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 3, 'aprobar con el checklist incompleto',
        case when sqlerrm like '%checklist_incomplete%' then 'OK' else 'FALLA' end, sqlerrm);
    end;
  end;

  -- 4. Nadie, ni siquiera un admin, puede llamar a la función interna para saltear el checklist.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.admin_review_parking_lot_core(v_lot, 'approved', null, null);
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 4, 'saltear el checklist con la función interna', 'FALLA', 'lo dejó');
    exception when others then
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 4, 'saltear el checklist con la función interna',
        case when sqlstate = '42501' then 'OK' else 'FALLA' end, sqlerrm);
    end;
  end;

  -- 5. Con todos los puntos tildados se aprueba y queda constancia con el texto de cada punto.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.admin_review_parking_lot(v_lot, 'approved', null, null,
      array(select id from public.lot_checklist_items(v_lot)));
    execute 'reset role';
    select approval_status into v_text from public.parking_lots where id = v_lot;
    select jsonb_array_length(items) into v_count from public.listing_review_checks
    where parking_lot_id = v_lot and decision = 'approved' and reviewer_id = current_setting('gg.admin')::uuid;
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'aprobar con el checklist completo deja constancia',
      case when v_text = 'approved' and v_count >= 6 then 'OK' else 'FALLA' end,
      format('estado: %s / puntos guardados: %s', v_text, v_count));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'aprobar con el checklist completo', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 6. Ya aprobada (tiene foto de lo aprobado y titularidad verificada): en una edición no se piden
  --    los puntos de 'new' ni el del DNI, y un punto desactivado tampoco.
  begin
    update public.review_checklist_items set is_active = false where id = 'c0920000-0000-0000-0000-000000000003';  -- como postgres
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select string_agg(id::text, ',') into v_text from public.lot_checklist_items(v_lot)
    where id in (v_extra, 'c0920000-0000-0000-0000-000000000005', 'c0920000-0000-0000-0000-000000000003');
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'edición: sin puntos de alta, DNI ni desactivados',
      case when v_text is null then 'OK' else 'FALLA' end, format('aparecen: %s', coalesce(v_text, 'ninguno')));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'edición: puntos que se aplican', 'ERROR INESPERADO', sqlerrm);
  end;

  raise exception '%', v_report;
end $$;
