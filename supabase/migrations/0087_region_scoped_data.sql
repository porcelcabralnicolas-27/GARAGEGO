-- GarageGo — demo regional: cada país ve solo sus reservas, conversaciones y notificaciones.
-- Requiere la 0086 (profiles.region y las cocheras de Nueva York) y la 0084.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, triggers con DROP IF EXISTS y CREATE OR REPLACE (mismas
-- firmas que las funciones que reemplaza). Re-correr OK.
--
-- ── Qué cambia ───────────────────────────────────────────────────────────────────────────
-- Hasta la 0086 la región solo cambiaba la presentación. Ahora además separa los datos: con la
-- región Estados Unidos el usuario ve solo lo de las cocheras de Estados Unidos, y con Argentina
-- solo lo de Argentina. Nada se borra: al volver de región, vuelve a aparecer lo de ese país.
--
--   * parking_lots.region: el país de la cochera. Las de Manhattan (0086) son 'US'; una cochera
--     nueva toma la región del perfil del propietario al publicarla.
--   * bookings.region: el de la cochera, copiado al crear la reserva.
--   * notifications.region: el de la reserva relacionada. Las que no tienen reserva (recargas,
--     soporte, revisión de publicaciones) son de Argentina, donde existen esas funciones.
--
-- Se copia en cada fila (en vez de unir con parking_lots al listar) porque la app cuenta las
-- notificaciones sin leer con consultas directas a la tabla y porque la RLS puede esconder la
-- cochera (pausada por el equipo) aunque la reserva siga siendo del usuario.
--
-- Listados que filtran por la región del perfil (current_user_region()):
--   list_client_bookings, list_owner_bookings, list_conversations y list_notifications.
-- Los detalles por id (get_client_booking, get_owner_booking) no filtran: solo se llega a ellos
-- desde un listado.


-- 1. Región de cada cochera -------------------------------------------------------------

alter table public.parking_lots add column if not exists region text not null default 'AR';
alter table public.parking_lots drop constraint if exists parking_lots_region_check;
alter table public.parking_lots add constraint parking_lots_region_check check (region in ('AR', 'US'));

update public.parking_lots set region = 'US' where id::text like 'dddd0086-%' and region <> 'US';

-- Una cochera nueva es del país en el que está el propietario al publicarla.
create or replace function public.set_parking_lot_region()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.region := coalesce((select region from public.profiles where id = new.owner_id), 'AR');
  return new;
end;
$$;

drop trigger if exists parking_lots_set_region on public.parking_lots;
create trigger parking_lots_set_region
  before insert on public.parking_lots
  for each row execute function public.set_parking_lot_region();


-- 2. Región de cada reserva -------------------------------------------------------------

alter table public.bookings add column if not exists region text not null default 'AR';
alter table public.bookings drop constraint if exists bookings_region_check;
alter table public.bookings add constraint bookings_region_check check (region in ('AR', 'US'));

update public.bookings b set region = p.region
from public.parking_lots p
where p.id = b.parking_lot_id and b.region <> p.region;

create or replace function public.set_booking_region()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.region := coalesce((select region from public.parking_lots where id = new.parking_lot_id), 'AR');
  return new;
end;
$$;

drop trigger if exists bookings_set_region on public.bookings;
create trigger bookings_set_region
  before insert on public.bookings
  for each row execute function public.set_booking_region();

create index if not exists bookings_user_region_idx on public.bookings (user_id, region);


-- 3. Región de cada notificación --------------------------------------------------------

alter table public.notifications add column if not exists region text not null default 'AR';
alter table public.notifications drop constraint if exists notifications_region_check;
alter table public.notifications add constraint notifications_region_check check (region in ('AR', 'US'));

update public.notifications n set region = b.region
from public.bookings b
where b.id = n.related_booking_id and n.region <> b.region;

create or replace function public.set_notification_region()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.related_booking_id is not null then
    new.region := coalesce((select region from public.bookings where id = new.related_booking_id), 'AR');
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_set_region on public.notifications;
create trigger notifications_set_region
  before insert on public.notifications
  for each row execute function public.set_notification_region();

