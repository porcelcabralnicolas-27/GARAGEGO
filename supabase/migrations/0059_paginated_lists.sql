-- GarageGo — listados paginados por cursor y armados en una sola consulta.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE INDEX IF NOT EXISTS + CREATE OR REPLACE, y DROP de la versión anterior de
-- search_parking_lots (cambia su lista de parámetros). Re-correr OK.
--
-- ── Los problemas (auditoría técnica 2026-09-13, hallazgos 3.1, 3.2 y 5.6) ───────────────
--   * 3.1 / 5.6: los listados tenían solo un tope defensivo (200-300 filas, commit del
--     backlog del 2026-09-22), sin paginación: pasado el tope, lo más viejo simplemente no se
--     veía, y cada carga traía hasta el tope completo.
--   * 3.2: las pantallas armaban cada listado en varias idas y vueltas encadenadas: reservas →
--     cocheras → perfiles → vehículos; tickets → reservas → cocheras + mensajes; conversaciones
--     → cocheras → perfiles → último mensaje; reseñas → autores.
--
-- ── Arreglo ──────────────────────────────────────────────────────────────────────────────
-- Una función por listado que devuelve UNA PÁGINA ya armada (con nombres de cochera, cliente,
-- vehículo, último mensaje, etc.), paginada por cursor (keyset): el cliente manda los valores
-- del último renglón recibido y la función sigue desde ahí. A diferencia de OFFSET, no se
-- saltea ni repite filas si entran datos nuevos mientras se pagina, y cuesta lo mismo en la
-- página 1 que en la 50.
--
-- Todas son SECURITY INVOKER (el default): corren con los permisos de quien llama, así que las
-- policies de RLS siguen aplicando igual que en las consultas que reemplazan. Si una cochera
-- está pausada y la policy ya no se la muestra al conductor, el nombre viene NULL y la app usa
-- el mismo texto de respaldo que antes.
--
-- El tamaño de página lo elige la app, entre 1 y 100.

-- Índices para que cada página sea una lectura por índice y no un sort de toda la tabla.
create index if not exists bookings_user_keyset_idx on public.bookings (user_id, date desc, start_time desc, id desc);
create index if not exists bookings_lot_keyset_idx on public.bookings (parking_lot_id, date desc, start_time desc, id desc);
create index if not exists notifications_user_keyset_idx on public.notifications (user_id, created_at desc, id desc);
create index if not exists ratings_lot_keyset_idx on public.ratings (parking_lot_id, created_at desc, id desc);
create index if not exists support_tickets_reporter_keyset_idx on public.support_tickets (reporter_id, last_message_at desc, id desc);
create index if not exists messages_booking_keyset_idx on public.messages (booking_id, created_at desc, id desc);
create index if not exists support_ticket_messages_keyset_idx on public.support_ticket_messages (ticket_id, created_at desc, id desc);


-- 1. Reservas del conductor ---------------------------------------------------------------
-- p_scope: 'active' (pending / confirmed) o 'history' (completed / cancelled, sin las que el
-- usuario borró de su historial). Orden: más recientes primero. `is_rated` evita la consulta
-- aparte de calificaciones que hacía el historial.

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

-- La misma fila para una sola reserva (pantalla de sesión activa, que se abre por id). Antes:
-- reserva → cochera → calificaciones, en tres consultas.
create or replace function public.get_client_booking(p_booking_id uuid)
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
  where b.id = p_booking_id and b.user_id = auth.uid();
$$;

revoke all on function public.get_client_booking(uuid) from public, anon;
grant execute on function public.get_client_booking(uuid) to authenticated;


-- 2. Reservas recibidas por el propietario ------------------------------------------------
-- Mismos scopes. Reemplaza cuatro consultas encadenadas (cocheras → reservas → clientes y
-- vehículos). El nombre del cliente sale de public_profiles, igual que antes.

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
    and (p_cursor_id is null or (b.date, b.start_time, b.id) < (p_cursor_date, p_cursor_start, p_cursor_id))
  order by b.date desc, b.start_time desc, b.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke all on function public.list_owner_bookings(text, integer, date, time, uuid) from public, anon;
grant execute on function public.list_owner_bookings(text, integer, date, time, uuid) to authenticated;


-- 2b. Notificaciones ------------------------------------------------------------------------
-- Las del rol activo más las que no tienen rol (anteriores a la 0030), igual que la app.

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
    and (n.audience is null or n.audience = p_audience)
    and (p_cursor_id is null or (n.created_at, n.id) < (p_cursor_created, p_cursor_id))
  order by n.created_at desc, n.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke all on function public.list_notifications(text, integer, timestamptz, uuid) from public, anon;
