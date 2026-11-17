-- GarageGo — verificación de la migración 0094 (catálogos configurables), contra las policies REALES
-- del proyecto.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr la 0094.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (fixtures, ítems y tickets de prueba incluidos) y su mensaje ES el reporte, con una línea
-- OK / FALLA por prueba.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Completar los dos ids del principio del bloque (los mismos que checklist_checks.sql):
--   gg.owner → un usuario cualquiera (dueño de la cochera de prueba)
--   gg.admin → un usuario con is_admin = true

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_lot uuid := 'ffffffff-0000-0000-0000-0000000000f4';
  v_lot2 uuid := 'ffffffff-0000-0000-0000-0000000000f5';
  v_count int;
  v_text text;
  v_err text;
  v_json jsonb;
begin
  perform set_config('gg.owner', 'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar
  perform set_config('gg.admin', 'fa32b803-09e1-4120-8c15-0112a8371373', true);  -- ← completar

  -- Fixture (como postgres): cochera con cámaras.
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, amenities, is_active, approval_status)
  values (v_lot, current_setting('gg.owner')::uuid, 'Cochera (catalog_checks)', 'Dirección de prueba',
          -34.6037, -58.3816, 100, 1, array['cameras'], false, 'pending');

  -- 1. Un usuario común lee los catálogos con public_catalogs(), pero no las tablas ni puede editarlas.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_json := public.public_catalogs();
    select count(*) into v_count from public.parking_amenities;
    begin
      insert into public.parking_amenities (label) values ('Servicio trucho');
      v_err := 'lo dejó insertar';
    exception when others then
      v_err := 'no lo dejó insertar';
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'el cliente lee y no edita',
      case when jsonb_array_length(v_json->'amenities') >= 5 and jsonb_array_length(v_json->'ticket_categories') >= 5
                and v_count = 0 and v_err = 'no lo dejó insertar' then 'OK' else 'FALLA' end,
      format('servicios: %s / categorías: %s / filas visibles: %s / %s',
             jsonb_array_length(v_json->'amenities'), jsonb_array_length(v_json->'ticket_categories'), v_count, v_err));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'el cliente lee y no edita', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. El admin agrega un servicio: el código sale del nombre y después no se puede cambiar.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.parking_amenities (label, label_en, icon) values ('Techado (prueba)', 'Covered', 'umbrella')
    returning code into v_text;
    begin
      update public.parking_amenities set code = 'otro_codigo' where code = v_text;
      v_err := 'dejó cambiar el código';
    exception when others then
      v_err := case when sqlerrm like '%catalog_code_immutable%' then 'código fijo' else sqlerrm end;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'código automático e inmutable',
      case when v_text = 'techado_prueba' and v_err = 'código fijo' then 'OK' else 'FALLA' end,
      format('código: %s / %s', v_text, v_err));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'código automático', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. Servicios de una cochera: con cámaras desactivado, la que ya lo tenía lo conserva (y puede
  --    sumar otro activo), pero una cochera nueva no lo puede elegir, ni un código inexistente.
  begin
    update public.parking_amenities set is_active = false where code = 'cameras';  -- como postgres
    update public.parking_lots set amenities = array['cameras', 'lighting'] where id = v_lot;
    begin
      insert into public.parking_lots
        (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, amenities, is_active, approval_status)
      values (v_lot2, current_setting('gg.owner')::uuid, 'Cochera 2 (catalog_checks)', 'Dirección de prueba',
              -34.6037, -58.3816, 100, 1, array['cameras'], false, 'pending');
      v_err := 'dejó elegir uno desactivado';
    exception when others then
      v_err := case when sqlerrm like '%amenity_unavailable%' then 'rechazó el desactivado' else sqlerrm end;
    end;
    begin
      update public.parking_lots set amenities = amenities || array['no_existe'] where id = v_lot;
      v_text := 'dejó uno inexistente';
    exception when others then
      v_text := case when sqlerrm like '%amenity_unavailable%' then 'rechazó el inexistente' else sqlerrm end;
    end;
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'servicios desactivados e inexistentes',
      case when v_err = 'rechazó el desactivado' and v_text = 'rechazó el inexistente' then 'OK' else 'FALLA' end,
      'conserva el que tenía / ' || v_err || ' / ' || v_text);
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'servicios desactivados', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. Tickets: un propietario no puede usar una categoría solo de conductor ('access'), sí 'payment'.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.create_support_ticket('owner', 'Prueba (catalog_checks)', 'access', 'Texto de prueba', null, null);
      v_err := 'dejó usar access';
    exception when others then
      v_err := case when sqlerrm like '%ticket_category_unavailable%' then 'rechazó access' else sqlerrm end;
    end;
    perform public.create_support_ticket('owner', 'Prueba (catalog_checks)', 'payment', 'Texto de prueba', null, null);
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'categoría según el rol',
      case when v_err = 'rechazó access' then 'OK' else 'FALLA' end, v_err || ' / payment: ok');
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'categoría según el rol', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 5. Eliminar: no se puede algo en uso ('payment' tiene el ticket de recién); sí lo que nadie usa.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.admin_delete_catalog_item('ticket_categories', 'payment');
      v_err := 'borró una en uso';
    exception when others then
      v_err := case when sqlerrm like '%catalog_item_in_use%' then 'no borró la usada' else sqlerrm end;
    end;
    perform public.admin_delete_catalog_item('amenities', 'techado_prueba');
    select count(*) into v_count from public.parking_amenities where code = 'techado_prueba';
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'eliminar solo lo que no se usa',
      case when v_err = 'no borró la usada' and v_count = 0 then 'OK' else 'FALLA' end,
      v_err || format(' / la sin uso quedó: %s', v_count));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'eliminar solo lo que no se usa', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 6. No se puede dejar al propietario sin categorías activas.
  begin
    update public.ticket_categories set is_active = false where for_owner;
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'siempre una categoría por rol', 'FALLA', 'las desactivó todas');
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'siempre una categoría por rol',
      case when sqlerrm like '%catalog_role_without_categories: owner%' then 'OK' else 'FALLA' end, sqlerrm);
  end;

  raise exception '%', v_report;
end $$;
