-- GarageGo — catálogos configurables desde el panel (Configuración → Catálogos): servicios de las
-- cocheras y categorías de los tickets de soporte.
-- Requiere 0033 (is_admin), 0041 (support_tickets) y 0065 (parking_lots.amenities).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: IF NOT EXISTS, ON CONFLICT DO NOTHING, DROP IF EXISTS y CREATE OR REPLACE. Re-correr
-- es seguro y no pisa lo que el equipo ya haya cambiado.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────────────────
-- Los servicios (0065) y las categorías de tickets (0041) eran listas fijas: un check en la base y
-- constantes en la app y el panel. Ahora viven en dos tablas que el equipo edita:
--
--   * `parking_amenities`: código, nombre, nombre en inglés (demo de EE. UU.), ícono de una lista
--     fija, orden y activo.
--   * `ticket_categories`: código, nombre, para quién (conductor / propietario), orden y activo.
--
-- ── Reglas ────────────────────────────────────────────────────────────────────────────────
--   * El código lo genera la base a partir del nombre y no se puede cambiar: así no se rompen las
--     cocheras ni los tickets que ya lo usan.
--   * Servicios: el check fijo de la 0065 pasa a un trigger. Un servicio que se AGREGA a una cochera
--     tiene que existir y estar activo; uno que ya tenía y después se desactivó, se conserva.
--   * Categorías: el check de la 0041 pasa a una clave foránea. Un ticket nuevo tiene que usar una
--     categoría activa que corresponda al rol de quien lo abre (antes eso lo controlaba solo la app).
--   * Eliminar solo si nadie lo usa (`admin_delete_catalog_item`); si no, se desactiva.
--   * Siempre queda al menos una categoría activa para el conductor y otra para el propietario.
--   * La app lee todo con `public_catalogs()` y, si no puede, usa las listas de antes.


-- 1. Tablas -------------------------------------------------------------------------------------------
create table if not exists public.parking_amenities (
  code text primary key default '',
  label text not null check (char_length(btrim(label)) between 2 and 60),
  label_en text check (label_en is null or char_length(btrim(label_en)) between 2 and 60),
  icon text not null default 'checkmark-circle' check (icon in (
    'videocam', 'shield-checkmark', 'bulb', 'flash', 'water', 'lock-closed', 'home', 'accessibility',
    'wifi', 'umbrella', 'car', 'bicycle', 'time', 'key', 'person', 'construct', 'leaf', 'checkmark-circle'
  )),
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create table if not exists public.ticket_categories (
  code text primary key default '',
  label text not null check (char_length(btrim(label)) between 2 and 60),
  for_client boolean not null default true,
  for_owner boolean not null default true,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint ticket_categories_some_role check (for_client or for_owner)
);

-- Los valores de hoy, con los mismos códigos, textos e íconos.
insert into public.parking_amenities (code, label, label_en, icon, position) values
  ('cameras', 'Cámaras de seguridad', 'Security cameras', 'videocam', 10),
  ('security_staff', 'Personal de vigilancia', 'Security staff', 'shield-checkmark', 20),
  ('lighting', 'Iluminación y señalización', 'Lighting and signage', 'bulb', 30),
  ('ev_charger', 'Cargador para eléctricos', 'EV charger', 'flash', 40),
  ('restrooms', 'Sanitarios', 'Restrooms', 'water', 50)
on conflict (code) do nothing;

insert into public.ticket_categories (code, label, for_client, for_owner, position) values
  ('access', 'Acceso a la cochera', true, false, 10),
  ('listing', 'Publicación', false, true, 20),
  ('payment', 'Pagos y saldo', true, true, 30),
  ('behavior', 'Conducta', true, true, 40),
  ('other', 'Otro', true, true, 50)
on conflict (code) do nothing;

alter table public.parking_amenities enable row level security;
alter table public.ticket_categories enable row level security;

-- El equipo lee, crea y edita. Borrar, solo con la RPC (controla que no esté en uso).
drop policy if exists parking_amenities_admin_select on public.parking_amenities;
create policy parking_amenities_admin_select on public.parking_amenities for select to authenticated
  using (public.is_admin(auth.uid()));
drop policy if exists parking_amenities_admin_insert on public.parking_amenities;
create policy parking_amenities_admin_insert on public.parking_amenities for insert to authenticated
  with check (public.is_admin(auth.uid()));
drop policy if exists parking_amenities_admin_update on public.parking_amenities;
create policy parking_amenities_admin_update on public.parking_amenities for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists ticket_categories_admin_select on public.ticket_categories;
create policy ticket_categories_admin_select on public.ticket_categories for select to authenticated
  using (public.is_admin(auth.uid()));
drop policy if exists ticket_categories_admin_insert on public.ticket_categories;
create policy ticket_categories_admin_insert on public.ticket_categories for insert to authenticated
  with check (public.is_admin(auth.uid()));
drop policy if exists ticket_categories_admin_update on public.ticket_categories;
create policy ticket_categories_admin_update on public.ticket_categories for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Si otro admin cambia un catálogo, el panel abierto se actualiza solo.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['parking_amenities', 'ticket_categories'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;


-- 2. Código automático e inmutable, y quién lo tocó ---------------------------------------------------
create or replace function public.catalog_slug(p_label text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(nullif(btrim(regexp_replace(
    translate(lower(btrim(p_label)), 'áéíóúüñàèìòù', 'aeiouunaeiou'),
    '[^a-z0-9]+', '_', 'g'), '_'), ''), 'item');
$$;

create or replace function public.touch_catalog_item()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_base text;
  v_code text;
  v_n integer := 1;
  v_taken boolean;
begin
  if tg_op = 'INSERT' then
    if coalesce(btrim(new.code), '') = '' then
      v_base := left(public.catalog_slug(new.label), 40);
      v_code := v_base;
      loop
        execute format('select exists (select 1 from public.%I where code = $1)', tg_table_name)
          into v_taken using v_code;
        exit when not v_taken;
        v_n := v_n + 1;
        v_code := v_base || '_' || v_n;
      end loop;
      new.code := v_code;
    end if;
  elsif new.code is distinct from old.code then
    raise exception 'catalog_code_immutable' using errcode = 'P0001';
  end if;
  new.label := btrim(new.label);
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists parking_amenities_touch on public.parking_amenities;
create trigger parking_amenities_touch
  before insert or update on public.parking_amenities
  for each row execute function public.touch_catalog_item();

drop trigger if exists ticket_categories_touch on public.ticket_categories;
create trigger ticket_categories_touch
  before insert or update on public.ticket_categories
  for each row execute function public.touch_catalog_item();


-- 3. Siempre una categoría activa para cada rol ---------------------------------------------------------
create or replace function public.ensure_ticket_categories_per_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.ticket_categories where is_active and for_client) then
    raise exception 'catalog_role_without_categories: client' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.ticket_categories where is_active and for_owner) then
    raise exception 'catalog_role_without_categories: owner' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

drop trigger if exists ticket_categories_per_role on public.ticket_categories;
create trigger ticket_categories_per_role
  after update or delete on public.ticket_categories
  for each statement execute function public.ensure_ticket_categories_per_role();


-- 4. Servicios de una cochera: el check fijo pasa a un trigger ------------------------------------------
alter table public.parking_lots drop constraint if exists parking_lots_amenities_valid;

create or replace function public.enforce_parking_amenities()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous text[] := case when tg_op = 'UPDATE' then coalesce(old.amenities, '{}') else '{}' end;
  v_bad text;
begin
  select string_agg(a, ', ') into v_bad
  from unnest(coalesce(new.amenities, '{}')) a
  where not a = any(v_previous)
    and not exists (select 1 from public.parking_amenities p where p.code = a and p.is_active);
  if v_bad is not null then
    raise exception 'amenity_unavailable: %', v_bad using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists parking_lots_amenities_check on public.parking_lots;
create trigger parking_lots_amenities_check
  before insert or update of amenities on public.parking_lots
  for each row execute function public.enforce_parking_amenities();


-- 5. Categoría de un ticket: clave foránea + activa y del rol al abrirlo ---------------------------------
alter table public.support_tickets drop constraint if exists support_tickets_category_check;
alter table public.support_tickets drop constraint if exists support_tickets_category_fkey;
alter table public.support_tickets add constraint support_tickets_category_fkey
  foreign key (category) references public.ticket_categories (code);

create or replace function public.enforce_ticket_category()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.ticket_categories c
    where c.code = new.category and c.is_active
      and ((new.reporter_role = 'client' and c.for_client) or (new.reporter_role = 'owner' and c.for_owner))
  ) then
    raise exception 'ticket_category_unavailable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Solo al abrir el ticket: el equipo puede recategorizar después con cualquier categoría existente.
