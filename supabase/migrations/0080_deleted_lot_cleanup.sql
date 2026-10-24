-- GarageGo — al eliminar una publicación se cierran sus chats y ya no se pueden hacer reportes sobre ella.
-- Requiere 0053 (archivado), 0059 (list_conversations) y 0076 (soporte general).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: DROP POLICY IF EXISTS y CREATE OR REPLACE. Re-correr es seguro.
--
-- ── Qué pasa cuando se elimina una cochera (`delete_parking_lot`, 0053) ───────────────────────
--   * Sin reservas: se borra de verdad (los chats, atados a reservas, no existen).
--   * Con historial: se ARCHIVA. Lo que se conserva sigue igual: el historial de reservas y los
--     movimientos de billetera (el panel los sigue viendo). Lo que cambia con esta migración:
--       1. se borran los mensajes de los chats de esa cochera y sus avisos de "nuevo mensaje";
--       2. no se puede escribir más en esos chats (la policy de `messages` lo impide) y la
--          conversación deja de listarse;
--       3. no se puede abrir un ticket de soporte sobre esa cochera ni sobre sus reservas.
--   Los tickets que ya existían se conservan: son del equipo de soporte.

-- 1. Las cocheras que YA estaban archivadas se limpian ahora ----------------------------------------
delete from public.notifications n
  where n.type = 'new_message'
    and n.related_booking_id in (
      select b.id from public.bookings b
      join public.parking_lots p on p.id = b.parking_lot_id
      where p.archived_at is not null
    );

delete from public.messages m
  where m.booking_id in (
    select b.id from public.bookings b
    join public.parking_lots p on p.id = b.parking_lot_id
    where p.archived_at is not null
  );


-- 2. delete_parking_lot: al archivar, se cierran los chats ---------------------------------------------
-- Misma función que la 0053; solo se suma el borrado de mensajes y avisos en la rama "archivar".
create or replace function public.delete_parking_lot(p_parking_lot_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  -- Mismo lock que usa _assert_slot_bookable (0048): nadie puede reservar esta cochera
  -- mientras se decide si se borra.
  perform pg_advisory_xact_lock(hashtextextended('garagego.booking:' || p_parking_lot_id::text, 0));

  select owner_id into v_owner_id from public.parking_lots where id = p_parking_lot_id for update;

  if v_owner_id is null then
    raise exception 'Estacionamiento no encontrado';
  end if;
  if auth.uid() is null or v_owner_id <> auth.uid() then
    raise exception 'No autorizado';
  end if;

  if exists (
    select 1 from public.bookings
    where parking_lot_id = p_parking_lot_id and status in ('pending', 'confirmed')
  ) then
    raise exception 'lot_has_active_bookings';
  end if;

  if exists (select 1 from public.bookings where parking_lot_id = p_parking_lot_id) then
    -- Los chats se cierran: se borran los mensajes y sus avisos. El historial de reservas y los
    -- movimientos de billetera NO se tocan.
    delete from public.notifications
      where type = 'new_message'
        and related_booking_id in (select id from public.bookings where parking_lot_id = p_parking_lot_id);
    delete from public.messages
      where booking_id in (select id from public.bookings where parking_lot_id = p_parking_lot_id);

    update public.parking_lots
    set archived_at = now(), is_active = false
    where id = p_parking_lot_id and archived_at is null;
    return 'archived';
  end if;

  delete from public.parking_lots where id = p_parking_lot_id;
  return 'deleted';
end;
$$;

revoke all on function public.delete_parking_lot(uuid) from public, anon;
grant execute on function public.delete_parking_lot(uuid) to authenticated;


-- 3. Chats: no se escribe ni se lee en una cochera archivada -----------------------------------------
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (exists (
    select 1 from public.bookings b
    join public.parking_lots p on p.id = b.parking_lot_id
    where b.id = messages.booking_id
      and p.archived_at is null
      and (b.user_id = auth.uid() or p.owner_id = auth.uid())
  ));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      join public.parking_lots p on p.id = b.parking_lot_id
      where b.id = messages.booking_id
        and p.archived_at is null
        and (b.user_id = auth.uid() or p.owner_id = auth.uid())
    )
  );