grant execute on function public.list_notifications(text, integer, timestamptz, uuid) to authenticated;


-- 3. Reseñas públicas de una cochera --------------------------------------------------------
-- Con el nombre del autor en la misma consulta. Las ocultas por el equipo (0044) no van.

create or replace function public.list_parking_lot_ratings(
  p_parking_lot_id uuid,
  p_limit integer default 10,
  p_cursor_created timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  booking_id uuid,
  user_id uuid,
  parking_lot_id uuid,
  score smallint,
  comment text,
  created_at timestamptz,
  author_name text
)
language sql
stable
set search_path = public
as $$
  select r.id, r.booking_id, r.user_id, r.parking_lot_id, r.score, r.comment, r.created_at,
    nullif(btrim(a.first_name || ' ' || a.last_name), '')
  from public.ratings r
  left join public.public_profiles a on a.id = r.user_id
  where r.parking_lot_id = p_parking_lot_id
    and not r.is_hidden
    and (p_cursor_id is null or (r.created_at, r.id) < (p_cursor_created, p_cursor_id))
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

revoke all on function public.list_parking_lot_ratings(uuid, integer, timestamptz, uuid) from public, anon;
grant execute on function public.list_parking_lot_ratings(uuid, integer, timestamptz, uuid) to authenticated;


-- 4. Nombre del propietario de una cochera -------------------------------------------------
-- Para la ficha pública: así se pide en paralelo con el resto y no después de tener el lote.