drop trigger if exists support_tickets_category_active on public.support_tickets;
create trigger support_tickets_category_active
  before insert on public.support_tickets
  for each row execute function public.enforce_ticket_category();


-- 6. Leer: la app (todo, activos e inactivos) y el panel (cuántos lo usan) ------------------------------
create or replace function public.public_catalogs()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'amenities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', code, 'label', label, 'label_en', label_en, 'icon', icon, 'is_active', is_active
      ) order by position, created_at)
      from public.parking_amenities), '[]'::jsonb),
    'ticket_categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', code, 'label', label, 'for_client', for_client, 'for_owner', for_owner, 'is_active', is_active
      ) order by position, created_at)
      from public.ticket_categories), '[]'::jsonb)
  );
$$;

revoke all on function public.public_catalogs() from public;
grant execute on function public.public_catalogs() to anon, authenticated;

create or replace function public.admin_catalog_usage()
returns table (catalog text, code text, uses bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query
    select 'amenities'::text, a.code, (select count(*) from public.parking_lots l where a.code = any(l.amenities))
    from public.parking_amenities a
    union all
    select 'ticket_categories'::text, c.code, (select count(*) from public.support_tickets t where t.category = c.code)
    from public.ticket_categories c;
end;
$$;

revoke all on function public.admin_catalog_usage() from public, anon;
grant execute on function public.admin_catalog_usage() to authenticated;


-- 7. Eliminar: solo si nadie lo usa ---------------------------------------------------------------------
create or replace function public.admin_delete_catalog_item(p_catalog text, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uses bigint;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  if p_catalog = 'amenities' then
    select count(*) into v_uses from public.parking_lots where p_code = any(amenities);
    if v_uses > 0 then
      raise exception 'catalog_item_in_use: %', v_uses using errcode = 'P0001';
    end if;
    delete from public.parking_amenities where code = p_code;
  elsif p_catalog = 'ticket_categories' then
    select count(*) into v_uses from public.support_tickets where category = p_code;
    if v_uses > 0 then
      raise exception 'catalog_item_in_use: %', v_uses using errcode = 'P0001';
    end if;
    delete from public.ticket_categories where code = p_code;
  else
    raise exception 'catalog_unknown: %', p_catalog using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.admin_delete_catalog_item(text, text) from public, anon;
grant execute on function public.admin_delete_catalog_item(text, text) to authenticated;
