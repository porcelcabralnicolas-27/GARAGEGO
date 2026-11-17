-- GarageGo — verificación de la migración 0097 (documentos configurables), contra las policies y
-- triggers REALES del proyecto.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr la 0097.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (cocheras de prueba, documentos y requisitos cambiados incluidos) y su mensaje ES el reporte,
-- con una línea OK / FALLA por prueba.
--
-- Supone los 5 requisitos de base como los deja la 0097 (sin cambios del equipo).
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Completar los dos ids del principio del bloque (los mismos que checklist_checks.sql):
--   gg.owner → un usuario cualquiera (dueño de las cocheras de prueba)
--   gg.admin → un usuario con is_admin = true

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_owner_lot uuid := 'ffffffff-0000-0000-0000-0000000000f7';
  v_tenant_lot uuid := 'ffffffff-0000-0000-0000-0000000000f8';
  v_manager_lot uuid := 'ffffffff-0000-0000-0000-0000000000f9';
  v_big_lot uuid := 'ffffffff-0000-0000-0000-0000000000fa';
  v_a text[];
  v_b text[];
  v_c text[];
  v_json jsonb;
  v_count int;
  v_text text;
  v_err text;
  v_err2 text;
begin
  perform set_config('gg.owner', 'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar
  perform set_config('gg.admin', 'fa32b803-09e1-4120-8c15-0112a8371373', true);  -- ← completar

  -- Fixture (como postgres): tres cocheras de casa (titular, inquilino, administrador) y un
  -- estacionamiento de un titular, todas pendientes, inactivas, sin verificar y con una foto.
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, lot_type, holder_role,
     is_active, approval_status)
  values
    (v_owner_lot, current_setting('gg.owner')::uuid, 'Titular (document_checks)', 'Dirección de prueba', -34.6037, -58.3816, 100, 1, 'house', 'owner', false, 'pending'),
    (v_tenant_lot, current_setting('gg.owner')::uuid, 'Inquilino (document_checks)', 'Dirección de prueba', -34.6037, -58.3816, 100, 1, 'house', 'tenant', false, 'pending'),
    (v_manager_lot, current_setting('gg.owner')::uuid, 'Administrador (document_checks)', 'Dirección de prueba', -34.6037, -58.3816, 100, 1, 'house', 'manager', false, 'pending'),
    (v_big_lot, current_setting('gg.owner')::uuid, 'Estacionamiento (document_checks)', 'Dirección de prueba', -34.6037, -58.3816, 100, 1, 'lot', 'owner', false, 'pending');
  insert into public.parking_images (parking_lot_id, storage_path, position)
  values (v_big_lot, current_setting('gg.owner') || '/' || v_big_lot::text || '/foto1.jpg', 0);

  -- 1. Con las reglas de base, lo mismo que antes de la 0097.
  begin
    v_a := public.lot_missing_documents(v_owner_lot);
    v_b := public.lot_missing_documents(v_tenant_lot);
    v_c := public.lot_missing_documents(v_manager_lot);
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'reglas de base iguales a las de antes',
      case when v_a = array['dni', 'property_proof']
                and v_b = array['dni', 'rental_contract', 'owner_authorization']
                and v_c = array['dni', 'owner_authorization'] then 'OK' else 'FALLA' end,
      format('titular: %s / inquilino: %s / administrador: %s', v_a, v_b, v_c));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'reglas de base', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. "No se pide" el comprobante de propiedad: un titular con solo el DNI no debe nada.
  begin
    insert into public.parking_lot_documents (parking_lot_id, kind, storage_path)
    values (v_owner_lot, 'dni', current_setting('gg.owner') || '/' || v_owner_lot::text || '/dni.jpg');
    update public.document_requirements set policy = 'off' where code = 'property_proof';
    v_a := public.lot_missing_documents(v_owner_lot);
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'un requisito en "No se pide" deja de exigirse',
      case when v_a = '{}' then 'OK' else 'FALLA' end, format('le falta: %s', v_a));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'requisito apagado', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. Habilitación obligatoria: un estacionamiento con DNI y boleta no se puede publicar sin ella.
  begin
    update public.document_requirements set policy = 'required' where code = 'commercial_license';
    insert into public.parking_lot_documents (parking_lot_id, kind, storage_path) values
      (v_big_lot, 'dni', current_setting('gg.owner') || '/' || v_big_lot::text || '/dni.jpg'),
      (v_big_lot, 'tax_bill', current_setting('gg.owner') || '/' || v_big_lot::text || '/abl.jpg');
    v_a := public.lot_missing_documents(v_big_lot);
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      update public.parking_lots set is_active = true where id = v_big_lot;
      v_err := 'la dejó publicar';
    exception when others then
      v_err := case when sqlerrm like '%ownership_docs_required: commercial_license%' then 'no la dejó publicar' else sqlerrm end;
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'un requisito obligatorio se exige al publicar',
      case when v_a = array['commercial_license'] and v_err = 'no la dejó publicar' then 'OK' else 'FALLA' end,
      format('le falta: %s / %s', v_a, v_err));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'requisito obligatorio', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. Un usuario común lee los requisitos pero no los edita.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_json := public.public_document_requirements();
    update public.document_requirements set policy = 'off' where code = 'dni';
    execute 'reset role';
    select policy into v_text from public.document_requirements where code = 'dni';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'el cliente lee y no edita',
      case when jsonb_array_length(v_json) >= 5 and v_text = 'required' then 'OK' else 'FALLA' end,
      format('requisitos leídos: %s / política del DNI: %s', jsonb_array_length(v_json), v_text));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'el cliente lee y no edita', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 5. El admin agrega uno (código automático), no lo puede dejar sin documentos ni sin roles, y no
  --    puede borrar uno de base (sí uno propio).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.document_requirements (label, kinds, for_owner, for_tenant, for_manager)
    values ('Constancia de prueba', '{tax_bill}', true, false, false) returning code into v_text;
    begin
      update public.document_requirements set kinds = '{}' where code = v_text;
      v_err := 'dejó sin documentos';
    exception when others then
      v_err := 'sin documentos: no';
    end;
    begin
      update public.document_requirements set for_owner = false where code = v_text;
      v_err2 := 'dejó sin roles';
    exception when others then
      v_err2 := 'sin roles: no';
    end;
    delete from public.document_requirements where code = 'dni';
    select count(*) into v_count from public.document_requirements where code = 'dni';
    delete from public.document_requirements where code = v_text;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'reglas de edición',
      case when v_text = 'constancia_de_prueba' and v_err = 'sin documentos: no' and v_err2 = 'sin roles: no'
                and v_count = 1
                and not exists (select 1 from public.document_requirements where code = 'constancia_de_prueba')
           then 'OK' else 'FALLA' end,
      format('código: %s / %s / %s / DNI sigue: %s', v_text, v_err, v_err2, v_count));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'reglas de edición', 'ERROR INESPERADO', sqlerrm);
  end;

  raise exception '%', v_report;
end $$;
