-- GarageGo — verificación de la migración 0082 (toda publicación necesita al menos una foto, y
-- cambiar la dirección de una cochera ya verificada exige acreditar la titularidad de nuevo),
-- contra las policies REALES del proyecto.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr la 0082.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (fixtures incluidos) y su mensaje ES el reporte, con una línea OK / FALLA por prueba.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Completar los tres ids del principio del bloque (los mismos que ownership_checks.sql):
--   gg.driver → un usuario cualquiera
--   gg.owner  → otro usuario (dueño de las cocheras de prueba que arma este script)
--   gg.admin  → un usuario con is_admin = true

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_count int;
  v_text text;
  v_stamp text;
  v_lot_a uuid := 'ffffffff-0000-0000-0000-0000000000d1';  -- sin fotos: pendiente con documentos
  v_lot_v uuid := 'ffffffff-0000-0000-0000-0000000000d2';  -- ya verificada
begin
  perform set_config('gg.driver', '58c73669-a744-4eff-8fe1-f74d1f2af37b', true);  -- ← completar
  perform set_config('gg.owner',  'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar
  perform set_config('gg.admin',  'fa32b803-09e1-4120-8c15-0112a8371373', true);  -- ← completar

  -- Fixtures (como postgres, se revierten al final).
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, is_active, approval_status)
  values
    (v_lot_a, current_setting('gg.owner')::uuid, 'Cochera A (photo_address_checks)', 'Dirección de prueba',
     -34.6037, -58.3816, 100, 1, false, 'pending'),
    (v_lot_v, current_setting('gg.owner')::uuid, 'Cochera V (photo_address_checks)', 'Dirección de prueba',
     -34.6037, -58.3816, 100, 1, true, 'approved');

  -- La cochera A ya tiene los documentos (DNI + boleta): lo único que le falta es la foto.
  insert into public.parking_lot_documents (parking_lot_id, kind, storage_path) values
    (v_lot_a, 'dni', current_setting('gg.owner') || '/' || v_lot_a::text || '/dni.jpg'),
    (v_lot_a, 'tax_bill', current_setting('gg.owner') || '/' || v_lot_a::text || '/boleta.jpg');

  -- La cochera V quedó verificada (como si el equipo la hubiera aprobado): lleva el sello.
  update public.parking_lots
    set ownership_verified_at = now(), ownership_verified_by = current_setting('gg.admin')::uuid
    where id = v_lot_v;

  -- 1. No se puede activar (publicar) una cochera sin fotos.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      update public.parking_lots set is_active = true where id = v_lot_a;
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 1, 'activar sin fotos', 'FALLA', 'la dejó activar');
    exception when others then
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 1, 'activar sin fotos',
        case when sqlerrm like '%photo_required%' then 'OK' else 'FALLA' end, sqlerrm);
    end;
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'activar sin fotos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. El equipo no puede aprobar una publicación sin fotos, aunque tenga los documentos.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.admin_review_parking_lot(v_lot_a, 'approved', null, null);
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 2, 'aprobar sin fotos', 'FALLA', 'la aprobó');
    exception when others then
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 2, 'aprobar sin fotos',
        case when sqlerrm like '%photos_missing%' then 'OK' else 'FALLA' end, sqlerrm);
    end;
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'aprobar sin fotos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. Con una foto, el propietario puede activarla y el equipo aprobarla.
  begin
    insert into public.parking_images (parking_lot_id, storage_path, position)
    values (v_lot_a, current_setting('gg.owner') || '/' || v_lot_a::text || '/foto.jpg', 0);  -- como postgres
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.parking_lots set is_active = true where id = v_lot_a;
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.admin_review_parking_lot(v_lot_a, 'approved', null, null);
    execute 'reset role';
    select approval_status into v_text from public.parking_lots where id = v_lot_a;
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'con una foto se activa y se aprueba',
      case when v_text = 'approved' then 'OK' else 'FALLA' end, v_text);
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'con una foto se activa y se aprueba', 'FALLA', sqlerrm);
  end;

  -- 4. Cambiar el nombre o la tarifa de una cochera verificada NO le quita el sello.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.parking_lots set name = 'Cochera V renombrada', price_per_hour = 120 where id = v_lot_v;
    execute 'reset role';
    select (ownership_verified_at is not null)::text into v_stamp from public.parking_lots where id = v_lot_v;
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'cambiar nombre y tarifa conserva el sello (0082)',
      case when v_stamp = 'true' then 'OK' else 'FALLA' end, format('conserva el sello: %s', v_stamp));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'cambiar nombre y tarifa conserva el sello', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 5. Cambiar la dirección le quita el sello y la manda a revisión.
  begin
    update public.parking_lots set approval_status = 'approved' where id = v_lot_v;  -- como postgres
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.parking_lots set address = 'Otra dirección distinta' where id = v_lot_v;
    execute 'reset role';
    select (ownership_verified_at is not null)::text, approval_status into v_stamp, v_text
    from public.parking_lots where id = v_lot_v;
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'cambiar la dirección quita el sello y revisa',
      case when v_stamp = 'false' and v_text = 'pending' then 'OK' else 'FALLA' end,
      format('con sello: %s / estado: %s', v_stamp, v_text));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'cambiar la dirección quita el sello', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 6. Sin el sello, la publicación vuelve a pedir los documentos (el equipo no la puede aprobar).
  begin
    insert into public.parking_images (parking_lot_id, storage_path, position)
    values (v_lot_v, current_setting('gg.owner') || '/' || v_lot_v::text || '/foto.jpg', 0);  -- como postgres
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.admin_review_parking_lot(v_lot_v, 'approved', null, null);
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 6, 'sin sello se piden los documentos de nuevo', 'FALLA', 'la aprobó sin documentos');
    exception when others then
      execute 'reset role';
      v_report := v_report || e'\n' || concat_ws(' | ', 6, 'sin sello se piden los documentos de nuevo',
        case when sqlerrm like '%ownership_docs_missing%' then 'OK' else 'FALLA' end, sqlerrm);
    end;
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 6, 'sin sello se piden los documentos de nuevo', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 7. El propietario no puede devolverse el sello a mano.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.parking_lots set ownership_verified_at = now() where id = v_lot_v;
    execute 'reset role';
    select (ownership_verified_at is not null)::text into v_stamp from public.parking_lots where id = v_lot_v;
    v_report := v_report || e'\n' || concat_ws(' | ', 7, 'el cliente no se pone el sello',
      case when v_stamp = 'false' then 'OK' else 'FALLA' end, format('con sello: %s', v_stamp));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 7, 'el cliente no se pone el sello', 'ERROR INESPERADO', sqlerrm);
  end;

  -- Revierte todo y muestra el reporte.
  raise exception '%', v_report;
end $$;
