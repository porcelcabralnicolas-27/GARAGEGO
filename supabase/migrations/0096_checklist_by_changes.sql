-- GarageGo — checklist de aprobación según lo que cambió y con controles automáticos
-- (Configuración → Aprobación y titularidad, fase 3).
-- Requiere 0089 (approved_snapshot), 0092 (checklist) y 0095 (admin_update_settings con plazos).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, ON CONFLICT, DROP IF EXISTS y CREATE OR REPLACE. Re-correr
-- es seguro y no pisa lo que el equipo ya haya configurado.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────────────────
--   1. Cada punto del checklist puede decir "en una edición, solo si cambió…" (`applies_when_changed`):
--      nombre, descripción, dirección, ubicación, tarifa, capacidad, servicios, fotos o tipo. Vacío =
--      como hasta ahora. En un alta nueva no cuenta: se revisa todo.
--      `lot_checklist_items` lo aplica, y como la RPC de aprobación exige los obligatorios que esa
--      función devuelve, un punto que no aplica tampoco se exige.
--   2. Cada punto puede tener un control automático (`auto_check`): `photos`, `contact_info` o
--      `price`. Los calcula el panel y los muestra junto al punto; no tildan ni bloquean nada.
--   3. `review_price_factor` (sección moderación): el control de tarifa avisa si se aparta más de
--      ese factor de la mediana de las cocheras aprobadas del mismo país y tipo.
--
-- ── Qué cambió en una edición ─────────────────────────────────────────────────────────────
-- `lot_review_changes(lot)` compara `approved_snapshot` (0089) con el estado actual. Es la misma
-- regla que `listingChangesSince` (shared/domain.ts), que usa el panel para mostrar los cambios.


-- 1. Columnas nuevas del checklist --------------------------------------------------------------------
alter table public.review_checklist_items
  add column if not exists applies_when_changed text[] not null default '{}';
alter table public.review_checklist_items
  add column if not exists auto_check text;

alter table public.review_checklist_items drop constraint if exists review_checklist_items_changed_fields_check;
alter table public.review_checklist_items add constraint review_checklist_items_changed_fields_check
  check (applies_when_changed <@ array[
    'name', 'description', 'address', 'location', 'price', 'capacity', 'amenities', 'photos', 'lot_type'
  ]::text[]);

alter table public.review_checklist_items drop constraint if exists review_checklist_items_auto_check_check;
alter table public.review_checklist_items add constraint review_checklist_items_auto_check_check
  check (auto_check is null or auto_check in ('photos', 'contact_info', 'price'));

-- Los 4 puntos de base (0092) se conectan con lo que revisan. Solo si el equipo no los configuró.
update public.review_checklist_items set applies_when_changed = '{photos}', auto_check = 'photos'
  where id = 'c0920000-0000-0000-0000-000000000001' and applies_when_changed = '{}' and auto_check is null;
update public.review_checklist_items set applies_when_changed = '{address,location}'
  where id = 'c0920000-0000-0000-0000-000000000002' and applies_when_changed = '{}' and auto_check is null;
update public.review_checklist_items set applies_when_changed = '{price}', auto_check = 'price'
  where id = 'c0920000-0000-0000-0000-000000000003' and applies_when_changed = '{}' and auto_check is null;
update public.review_checklist_items set applies_when_changed = '{description}', auto_check = 'contact_info'
  where id = 'c0920000-0000-0000-0000-000000000004' and applies_when_changed = '{}' and auto_check is null;


