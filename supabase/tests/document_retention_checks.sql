-- GarageGo — verificación de la migración 0101 (documentos de titularidad), contra las policies y
-- RPC REALES del proyecto.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr la 0101.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo y su mensaje ES el reporte. No sube archivos: prueba las filas, la regla que usa el bucket
-- (`lot_accepts_documents`) y el reemplazo.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
--   gg.owner → un usuario cualquiera, dueño de las cocheras de prueba
-- El "otro usuario" es un id inventado (no hace falta que exista).

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_user uuid;
  v_stranger uuid := 'eeeeeeee-0000-0000-0000-0000000000ee';
  v_pending uuid := 'ffffffff-0000-0000-0000-0000000000c1';
  v_approved uuid := 'ffffffff-0000-0000-0000-0000000000c2';
  v_json jsonb;
  v_count int;
  v_err text;
  v_err2 text;
  v_text text;
begin
  perform set_config('gg.owner', 'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar
  v_user := current_setting('gg.owner')::uuid;

  -- Fixtures: una cochera pendiente sin verificar y otra aprobada y verificada, del mismo dueño.
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, is_active, approval_status, ownership_verified_at)
  values
    (v_pending, v_user, 'Pendiente (document_checks)', 'Dirección', -34.6037, -58.3816, 100, 1, false, 'pending', null),
    (v_approved, v_user, 'Aprobada (document_checks)', 'Dirección', -34.6037, -58.3816, 100, 1, true, 'approved', now());

  -- 1. Quién puede registrar un documento: el dueño en la pendiente sí; en la aprobada no; otro
  --    usuario tampoco.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.parking_lot_documents (parking_lot_id, kind, storage_path)
      values (v_pending, 'dni', v_user::text || '/' || v_pending::text || '/dni-1.jpg');
    begin
      insert into public.parking_lot_documents (parking_lot_id, kind, storage_path)
        values (v_approved, 'dni', v_user::text || '/' || v_approved::text || '/dni-1.jpg');
      v_err := 'aceptó en la aprobada';
    exception when others then
      v_err := 'no aceptó en la aprobada';
    end;
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.parking_lot_documents (parking_lot_id, kind, storage_path)
        values (v_pending, 'tax_bill', v_stranger::text || '/' || v_pending::text || '/abl.jpg');
      v_err2 := 'aceptó a otro usuario';
    exception when others then
      v_err2 := 'no aceptó a otro usuario';
    end;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'quién registra documentos',
      case when v_err = 'no aceptó en la aprobada' and v_err2 = 'no aceptó a otro usuario' then 'OK' else 'FALLA' end,
      'dueño en la pendiente: sí / ' || v_err || ' / ' || v_err2);
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'quién registra documentos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. Otro usuario no ve los documentos del dueño.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_count from public.parking_lot_documents where parking_lot_id = v_pending;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'otro usuario no ve los documentos',
      case when v_count = 0 then 'OK' else 'FALLA' end, format('filas visibles: %s', v_count));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'otro usuario no ve los documentos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. La regla del bucket: carpeta propia de una cochera que acepta documentos.
  begin
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'regla del bucket',
      case when public.lot_accepts_documents(v_pending::text, v_user)
                and not public.lot_accepts_documents(v_approved::text, v_user)
                and not public.lot_accepts_documents(v_pending::text, v_stranger)
                and not public.lot_accepts_documents('no-es-un-uuid', v_user)
           then 'OK' else 'FALLA' end,
      'pendiente: sí / aprobada: no / otro usuario: no / carpeta inválida: no');
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'regla del bucket', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. Reemplazo: el nuevo queda y devuelve la ruta del viejo para borrar el archivo. Escritura y
  --    boleta cumplen el mismo requisito: la boleta reemplaza a la escritura.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_json := public.replace_lot_document(v_pending, 'dni', v_user::text || '/' || v_pending::text || '/dni-2.jpg', '{}');
    perform public.replace_lot_document(v_pending, 'ownership_deed', v_user::text || '/' || v_pending::text || '/deed.jpg', '{tax_bill}');
    perform public.replace_lot_document(v_pending, 'tax_bill', v_user::text || '/' || v_pending::text || '/abl.jpg', '{ownership_deed}');
    execute 'reset role';
    select string_agg(kind || '=' || storage_path, ', ' order by kind) into v_text
    from public.parking_lot_documents where parking_lot_id = v_pending;
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'reemplazo correcto',
      case when v_json->'removed_paths' = to_jsonb(array[v_user::text || '/' || v_pending::text || '/dni-1.jpg'])
                and v_text like 'dni=%dni-2.jpg, tax_bill=%abl.jpg' then 'OK' else 'FALLA' end,
      format('borrar: %s / quedan: %s', v_json->'removed_paths', v_text));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'reemplazo correcto', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 5. Un reemplazo que falla (ruta ajena, tipo inválido) deja el documento anterior como estaba; en
  --    la aprobada no se acepta.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.replace_lot_document(v_pending, 'dni', v_stranger::text || '/x/dni.jpg', '{}');
      v_err := 'aceptó una ruta ajena';
    exception when others then
      v_err := case when sqlerrm like '%invalid_document_path%' then 'rechazó la ruta ajena' else sqlerrm end;
    end;
    begin
      perform public.replace_lot_document(v_pending, 'dni', v_user::text || '/' || v_pending::text || '/x.jpg', '{}');
      perform public.replace_lot_document(v_pending, 'pasaporte', v_user::text || '/' || v_pending::text || '/p.jpg', '{dni}');
      v_err2 := 'aceptó un tipo inválido';
    exception when others then
      v_err2 := 'rechazó el tipo inválido';
    end;
    begin
      perform public.replace_lot_document(v_approved, 'dni', v_user::text || '/' || v_approved::text || '/dni.jpg', '{}');
      v_text := 'aceptó en la aprobada';
    exception when others then
      v_text := case when sqlerrm like '%documents_not_accepted%' then 'no aceptó en la aprobada' else sqlerrm end;
    end;
    execute 'reset role';
    select count(*) into v_count from public.parking_lot_documents
      where parking_lot_id = v_pending and kind = 'dni' and storage_path like '%dni-2.jpg';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'un error conserva el anterior',
      case when v_err = 'rechazó la ruta ajena' and v_err2 = 'rechazó el tipo inválido'
                and v_text = 'no aceptó en la aprobada' and v_count = 1 then 'OK' else 'FALLA' end,
      format('%s / %s / %s / el DNI anterior sigue: %s', v_err, v_err2, v_text, v_count));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'un error conserva el anterior', 'ERROR INESPERADO', sqlerrm);
  end;

  raise exception '%', v_report;
end $$;