create index if not exists notifications_user_region_idx on public.notifications (user_id, region, read);


-- 4. Región del usuario que llama ---------------------------------------------------------

create or replace function public.current_user_region()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select region from public.profiles where id = auth.uid()), 'AR');
$$;

revoke all on function public.current_user_region() from public, anon;
grant execute on function public.current_user_region() to authenticated;


-- 5. Listados filtrados por región ------------------------------------------------------
-- Iguales a la versión vigente de cada una, más `region = public.current_user_region()`.

-- list_client_bookings (0059)
create or replace function public.list_client_bookings(
  p_scope text,
  p_limit integer default 20,
  p_cursor_date date default null,
  p_cursor_start time default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  user_id uuid,
  parking_lot_id uuid,
  vehicle_id uuid,
  date date,
  start_time time,
  end_time time,
  status text,
  total_price numeric,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  overtime_minutes integer,
  overtime_charge numeric,
  created_at timestamptz,
  parking_lot_name text,
  parking_lot_address text,
  is_rated boolean
)
language sql
stable
set search_path = public
as $$
  select
    b.id, b.user_id, b.parking_lot_id, b.vehicle_id, b.date, b.start_time, b.end_time, b.status,
    b.total_price, b.actual_start_at, b.actual_end_at, b.overtime_minutes, b.overtime_charge, b.created_at,
    p.name, p.address,
    exists (select 1 from public.ratings r where r.booking_id = b.id and r.user_id = auth.uid())
  from public.bookings b
  left join public.parking_lots p on p.id = b.parking_lot_id
  where b.user_id = auth.uid()
    and b.region = public.current_user_region()
    and case p_scope
      when 'active' then b.status in ('pending', 'confirmed')
      when 'history' then b.status in ('completed', 'cancelled')
        and not exists (
          select 1 from public.hidden_bookings h where h.booking_id = b.id and h.user_id = auth.uid()
        )
      else false
    end
    and (p_cursor_id is null or (b.date, b.start_time, b.id) < (p_cursor_date, p_cursor_start, p_cursor_id))
  order by b.date desc, b.start_time desc, b.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke all on function public.list_client_bookings(text, integer, date, time, uuid) from public, anon;
grant execute on function public.list_client_bookings(text, integer, date, time, uuid) to authenticated;


-- list_owner_bookings (0084)
create or replace function public.list_owner_bookings(
  p_scope text,
  p_limit integer default 20,
  p_cursor_date date default null,
  p_cursor_start time default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  user_id uuid,
  parking_lot_id uuid,
  vehicle_id uuid,
  date date,
  start_time time,
  end_time time,
  status text,
  total_price numeric,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  overtime_minutes integer,
  overtime_charge numeric,
  created_at timestamptz,
  parking_lot_name text,
  client_name text,
  vehicle_plate text,
  vehicle_brand text,
  vehicle_model text
)
language sql
stable
set search_path = public
as $$
  select
    b.id, b.user_id, b.parking_lot_id, b.vehicle_id, b.date, b.start_time, b.end_time, b.status,
    b.total_price, b.actual_start_at, b.actual_end_at, b.overtime_minutes, b.overtime_charge, b.created_at,
    p.name,
    nullif(btrim(c.first_name || ' ' || c.last_name), ''),
    v.plate, v.brand, v.model
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id and p.owner_id = auth.uid()
  left join public.public_profiles c on c.id = b.user_id
  left join public.vehicles v on v.id = b.vehicle_id
  where case p_scope
      when 'active' then b.status in ('pending', 'confirmed')
      when 'history' then b.status in ('completed', 'cancelled')
        and not exists (
          select 1 from public.hidden_bookings h where h.booking_id = b.id and h.user_id = auth.uid()
        )
      else false
    end
    and b.region = public.current_user_region()
    and not (b.payment_method = 'mercadopago' and b.paid_at is null)
    and (p_cursor_id is null or (b.date, b.start_time, b.id) < (p_cursor_date, p_cursor_start, p_cursor_id))
  order by b.date desc, b.start_time desc, b.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke all on function public.list_owner_bookings(text, integer, date, time, uuid) from public, anon;