-- 2. Qué cambió desde la última aprobación ------------------------------------------------------------
-- null = nunca fue aprobada (alta nueva). Vacío = es una edición pero los datos coinciden.
create or replace function public.lot_review_changes(p_lot_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_lot_type text;
  v_changes text[] := '{}';
begin
  if auth.uid() is not null
     and not public.is_admin(auth.uid())
     and not exists (select 1 from public.parking_lots where id = p_lot_id and owner_id = auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select approved_snapshot, lot_type into v_before, v_lot_type from public.parking_lots where id = p_lot_id;
  if v_before is null then
    return null;
  end if;
  v_after := public.lot_review_snapshot(p_lot_id);

  if btrim(coalesce(v_before->>'name', '')) is distinct from btrim(coalesce(v_after->>'name', '')) then
    v_changes := array_append(v_changes, 'name');
  end if;
  if btrim(coalesce(v_before->>'description', '')) is distinct from btrim(coalesce(v_after->>'description', '')) then
    v_changes := array_append(v_changes, 'description');
  end if;
  if btrim(coalesce(v_before->'address'->>'address', '')) is distinct from btrim(coalesce(v_after->'address'->>'address', '')) then
    v_changes := array_append(v_changes, 'address');
  end if;
  if (v_before->'address'->>'lat')::numeric is distinct from (v_after->'address'->>'lat')::numeric
     or (v_before->'address'->>'lng')::numeric is distinct from (v_after->'address'->>'lng')::numeric then
    v_changes := array_append(v_changes, 'location');
  end if;
  if v_before ? 'lot_type' and v_before->>'lot_type' is distinct from v_lot_type then
    v_changes := array_append(v_changes, 'lot_type');
  end if;
  if (v_before->>'price')::numeric is distinct from (v_after->>'price')::numeric then
    v_changes := array_append(v_changes, 'price');
  end if;
  if (v_before->>'capacity')::numeric is distinct from (v_after->>'capacity')::numeric then
    v_changes := array_append(v_changes, 'capacity');
  end if;
  -- Servicios y fotos, por conjunto (el orden no cuenta).
  if (select coalesce(array_agg(e order by e), '{}') from jsonb_array_elements_text(coalesce(v_before->'amenities', '[]')) e)
     is distinct from
     (select coalesce(array_agg(e order by e), '{}') from jsonb_array_elements_text(coalesce(v_after->'amenities', '[]')) e) then
    v_changes := array_append(v_changes, 'amenities');
  end if;
  if (select coalesce(array_agg(e order by e), '{}') from jsonb_array_elements_text(coalesce(v_before->'photos', '[]')) e)
     is distinct from
     (select coalesce(array_agg(e order by e), '{}') from jsonb_array_elements_text(coalesce(v_after->'photos', '[]')) e) then
    v_changes := array_append(v_changes, 'photos');
  end if;

  return v_changes;
end;
$$;

revoke all on function public.lot_review_changes(uuid) from public, anon;
grant execute on function public.lot_review_changes(uuid) to authenticated;


-- 3. Qué puntos corresponden a una publicación: suma "solo si cambió…" ---------------------------------
-- Misma regla que `itemsForLot` en el panel (checklistApi.ts).
create or replace function public.lot_checklist_items(p_lot_id uuid)
returns setof public.review_checklist_items
language sql
stable
security definer
set search_path = public
as $$
  select i.*
  from public.review_checklist_items i
  join public.parking_lots l on l.id = p_lot_id
  cross join lateral (select public.lot_review_changes(l.id) as changes) c
  where public.is_admin(auth.uid())
    and i.is_active
    and i.applies_lot_type in ('all', l.lot_type)
    and (
      i.applies_to = 'always'
      or (i.applies_to = 'new' and l.approved_snapshot is null)
      or (i.applies_to = 'edit' and l.approved_snapshot is not null)
    )
    and (not i.needs_documents or l.ownership_verified_at is null)
    -- En una edición, un punto con campos solo va si cambió alguno. En un alta (changes null), siempre.
    and (cardinality(i.applies_when_changed) = 0 or c.changes is null or i.applies_when_changed && c.changes)
  order by i.position, i.created_at;
$$;

revoke all on function public.lot_checklist_items(uuid) from public, anon;
grant execute on function public.lot_checklist_items(uuid) to authenticated;


-- 4. Factor del control de tarifa ---------------------------------------------------------------------
insert into public.app_settings (key, value, section, label, is_public, description) values
  ('review_price_factor', '2', 'moderation', 'Control de tarifa', false,
   'El control automático avisa si la tarifa es menos de la mediana dividida por este número o más de la mediana multiplicada por él.')
on conflict (key) do update
  set section = excluded.section, label = excluded.label, is_public = excluded.is_public,
      description = excluded.description;

-- 5. admin_update_settings: igual que en la 0095, más el factor de tarifa ---------------------------------
create or replace function public.admin_update_settings(p_values jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_known_keys constant text[] := array[
    'max_parking_images', 'max_vehicles_per_region', 'parking_capacity_min', 'parking_capacity_max',
    'wallet_max_balance', 'topup_min', 'topup_max', 'topup_quick_amounts',
    'review_sla_info_hours', 'review_sla_warn_hours', 'review_sla_danger_hours',
    'review_price_factor'
  ];
  v_new jsonb;      -- valores actuales con los cambios aplicados
  v_key text;
  v_value jsonb;
  v_amounts jsonb;
  v_amount numeric;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'setting_invalid: payload' using errcode = 'P0001';
  end if;

  -- Dos admins guardando a la vez: uno espera al otro y valida contra lo que quedó.
  perform pg_advisory_xact_lock(hashtext('garagego.app_settings'));

  for v_key in select jsonb_object_keys(p_values) loop
    if not v_key = any(v_known_keys) then
      raise exception 'setting_unknown: %', v_key using errcode = 'P0001';
    end if;
  end loop;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) || p_values into v_new
  from public.app_settings where key = any(v_known_keys);

  -- Enteros dentro de su rango.
  for v_key, v_value in select * from jsonb_each(v_new) where key <> 'topup_quick_amounts' loop
    if jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}')::numeric <> trunc((v_value #>> '{}')::numeric) then
      raise exception 'setting_invalid: %', v_key using errcode = 'P0001';
    end if;
  end loop;

  if (v_new->>'max_parking_images')::numeric not between 1 and 10 then
    raise exception 'setting_invalid: max_parking_images' using errcode = 'P0001';
  end if;
  if (v_new->>'max_vehicles_per_region')::numeric not between 1 and 10 then
    raise exception 'setting_invalid: max_vehicles_per_region' using errcode = 'P0001';
  end if;
  if (v_new->>'parking_capacity_min')::numeric not between 1 and 500 then
    raise exception 'setting_invalid: parking_capacity_min' using errcode = 'P0001';
  end if;
  if (v_new->>'parking_capacity_max')::numeric not between 1 and 500
     or (v_new->>'parking_capacity_max')::numeric < (v_new->>'parking_capacity_min')::numeric then
    raise exception 'setting_invalid: parking_capacity_max' using errcode = 'P0001';
  end if;
  if (v_new->>'wallet_max_balance')::numeric not between 1000 and 10000000 then
    raise exception 'setting_invalid: wallet_max_balance' using errcode = 'P0001';
  end if;
  if (v_new->>'topup_min')::numeric not between 100 and 10000000 then
    raise exception 'setting_invalid: topup_min' using errcode = 'P0001';
  end if;
  if (v_new->>'topup_max')::numeric < (v_new->>'topup_min')::numeric
     or (v_new->>'topup_max')::numeric > (v_new->>'wallet_max_balance')::numeric then
    raise exception 'setting_invalid: topup_max' using errcode = 'P0001';
  end if;

  -- Montos rápidos: de 1 a 6, enteros, sin repetir y entre la recarga mínima y la máxima.
  v_amounts := v_new->'topup_quick_amounts';
  if jsonb_typeof(v_amounts) <> 'array' or jsonb_array_length(v_amounts) not between 1 and 6 then
    raise exception 'setting_invalid: topup_quick_amounts' using errcode = 'P0001';
  end if;
  for v_value in select * from jsonb_array_elements(v_amounts) loop
    if jsonb_typeof(v_value) <> 'number' then
      raise exception 'setting_invalid: topup_quick_amounts' using errcode = 'P0001';
    end if;
    v_amount := (v_value #>> '{}')::numeric;
    if v_amount <> trunc(v_amount)
       or v_amount < (v_new->>'topup_min')::numeric
       or v_amount > (v_new->>'topup_max')::numeric then
      raise exception 'setting_invalid: topup_quick_amounts' using errcode = 'P0001';
    end if;
  end loop;
  if (select count(distinct e) from jsonb_array_elements(v_amounts) e) <> jsonb_array_length(v_amounts) then
    raise exception 'setting_invalid: topup_quick_amounts' using errcode = 'P0001';
  end if;
  -- Se guardan ordenados de menor a mayor.
  v_new := jsonb_set(v_new, '{topup_quick_amounts}',
    (select jsonb_agg(e order by (e #>> '{}')::numeric) from jsonb_array_elements(v_amounts) e));

  -- Plazos de la cola (0095): de 1 a 720 h (30 días) y de menor a mayor.
  if (v_new->>'review_sla_info_hours')::numeric not between 1 and 720 then
    raise exception 'setting_invalid: review_sla_info_hours' using errcode = 'P0001';
  end if;
  if (v_new->>'review_sla_warn_hours')::numeric not between 1 and 720
     or (v_new->>'review_sla_warn_hours')::numeric <= (v_new->>'review_sla_info_hours')::numeric then
    raise exception 'setting_invalid: review_sla_warn_hours' using errcode = 'P0001';
  end if;
  if (v_new->>'review_sla_danger_hours')::numeric not between 1 and 720
     or (v_new->>'review_sla_danger_hours')::numeric <= (v_new->>'review_sla_warn_hours')::numeric then
    raise exception 'setting_invalid: review_sla_danger_hours' using errcode = 'P0001';
  end if;

  -- Factor del control de tarifa (0096): de 2 a 10.
  if (v_new->>'review_price_factor')::numeric not between 2 and 10 then
    raise exception 'setting_invalid: review_price_factor' using errcode = 'P0001';
  end if;

  -- Guardar solo lo que cambió, con quién y cuándo.
  update public.app_settings s
  set value = v_new->s.key, updated_at = now(), updated_by = auth.uid()
  where s.key = any(v_known_keys) and s.key in (select jsonb_object_keys(p_values))
    and s.value is distinct from v_new->s.key;

  return public.public_settings();
end;
$$;

revoke all on function public.admin_update_settings(jsonb) from public, anon;
grant execute on function public.admin_update_settings(jsonb) to authenticated;
