-- GarageGo — verificación de la migración 0078 (verificación de titularidad), contra las policies
-- REALES del proyecto.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr la 0078 y la 0079.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (fixtures incluidos) y su mensaje ES el reporte, con una línea OK / FALLA por prueba.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Completar los tres ids del principio del bloque (los mismos que backlog_checks.sql):
--   gg.driver → un usuario cualquiera (hace de "otra persona")
--   gg.owner  → otro usuario (dueño de las cocheras de prueba que arma este script)
--   gg.admin  → un usuario con is_admin = true
--
-- Lo que NO prueba (el SQL Editor no tiene Storage): que los archivos del bucket `ownership-docs`
-- sean privados. Eso se verifica a mano: subir un documento desde la app y abrir su URL sin firma
-- en una ventana de incógnito; tiene que dar error.

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_count int;
  v_other int;
  v_text text;
  v_other_text text;
  v_missing text[];
  v_lot uuid := 'ffffffff-0000-0000-0000-0000000000a1';
  v_lot2 uuid := 'ffffffff-0000-0000-0000-0000000000a2';
begin
  perform set_config('gg.driver', '58c73669-a744-4eff-8fe1-f74d1f2af37b', true);  -- ← completar
  perform set_config('gg.owner',  'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar
  perform set_config('gg.admin',  'fa32b803-09e1-4120-8c15-0112a8371373', true);  -- ← completar

  -- Fixtures (como postgres, se revierten al final): dos cocheras nuevas, inactivas y pendientes.
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, is_active, approval_status)
  values
    (v_lot, current_setting('gg.owner')::uuid, 'Cochera A (ownership_checks)', 'Dirección de prueba',
     -34.6037, -58.3816, 100, 1, false, 'pending'),
    (v_lot2, current_setting('gg.owner')::uuid, 'Cochera B (ownership_checks)', 'Dirección de prueba',
     -34.6037, -58.3816, 100, 1, false, 'pending');

  -- 1. Una cochera nueva de titular pide DNI y comprobante de propiedad.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_missing := public.lot_missing_documents(v_lot);
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'titular sin documentos: faltan DNI y propiedad',
      case when v_missing @> array['dni', 'property_proof'] and cardinality(v_missing) = 2 then 'OK' else 'FALLA' end,
      array_to_string(v_missing, ','));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'titular sin documentos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. No se puede activar (publicar) sin documentos.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      update public.parking_lots set is_active = true where id = v_lot;
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 2, 'activar sin documentos', 'FALLA', 'la dejó activar');
    exception when others then
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 2, 'activar sin documentos',
        case when sqlerrm like '%ownership_docs_required%' then 'OK' else 'FALLA' end, sqlerrm);
    end;
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'activar sin documentos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. Otra persona no puede subir un documento a una cochera ajena.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.parking_lot_documents (parking_lot_id, kind, storage_path)
      values (v_lot, 'dni', current_setting('gg.driver') || '/' || v_lot::text || '/dni.jpg');
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 3, 'subir documento a cochera ajena', 'FALLA', 'lo aceptó');
    exception when others then
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 3, 'subir documento a cochera ajena', 'OK', sqlerrm);
    end;
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'subir documento a cochera ajena', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. El dueño no puede registrar una ruta que no sea de su carpeta y de esa cochera.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.parking_lot_documents (parking_lot_id, kind, storage_path)
      values (v_lot, 'dni', current_setting('gg.driver') || '/' || v_lot::text || '/robado.jpg');
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 4, 'registrar un archivo ajeno', 'FALLA', 'lo aceptó');
    exception when others then
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 4, 'registrar un archivo ajeno', 'OK', sqlerrm);
    end;
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'registrar un archivo ajeno', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 5. Con DNI + boleta el dueño completa los requisitos y puede activar.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.parking_lot_documents (parking_lot_id, kind, storage_path) values
      (v_lot, 'dni', current_setting('gg.owner') || '/' || v_lot::text || '/dni.jpg'),
      (v_lot, 'tax_bill', current_setting('gg.owner') || '/' || v_lot::text || '/boleta.jpg');
    v_missing := public.lot_missing_documents(v_lot);
    update public.parking_lots set is_active = true where id = v_lot;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'DNI + boleta: completo y se puede activar',
      case when cardinality(v_missing) = 0 then 'OK' else 'FALLA' end, coalesce(array_to_string(v_missing, ','), ''));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'DNI + boleta: completo y se puede activar', 'FALLA', sqlerrm);
  end;

  -- 6. Otra persona no ve los documentos; el admin sí.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_other from public.parking_lot_documents where parking_lot_id = v_lot;
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_count from public.parking_lot_documents where parking_lot_id = v_lot;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'lectura: otro usuario no, admin sí',
      case when v_other = 0 and v_count = 2 then 'OK' else 'FALLA' end,
      format('otro usuario: %s / admin: %s', v_other, v_count));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'lectura de documentos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 7. Otra persona no puede consultar qué le falta a una cochera ajena.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.driver'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.lot_missing_documents(v_lot);
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 7, 'lot_missing_documents ajena', 'FALLA', 'la dejó consultar');
    exception when others then
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 7, 'lot_missing_documents ajena',
        case when sqlerrm like '%not_allowed%' then 'OK' else 'FALLA' end, sqlerrm);
    end;
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 7, 'lot_missing_documents ajena', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 8. El admin no puede aprobar una publicación sin documentos...
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.admin_review_parking_lot(v_lot2, 'approved', null, null);
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 8, 'aprobar sin documentos', 'FALLA', 'la aprobó');
    exception when others then
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 8, 'aprobar sin documentos',
        case when sqlerrm like '%ownership_docs_missing%' then 'OK' else 'FALLA' end, sqlerrm);
    end;
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 8, 'aprobar sin documentos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 9. ...y con documentos completos sí.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.admin_review_parking_lot(v_lot, 'approved', null, null);
    execute 'reset role';
    select approval_status into v_text from public.parking_lots where id = v_lot;
    v_report := v_report || e'\n' || concat_ws(' | ', 9, 'aprobar con documentos',
      case when v_text = 'approved' then 'OK' else 'FALLA' end, v_text);
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 9, 'aprobar con documentos', 'FALLA', sqlerrm);
  end;

  -- 10. Una vez aprobada, el dueño ya no puede borrar los documentos (quedan como constancia).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    delete from public.parking_lot_documents where parking_lot_id = v_lot;
    execute 'reset role';
    select count(*) into v_count from public.parking_lot_documents where parking_lot_id = v_lot;
    v_report := v_report || e'\n' || concat_ws(' | ', 10, 'borrar documentos de una aprobada',
      case when v_count = 2 then 'OK' else 'FALLA' end, format('quedaron %s de 2', v_count));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 10, 'borrar documentos de una aprobada', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 11. Inquilino: pide DNI + contrato + autorización del dueño. Administrador: DNI + autorización.
  begin
    update public.parking_lots set holder_role = 'tenant' where id = v_lot2;
    v_missing := public.lot_missing_documents(v_lot2);
    v_text := array_to_string(v_missing, ',');
    update public.parking_lots set holder_role = 'manager' where id = v_lot2;
    v_missing := public.lot_missing_documents(v_lot2);
    v_report := v_report || e'\n' || concat_ws(' | ', 11, 'requisitos de inquilino y administrador',
      case when v_text = 'dni,rental_contract,owner_authorization'
                and array_to_string(v_missing, ',') = 'dni,owner_authorization' then 'OK' else 'FALLA' end,
      format('inquilino: %s / administrador: %s', v_text, array_to_string(v_missing, ',')));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 11, 'requisitos de inquilino y administrador', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 12. holder_role solo acepta los tres valores.
  begin
    update public.parking_lots set holder_role = 'inventado' where id = v_lot2;
    v_report := v_report || e'\n' || concat_ws(' | ', 12, 'holder_role inválido', 'FALLA', 'aceptó un valor inventado');
  exception when check_violation then
    v_report := v_report || e'\n' || concat_ws(' | ', 12, 'holder_role inválido', 'OK', sqlerrm);
  end;

  -- 13. Al aprobar quedó el sello (quién y cuándo) y la cochera verificada ya no "debe" documentos
  --     aunque se borren (0079).
  begin
    select ownership_verified_by::text, (ownership_verified_at is not null)::text
    into v_text, v_other_text
    from public.parking_lots where id = v_lot;
    delete from public.parking_lot_documents where parking_lot_id = v_lot;
    v_missing := public.lot_missing_documents(v_lot);
    v_report := v_report || e'