grant execute on function public.list_owner_bookings(text, integer, date, time, uuid) to authenticated;


-- list_notifications (0059)
create or replace function public.list_notifications(
  p_audience text,
  p_limit integer default 30,
  p_cursor_created timestamptz default null,
  p_cursor_id uuid default null
)
returns setof public.notifications
language sql
stable
set search_path = public
as $$
  select n.*
  from public.notifications n
  where n.user_id = auth.uid()
    and n.region = public.current_user_region()
    and (n.audience is null or n.audience = p_audience)
    and (p_cursor_id is null or (n.created_at, n.id) < (p_cursor_created, p_cursor_id))
  order by n.created_at desc, n.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke all on function public.list_notifications(text, integer, timestamptz, uuid) from public, anon;
grant execute on function public.list_notifications(text, integer, timestamptz, uuid) to authenticated;


-- list_conversations (0080)
create or replace function public.list_conversations(
  p_role text,
  p_limit integer default 20,
  p_cursor_sort_at timestamptz default null,
  p_cursor_lot uuid default null,
  p_cursor_peer uuid default null
)
returns table (
  parking_lot_id uuid,
  peer_id uuid,
  parking_lot_name text,
  other_party_name text,
  booking_ids uuid[],
  has_active_booking boolean,
  last_message text,
  last_message_at timestamptz,
  sort_at timestamptz
)
language sql
stable
set search_path = public
as $$
  with mine as (
    select b.id, b.parking_lot_id, b.status, b.date, b.start_time, p.name as lot_name,
      case when p_role = 'client' then p.owner_id else b.user_id end as peer_id
    from public.bookings b
    join public.parking_lots p on p.id = b.parking_lot_id
    where p.archived_at is null
      and b.region = public.current_user_region()
      and ((p_role = 'client' and b.user_id = auth.uid())
        or (p_role = 'owner' and p.owner_id = auth.uid()))
  ),
  threads as (
    select m.parking_lot_id, m.peer_id, max(m.lot_name) as lot_name,
      array_agg(m.id order by m.date desc, m.start_time desc) as booking_ids,
      bool_or(m.status in ('pending', 'confirmed')) as has_active
    from mine m
    group by m.parking_lot_id, m.peer_id
  ),
  last_messages as (
    select distinct on (t.parking_lot_id, t.peer_id)
      t.parking_lot_id, t.peer_id, msg.content, msg.created_at
    from threads t
    join public.messages msg on msg.booking_id = any (t.booking_ids)
    order by t.parking_lot_id, t.peer_id, msg.created_at desc, msg.id desc
  ),
  page as (
    select t.parking_lot_id, t.peer_id, t.lot_name, t.booking_ids, t.has_active,
      l.content, l.created_at,
      coalesce(l.created_at, '-infinity'::timestamptz) as sort_at
    from threads t
    left join last_messages l on l.parking_lot_id = t.parking_lot_id and l.peer_id = t.peer_id
    where l.created_at is not null or t.has_active
  )
  select pg.parking_lot_id, pg.peer_id, pg.lot_name,
    nullif(btrim(pr.first_name || ' ' || pr.last_name), ''),
    pg.booking_ids, pg.has_active, pg.content, pg.created_at, pg.sort_at
  from page pg
  left join public.public_profiles pr on pr.id = pg.peer_id
  where p_cursor_lot is null
     or (pg.sort_at, pg.parking_lot_id, pg.peer_id) < (p_cursor_sort_at, p_cursor_lot, p_cursor_peer)
  order by pg.sort_at desc, pg.parking_lot_id desc, pg.peer_id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke all on function public.list_conversations(text, integer, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.list_conversations(text, integer, timestamptz, uuid, uuid) to authenticated;
