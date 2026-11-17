-- GarageGo — verificación de la migración 0102 (versión de revisión en la moderación), contra las
-- RPC y triggers REALES del proyecto.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr la 0102.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo y su mensaje ES el reporte.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
--   gg.owner → un usuario cualquiera (dueño de las cocheras de prueba)
--   gg.admin → un usuario con is_admin = true

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_user uuid;
  v_lot uuid := 'ffffffff-0000-0000-0000-0000000000d1';
  v_lot2 uuid := 'ffffffff-0000-0000-0000-0000000000d2';
  v_lot3 uuid := 'ffffffff-0000-0000-0000-0000000000d3';
  v_v0 bigint;
  v_v1 bigint;
  v_v2 bigint;
  v_v3 bigint;
  v_required uuid[];
  v_err text;
  v_err2 text;
  v_text text;
  v_num numeric;
begin
  perform set_config('gg.owner', 'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar
  perform set_config('gg.admin', 'fa32b803-09e1-4120-8c15-0112a8371373', true);  -- ← completar
  v_user := current_setting('gg.owner')::uuid;

  -- Fixtures: tres cocheras pendientes, con foto y titularidad verificada (no piden documentos).
  insert into public.parking_lots
    (id, owner_id, name, address, latitude, longitude, price_per_hour, capacity, is_active, approval_status, ownership_verified_at)
  select id, v_user, 'Cochera (review_version_checks)', 'Dirección', -34.6037, -58.3816, 100, 1, false, 'pending', now()
  from unnest(array[v_lot, v_lot2, v_lot3]) id;
  insert into public.parking_images (parking_lot_id, storage_path, position)
  select id, v_user::text || '/' || id::text || '/foto1.jpg', 0 from unnest(array[v_lot, v_lot2, v_lot3]) id;

  -- 1. La versión sube con los cambios que se revisan y el cliente no la puede escribir.
  begin
    select review_version into v_v0 from public.parking_lots where id = v_lot;
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.parking_lots set price_per_hour = 150 where id = v_lot;
    update public.parking_lots set review_version = 999 where id = v_lot;
    execute 'reset role';
    select review_version into v_v1 from public.parking_lots where id = v_lot;
    insert into public.parking_images (parking_lot_id, storage_path, position)
      values (v_lot, v_user::text || '/' || v_lot::text || '/foto2.jpg', 1);
    select review_version into v_v2 from public.parking_lots where id = v_lot;
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'la versión sigue los cambios',
      case when v_v1 = v_v0 + 1 and v_v2 = v_v1 + 1 then 'OK' else 'FALLA' end,
      format('inicial: %s / tarifa: %s (intento de poner 999 ignorado) / foto: %s', v_v0, v_v1, v_v2));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'la versión sigue los cambios', 'ERROR INESPERADO', sqlerrm);
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);

  -- 2. Checklist incompleto y versión vieja no aprueban; la versión vigente con el checklist, sí.
  --    La constancia guarda la versión aprobada y la foto de lo aprobado coincide.
  begin
    execute 'set local role authenticated';
    select coalesce(array_agg(id) filter (where required), '{}') into v_required from public.lot_checklist_items(v_lot);
    begin
      if cardinality(v_required) = 0 then
        raise exception 'checklist_incomplete: (sin puntos obligatorios configurados)';
      end if;
      perform public.admin_review_parking_lot(v_lot, 'approved', null, null, '{}', v_v2);
      v_err := 'aprobó sin el checklist';
    exception when others then
      v_err := case when sqlerrm like '%checklist_incomplete%' then 'checklist incompleto: no' else sqlerrm end;
    end;
    begin
      perform public.admin_review_parking_lot(v_lot, 'approved', null, null, v_required, v_v0);
      v_err2 := 'aprobó con la versión vieja';
    exception when others then
      v_err2 := case when sqlerrm like '%review_stale%' then 'versión vieja: no' else sqlerrm end;
    end;
    perform public.admin_review_parking_lot(v_lot, 'approved', null, null, v_required, v_v2);
    execute 'reset role';
    select approval_status into v_text from public.parking_lots where id = v_lot;
    select review_version into v_v3 from public.listing_review_checks where parking_lot_id = v_lot order by created_at desc limit 1;
    select (approved_snapshot->>'price')::numeric into v_num from public.parking_lots where id = v_lot;
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'aprobar con la versión revisada',
      case when v_err = 'checklist incompleto: no' and v_err2 = 'versión vieja: no' and v_text = 'approved'
                and v_v3 = v_v2 and v_num = 150 then 'OK' else 'FALLA' end,
      format('%s / %s / estado: %s / versión en la constancia: %s / tarifa aprobada: %s', v_err, v_err2, v_text, v_v3, v_num));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'aprobar con la versión revisada', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. Si el propietario edita mientras el panel la tiene abierta, la aprobación con la versión que
  --    se veía no pasa.
  begin
    select review_version into v_v0 from public.parking_lots where id = v_lot2;
    update public.parking_lots set name = 'Nombre cambiado durante la revisión' where id = v_lot2;
    execute 'set local role authenticated';
    select coalesce(array_agg(id) filter (where required), '{}') into v_required from public.lot_checklist_items(v_lot2);
    begin
      perform public.admin_review_parking_lot(v_lot2, 'approved', null, null, v_required, v_v0);
      v_err := 'aprobó lo que cambió';
    exception when others then
      v_err := case when sqlerrm like '%review_stale%' then 'no aprobó lo que cambió' else sqlerrm end;
    end;
    execute 'reset role';
    select approval_status into v_text from public.parking_lots where id = v_lot2;
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'editada durante la revisión',
      case when v_err = 'no aprobó lo que cambió' and v_text = 'pending' then 'OK' else 'FALLA' end,
      format('%s / estado: %s', v_err, v_text));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'editada durante la revisión', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. Rechazar con motivo y pedir cambios siguen funcionando.
  begin
    execute 'set local role authenticated';
    perform public.admin_review_parking_lot(v_lot2, 'changes_requested', 'Falta una foto del acceso.', array['photos']);
    perform public.admin_review_parking_lot(v_lot3, 'rejected', 'Fotos de otra cochera. Prueba.');
    execute 'reset role';
    select string_agg(approval_status, ', ' order by id) into v_text from public.parking_lots where id in (v_lot2, v_lot3);
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'rechazar y pedir cambios',
      case when v_text = 'changes_requested, rejected' then 'OK' else 'FALLA' end, format('estados: %s', v_text));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'rechazar y pedir cambios', 'ERROR INESPERADO', sqlerrm);
  end;

  raise exception '%', v_report;
end $$;
