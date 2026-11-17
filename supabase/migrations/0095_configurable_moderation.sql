-- GarageGo — moderación configurable desde el panel (Configuración → Moderación): motivos de
-- rechazo, pausa y ocultar reseña, y plazos de la cola de aprobación.
-- Requiere 0033 (is_admin) y 0093 (app_settings con secciones y admin_update_settings).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: IF NOT EXISTS, ON CONFLICT, DROP IF EXISTS y CREATE OR REPLACE. Re-correr es seguro y
-- no pisa lo que el equipo ya haya cambiado (los motivos se cargan solo si el tipo está vacío).
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────────────────
-- Las listas de motivos y los plazos de la cola estaban fijos en el código del panel. Ahora:
--
--   * `moderation_reasons`: motivos por tipo (`reject` rechazo de publicación, `pause` pausa o
--     suspensión forzada, `hide_review` ocultar reseña), con orden y activo.
--   * `app_settings`, sección `moderation`: a cuántas horas de espera una publicación de la cola
--     pasa a azul, amarillo y rojo (hoy 24 / 48 / 72).
--
-- ── Reglas ────────────────────────────────────────────────────────────────────────────────
--   * Solo los usa el panel. El motivo elegido se sigue guardando como TEXTO en la cochera o la
--     reseña (`rejection_reason`, `pause_reason`, `hidden_reason`): editar o borrar un motivo no
--     cambia el historial, y la app no se entera.
--   * Siempre queda al menos un motivo activo de cada tipo.
--   * Los plazos se guardan con `admin_update_settings`, que valida: enteros de 1 a 720 h y de
--     menor a mayor (azul < amarillo < rojo).


-- 1. Motivos -----------------------------------------------------------------------------------------
create table if not exists public.moderation_reasons (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('reject', 'pause', 'hide_review')),
  label text not null check (char_length(btrim(label)) between 3 and 120),
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

-- El mismo motivo no se repite dentro de un tipo (sin importar mayúsculas ni espacios).
create unique index if not exists moderation_reasons_kind_label_key
  on public.moderation_reasons (kind, lower(btrim(label)));

-- Los de hoy, en el mismo orden. Solo si ese tipo todavía no tiene ninguno (re-correr no revive
-- los que el equipo borró).
insert into public.moderation_reasons (kind, label, position)
select v.kind, v.label, v.position
from (values
  ('reject', 'Fotos insuficientes o poco claras', 10),
  ('reject', 'La dirección no se puede verificar', 20),
  ('reject', 'No se pudo verificar la titularidad', 30),
  ('reject', 'Precio fuera de rango', 40),
  ('reject', 'Incluye datos de contacto en la descripción', 50),
  ('reject', 'Contenido inapropiado', 60),
  ('reject', 'Otro', 70),
  ('pause', 'Denuncias de acceso bloqueado', 10),
  ('pause', 'Datos de la publicación no verificables', 20),
  ('pause', 'Reclamos reiterados de conductores', 30),
  ('pause', 'Verificación de titularidad pendiente', 40),
  ('pause', 'Otro', 50),
  ('hide_review', 'Contiene datos personales de terceros', 10),
  ('hide_review', 'Lenguaje ofensivo', 20),
  ('hide_review', 'No describe la experiencia real', 30),
  ('hide_review', 'Sospecha de reseña falsa', 40),
  ('hide_review', 'Otro', 50)
) as v (kind, label, position)
where not exists (select 1 from public.moderation_reasons r where r.kind = v.kind);

alter table public.moderation_reasons enable row level security;

-- Solo el equipo: los usuarios de la app no los ven (ven el texto guardado en su cochera/reseña).
-- Se pueden borrar sin más: nada apunta a esta tabla.
drop policy if exists moderation_reasons_admin_select on public.moderation_reasons;
create policy moderation_reasons_admin_select on public.moderation_reasons for select to authenticated
  using (public.is_admin(auth.uid()));
drop policy if exists moderation_reasons_admin_insert on public.moderation_reasons;
create policy moderation_reasons_admin_insert on public.moderation_reasons for insert to authenticated
  with check (public.is_admin(auth.uid()));
drop policy if exists moderation_reasons_admin_update on public.moderation_reasons;
create policy moderation_reasons_admin_update on public.moderation_reasons for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists moderation_reasons_admin_delete on public.moderation_reasons;
create policy moderation_reasons_admin_delete on public.moderation_reasons for delete to authenticated
  using (public.is_admin(auth.uid()));

grant select, insert, update, delete on public.moderation_reasons to authenticated;

-- Si otro admin cambia un motivo, el panel abierto se actualiza solo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'moderation_reasons'
  ) then
    alter publication supabase_realtime add table public.moderation_reasons;
  end if;
end $$;

-- Quién lo tocó y cuándo; el texto, sin espacios de más.
create or replace function public.touch_moderation_reason()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind then
    raise exception 'moderation_kind_immutable' using errcode = 'P0001';
  end if;
  new.label := btrim(new.label);
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists moderation_reasons_touch on public.moderation_reasons;
create trigger moderation_reasons_touch
  before insert or update on public.moderation_reasons
  for each row execute function public.touch_moderation_reason();

-- Siempre al menos un motivo activo de cada tipo (si no, el diálogo quedaría sin opciones).
create or replace function public.ensure_moderation_reasons_per_kind()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_kind text;
begin
  foreach v_kind in array array['reject', 'pause', 'hide_review'] loop
    if not exists (select 1 from public.moderation_reasons where kind = v_kind and is_active) then
      raise exception 'moderation_kind_without_reasons: %', v_kind using errcode = 'P0001';
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists moderation_reasons_per_kind on public.moderation_reasons;
create trigger moderation_reasons_per_kind
  after update or delete on public.moderation_reasons
  for each statement execute function public.ensure_moderation_reasons_per_kind();


-- 2. Plazos de la cola de aprobación -------------------------------------------------------------------
insert into public.app_settings (key, value, section, label, is_public, description) values
  ('review_sla_info_hours', '24', 'moderation', 'Pasa a azul', false,
   'Horas de espera a partir de las cuales una publicación de la cola se marca en azul.'),
  ('review_sla_warn_hours', '48', 'moderation', 'Pasa a amarillo', false,
   'Horas de espera a partir de las cuales se marca en amarillo.'),
  ('review_sla_danger_hours', '72', 'moderation', 'Pasa a rojo', false,
   'Horas de espera a partir de las cuales se marca en rojo (atrasada).')
on conflict (key) do update
  set section = excluded.section, label = excluded.label, is_public = excluded.is_public,
      description = excluded.description;


-- 3. admin_update_settings: igual que en la 0093, más los plazos ----------------------------------------
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
    'review_sla_info_hours', 'review_sla_warn_hours', 'review_sla_danger_hours'
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