-- La conversación deja de aparecer en la lista. Misma función que la 0059; solo se suma
-- `p.archived_at is null` en el CTE `mine`.
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


-- 4. Soporte: no se abre un ticket sobre una cochera eliminada -----------------------------------------
-- Misma policy y misma RPC que la 0076; solo se suma `archived_at is null` en los dos vínculos.
drop policy if exists support_tickets_insert on public.support_tickets;
create policy support_tickets_insert on public.support_tickets for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'open'
    and reporter_role in ('client', 'owner')
    and (
      -- Consulta general: sin vínculo.
      (related_booking_id is null and related_parking_lot_id is null)
      -- Sobre una reserva propia (conductor) de una cochera que sigue publicada.
      or (
        reporter_role = 'client'
        and related_parking_lot_id is null
        and related_booking_id is not null
        and exists (
          select 1 from public.bookings b
          join public.parking_lots p on p.id = b.parking_lot_id
          where b.id = related_booking_id and b.user_id = auth.uid() and p.archived_at is null
        )
      )
      -- Sobre una cochera propia (propietario) que no fue eliminada.
      or (
        reporter_role = 'owner'
        and related_booking_id is null
        and related_parking_lot_id is not null
        and exists (
          select 1 from public.parking_lots p
          where p.id = related_parking_lot_id and p.owner_id = auth.uid() and p.archived_at is null
        )
      )
    )
  );

create or replace function public.create_support_ticket(
  p_reporter_role text,
  p_subject text,
  p_category text,
  p_body text,
  p_related_booking_id uuid,
  p_related_parking_lot_id uuid
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ticket public.support_tickets;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;
  if p_reporter_role not in ('client', 'owner') then
    raise exception 'Rol inválido';
  end if;

  if p_related_booking_id is not null and p_related_parking_lot_id is not null then
    raise exception 'Un ticket no puede estar atado a una reserva y a una cochera a la vez';
  end if;

  if p_related_booking_id is not null then
    if p_reporter_role <> 'client' then
      raise exception 'Solo un conductor puede asociar una reserva';
    end if;
    if not exists (select 1 from public.bookings b where b.id = p_related_booking_id and b.user_id = v_user_id) then
      raise exception 'Esa reserva no te pertenece';
    end if;
    if exists (
      select 1 from public.bookings b
      join public.parking_lots p on p.id = b.parking_lot_id
      where b.id = p_related_booking_id and p.archived_at is not null
    ) then
      raise exception 'Esa publicación fue eliminada y ya no se pueden hacer reportes sobre ella';
    end if;
  end if;

  if p_related_parking_lot_id is not null then
    if p_reporter_role <> 'owner' then
      raise exception 'Solo un propietario puede asociar una cochera';
    end if;
    if not exists (select 1 from public.parking_lots p where p.id = p_related_parking_lot_id and p.owner_id = v_user_id) then
      raise exception 'Esa cochera no te pertenece';
    end if;
    if exists (select 1 from public.parking_lots p where p.id = p_related_parking_lot_id and p.archived_at is not null) then
      raise exception 'Esa publicación fue eliminada y ya no se pueden hacer reportes sobre ella';
    end if;
  end if;

  insert into public.support_tickets (reporter_id, reporter_role, subject, category, related_booking_id, related_parking_lot_id)
  values (v_user_id, p_reporter_role, btrim(p_subject), p_category, p_related_booking_id, p_related_parking_lot_id)
  returning * into v_ticket;

  insert into public.support_ticket_messages (ticket_id, author_id, author_role, body)
  values (v_ticket.id, v_user_id, 'user', btrim(p_body));

  return v_ticket;
end;
$$;

revoke all on function public.create_support_ticket(text, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.create_support_ticket(text, text, text, text, uuid, uuid) to authenticated;