' || concat_ws(' | ', 13, 'sello de verificación y sin documentos',
      case when v_text = current_setting('gg.admin') and v_other_text = 'true' and cardinality(v_missing) = 0
           then 'OK' else 'FALLA' end,
      format('verificó: %s / con fecha: %s / faltantes: %s', v_text, v_other_text, coalesce(array_to_string(v_missing, ','), '')));
  exception when others then
    v_report := v_report || e'
' || concat_ws(' | ', 13, 'sello de verificación y sin documentos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 14. El dueño no puede ponerse ni quitarse el sello.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.parking_lots set ownership_verified_at = null, ownership_verified_by = null where id = v_lot;
    update public.parking_lots set ownership_verified_at = now() where id = v_lot2;
    execute 'reset role';
    select count(*) into v_count from public.parking_lots where id = v_lot and ownership_verified_at is not null;
    select count(*) into v_other from public.parking_lots where id = v_lot2 and ownership_verified_at is not null;
    v_report := v_report || e'
' || concat_ws(' | ', 14, 'el cliente no toca el sello',
      case when v_count = 1 and v_other = 0 then 'OK' else 'FALLA' end,
      format('verificada conserva el sello: %s / otra no lo recibió: %s', v_count = 1, v_other = 0));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'
' || concat_ws(' | ', 14, 'el cliente no toca el sello', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 15. El admin puede borrar documentos (lo necesita el panel para limpiar tras decidir).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    insert into public.parking_lot_documents (parking_lot_id, kind, storage_path)
    values (v_lot2, 'dni', current_setting('gg.owner') || '/' || v_lot2::text || '/dni.jpg');
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    delete from public.parking_lot_documents where parking_lot_id = v_lot2;
    execute 'reset role';
    select count(*) into v_count from public.parking_lot_documents where parking_lot_id = v_lot2;
    v_report := v_report || e'
' || concat_ws(' | ', 15, 'el admin borra documentos',
      case when v_count = 0 then 'OK' else 'FALLA' end, format('quedaron %s', v_count));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'
' || concat_ws(' | ', 15, 'el admin borra documentos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- Revierte todo y muestra el reporte.
  raise exception '%', v_report;
end $$;