create or replace function public.parking_lot_owner_name(p_parking_lot_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select nullif(btrim(o.first_name || ' ' || o.last_name), '')
  from public.parking_lots p
  join public.public_profiles o on o.id = p.owner_id
  where p.id = p_parking_lot_id;
$$;

revoke all on function public.parking_lot_owner_name(uuid) from public, anon;
grant execute on function public.parking_lot_owner_name(uuid) to authenticated;


-- 5. Tickets de soporte del usuario --------------------------------------------------------
-- Con el nombre de la cochera relacionada (directa, o la de la reserva) y el último mensaje.
-- Reemplaza tres consultas encadenadas.

create or replace function public.list_my_tickets(
  p_limit integer default 20,
  p_cursor_last_message_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  code text,
  reporter_id uuid,
  reporter_role text,
  subject text,
  category text,
  status text,
  related_booking_id uuid,
  related_parking_lot_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  context_label text,
  last_message_preview text
)
language sql
stable
set search_path = public
as $$
  select t.id, t.code, t.reporter_id, t.reporter_role, t.subject, t.category, t.status,
    t.related_booking_id, t.related_parking_lot_id, t.created_at, t.updated_at, t.last_message_at,
    coalesce(direct_lot.name, booking_lot.name),
    (
      select m.body from public.support_ticket_messages m
      where m.ticket_id = t.id
      order by m.created_at desc, m.id desc
      limit 1
    )
  from public.support_tickets t
  left join public.parking_lots direct_lot on direct_lot.id = t.related_parking_lot_id
  left join public.bookings b on b.id = t.related_booking_id
  left join public.parking_lots booking_lot on booking_lot.id = b.parking_lot_id
  where t.reporter_id = auth.uid()
    and (p_cursor_id is null or (t.last_message_at, t.id) < (p_cursor_last_message_at, p_cursor_id))
  order by t.last_message_at desc, t.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke all on function public.list_my_tickets(integer, timestamptz, uuid) from public, anon;
grant execute on function public.list_my_tickets(integer, timestamptz, uuid) to authenticated;


-- 6. Conversaciones -------------------------------------------------------------------------
-- Un hilo es un par (cochera, contraparte) y junta todas las reservas de ese par, igual que
-- armaba la app (src/features/messaging/api.ts). p_role: 'client' o 'owner'.
-- Se ocultan los hilos sin mensajes salvo que tengan una reserva activa (la lista es la única
-- entrada al chat). Orden: último mensaje más nuevo primero; los vacíos al final. El cursor usa
-- `sort_at`, que para los hilos vacíos vale -infinity.

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
    where (p_role = 'client' and b.user_id = auth.uid())
       or (p_role = 'owner' and p.owner_id = auth.uid())
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


-- 7. Tickets de soporte del panel ------------------------------------------------------------
-- Antes el panel traía TODOS los tickets, TODOS sus mensajes y el contexto de todos, sin tope,
-- y filtraba en el navegador. Ahora: una página de tickets con los filtros aplicados acá (la
-- búsqueda también mira el texto de los mensajes), y los mensajes se piden solo del ticket
-- que se abre. p_status: 'open', 'resolved' o null (todos).

create index if not exists support_tickets_keyset_idx on public.support_tickets (last_message_at desc, id desc);

create or replace function public.admin_tickets_page(
  p_limit integer default 30,
  p_status text default null,
  p_category text default null,
  p_search text default null,
  p_cursor_last_message_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  code text,
  subject text,
  category text,
  status text,
  reporter_role text,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  reporter_name text,
  context_label text,
  last_message_preview text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_term text := replace(replace(replace(nullif(btrim(p_search), ''), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  select
    t.id, t.code, t.subject, t.category, t.status, t.reporter_role, t.created_at, t.updated_at, t.last_message_at,
    coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Usuario'),
    coalesce(pl_direct.name, pl_via_booking.name),
    (
      select m.body from public.support_ticket_messages m
      where m.ticket_id = t.id
      order by m.created_at desc, m.id desc
      limit 1
    )
  from public.support_tickets t
  left join public.profiles p on p.id = t.reporter_id
  left join public.parking_lots pl_direct on pl_direct.id = t.related_parking_lot_id
  left join public.bookings b on b.id = t.related_booking_id
  left join public.parking_lots pl_via_booking on pl_via_booking.id = b.parking_lot_id
  where (p_status is null or t.status = p_status)
    and (p_category is null or t.category = p_category)
    and (
      v_term is null
      or t.subject ilike '%' || v_term || '%'
      or t.code ilike '%' || v_term || '%'
      or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike '%' || v_term || '%'
      or exists (
        select 1 from public.support_ticket_messages m
        where m.ticket_id = t.id and m.body ilike '%' || v_term || '%'
      )
    )
    and (p_cursor_id is null or (t.last_message_at, t.id) < (p_cursor_last_message_at, p_cursor_id))
  order by t.last_message_at desc, t.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$$;

revoke all on function public.admin_tickets_page(integer, text, text, text, timestamptz, uuid) from public, anon;
grant execute on function public.admin_tickets_page(integer, text, text, text, timestamptz, uuid) to authenticated;


-- 8. Búsqueda de cocheras, paginable ----------------------------------------------------------
-- Mismo filtro que la 0055. Suma p_limit y un cursor (distancia, id) para la lista de
-- resultados; el mapa sigue pidiendo la primera página grande sin cursor. Cambia la lista de
-- parámetros, así que se borra la versión anterior: si convivieran las dos, PostgREST no podría
-- elegir cuál llamar con los mismos parámetros nombrados.

drop function if exists public.search_parking_lots(double precision, double precision, double precision, numeric, numeric);

create or replace function public.search_parking_lots(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 5,
  p_max_price numeric default null,
  p_min_rating numeric default null,
  p_limit integer default 200,
  p_cursor_distance double precision default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  description text,
  address text,
  latitude double precision,
  longitude double precision,
  price_per_hour numeric,
  rating_avg numeric,
  is_active boolean,
  created_at timestamptz,
  distance_km double precision
)
language sql
stable
-- Sin `set search_path`, igual que la 0055: PostGIS vive en el esquema `extensions` de Supabase
-- y con search_path = public las funciones st_* no se encontrarían.
as $$
  select *
  from (
    select
      p.id, p.owner_id, p.name, p.description, p.address, p.latitude, p.longitude,
      p.price_per_hour, p.rating_avg, p.is_active, p.created_at,
      st_distance(p.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0 as distance_km
    from public.parking_lots p
    where p.is_active = true
      and p.approval_status = 'approved'
      and p.moderation_state = 'live'
      and p.archived_at is null
      and p.owner_id is distinct from auth.uid()
      and st_dwithin(
        p.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
        least(coalesce(p_radius_km, 5), 25) * 1000
      )
      and (p_max_price is null or p.price_per_hour <= p_max_price)
      and (p_min_rating is null or p.rating_avg >= p_min_rating)
  ) found
  where p_cursor_id is null or (found.distance_km, found.id) > (p_cursor_distance, p_cursor_id)
  order by found.distance_km asc, found.id asc
  limit least(greatest(coalesce(p_limit, 200), 1), 200);
$$;

revoke all on function public.search_parking_lots(double precision, double precision, double precision, numeric, numeric, integer, double precision, uuid)
  from public, anon;
grant execute on function public.search_parking_lots(double precision, double precision, double precision, numeric, numeric, integer, double precision, uuid)
  to authenticated;
