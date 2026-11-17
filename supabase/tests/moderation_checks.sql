-- GarageGo — verificación de la migración 0095 (moderación configurable), contra las policies REALES
-- del proyecto.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run, DESPUÉS de correr la 0095.
--
-- NO deja datos: es un único bloque DO que termina con un error a propósito. Ese error revierte
-- todo (motivos y plazos cambiados incluidos) y su mensaje ES el reporte, con una línea OK / FALLA
-- por prueba.
--
-- ── Antes de correr ──────────────────────────────────────────────────────────────────────
-- Completar los dos ids del principio del bloque (los mismos que checklist_checks.sql):
--   gg.owner → un usuario cualquiera (sin permisos de admin)
--   gg.admin → un usuario con is_admin = true

do $$
declare
  v_report text := 'RESULTADOS (todo se revirtió; este error es el reporte esperado):';
  v_id uuid;
  v_count int;
  v_text text;
  v_err text;
  v_err2 text;
  v_json jsonb;
begin
  perform set_config('gg.owner', 'c6838a83-c035-4d2f-bf87-4717e40bd37d', true);  -- ← completar
  perform set_config('gg.admin', 'fa32b803-09e1-4120-8c15-0112a8371373', true);  -- ← completar

  -- 1. Un usuario común no ve los motivos, no los edita y no cambia los plazos.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.owner'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_count from public.moderation_reasons;
    begin
      insert into public.moderation_reasons (kind, label) values ('reject', 'Motivo trucho');
      v_err := 'lo dejó insertar';
    exception when others then
      v_err := 'no lo dejó insertar';
    end;
    begin
      perform public.admin_update_settings('{"review_sla_info_hours": 2}');
      v_err2 := 'lo dejó';
    exception when others then
      v_err2 := sqlstate;
    end;
    v_json := public.public_settings();
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'el cliente no ve ni edita la moderación',
      case when v_count = 0 and v_err = 'no lo dejó insertar' and v_err2 = '42501'
                and not v_json ? 'review_sla_info_hours' then 'OK' else 'FALLA' end,
      format('filas visibles: %s / %s / plazos: %s / plazos públicos: %s',
             v_count, v_err, v_err2, v_json ? 'review_sla_info_hours'));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 1, 'el cliente no ve la moderación', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 2. El admin ve los motivos de hoy, agrega uno, lo edita, lo reordena y lo borra. El tipo no cambia.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_count from public.moderation_reasons;
    insert into public.moderation_reasons (kind, label, position) values ('reject', '  Motivo de prueba  ', 80)
    returning id, label into v_id, v_text;
    update public.moderation_reasons set label = 'Motivo de prueba editado', position = 5 where id = v_id;
    begin
      update public.moderation_reasons set kind = 'pause' where id = v_id;
      v_err := 'dejó cambiar el tipo';
    exception when others then
      v_err := case when sqlerrm like '%moderation_kind_immutable%' then 'tipo fijo' else sqlerrm end;
    end;
    select label into v_err2 from public.moderation_reasons where id = v_id;
    delete from public.moderation_reasons where id = v_id;
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'el admin agrega, edita y borra',
      case when v_count >= 17 and v_text = 'Motivo de prueba' and v_err = 'tipo fijo'
                and v_err2 = 'Motivo de prueba editado'
                and not exists (select 1 from public.moderation_reasons where id = v_id) then 'OK' else 'FALLA' end,
      format('motivos: %s / guardado como "%s" / %s / editado: %s', v_count, v_text, v_err, v_err2));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 2, 'el admin agrega, edita y borra', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 3. Un nombre no se repite dentro del mismo tipo (ni con otras mayúsculas o espacios); en otro
  --    tipo sí ("Otro" está en los tres).
  begin
    begin
      insert into public.moderation_reasons (kind, label) values ('reject', ' otro ');
      v_err := 'dejó repetir';
    exception when unique_violation then
      v_err := 'no dejó repetir';
    end;
    select count(*) into v_count from public.moderation_reasons where lower(label) = 'otro';
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'sin repetidos dentro de un tipo',
      case when v_err = 'no dejó repetir' and v_count = 3 then 'OK' else 'FALLA' end,
      format('%s / "Otro" en %s tipos', v_err, v_count));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 3, 'sin repetidos', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 4. Ningún tipo se queda sin motivos activos: ni desactivándolos todos ni borrándolos.
  begin
    begin
      update public.moderation_reasons set is_active = false where kind = 'hide_review';
      v_err := 'dejó desactivar todos';
    exception when others then
      v_err := case when sqlerrm like '%moderation_kind_without_reasons: hide_review%' then 'no dejó desactivar' else sqlerrm end;
    end;
    begin
      delete from public.moderation_reasons where kind = 'pause';
      v_err2 := 'dejó borrar todos';
    exception when others then
      v_err2 := case when sqlerrm like '%moderation_kind_without_reasons: pause%' then 'no dejó borrar' else sqlerrm end;
    end;
    -- Desactivar todos menos uno sí se puede.
    update public.moderation_reasons set is_active = false
    where kind = 'reject' and id <> (select id from public.moderation_reasons where kind = 'reject' order by position limit 1);
    select count(*) into v_count from public.moderation_reasons where kind = 'reject' and is_active;
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'siempre un motivo activo por tipo',
      case when v_err = 'no dejó desactivar' and v_err2 = 'no dejó borrar' and v_count = 1 then 'OK' else 'FALLA' end,
      format('%s / %s / dejando uno: %s activo', v_err, v_err2, v_count));
  exception when others then
    v_report := v_report || e'\n' || concat_ws(' | ', 4, 'siempre un motivo activo', 'ERROR INESPERADO', sqlerrm);
  end;

  -- 5. Plazos: el servidor rechaza valores desordenados, fuera de rango o con decimales, y guarda los válidos.
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('gg.admin'), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_text := '';
  begin
    perform public.admin_update_settings('{"review_sla_warn_hours": 20}');  -- menor que azul (24)
    v_text := v_text || 'desordenado: lo dejó';
  exception when others then
    v_text := v_text || case when sqlerrm like '%setting_invalid: review_sla_warn_hours%' then 'desordenado: no' else sqlerrm end;
  end;
  begin
    perform public.admin_update_settings('{"review_sla_danger_hours": 800}');
    v_text := v_text || ' / 800 h: lo dejó';
  exception when others then
    v_text := v_text || case when sqlerrm like '%setting_invalid: review_sla_danger_hours%' then ' / 800 h: no' else ' / ' || sqlerrm end;
  end;
  begin
    perform public.admin_update_settings('{"review_sla_info_hours": 1.5}');
    v_text := v_text || ' / decimales: lo dejó';
  exception when others then
    v_text := v_text || case when sqlerrm like '%setting_invalid: review_sla_info_hours%' then ' / decimales: no' else ' / ' || sqlerrm end;
  end;
  begin
    perform public.admin_update_settings('{"review_sla_info_hours": 12, "review_sla_warn_hours": 36, "review_sla_danger_hours": 60}');
    execute 'reset role';
    select string_agg(key || '=' || value::text, ', ' order by key) into v_err
    from public.app_settings where section = 'moderation';
    select count(*) into v_count from public.app_settings
    where section = 'moderation' and updated_by = current_setting('gg.admin')::uuid;
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'plazos validados en el servidor',
      case when v_text = 'desordenado: no / 800 h: no / decimales: no'
                and v_err = 'review_sla_danger_hours=60, review_sla_info_hours=12, review_sla_warn_hours=36'
                and v_count = 3 then 'OK' else 'FALLA' end,
      v_text || ' / guardado: ' || coalesce(v_err, '—'));
  exception when others then
    execute 'reset role';
    v_report := v_report || e'\n' || concat_ws(' | ', 5, 'plazos validados', 'ERROR INESPERADO', v_text || ' / ' || sqlerrm);
  end;

  raise exception '%', v_report;
end $$;
