-- GarageGo — sistema de tickets de soporte (usuario ↔ plataforma).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE / DROP+CREATE. Re-correr es seguro.
--
-- Hasta ahora el único canal de la app era `messages`, atado a una reserva y entre conductor y
-- propietario. Esto agrega un canal usuario ↔ soporte: el conductor abre un ticket sobre una
-- reserva suya, el propietario sobre una cochera suya, y el equipo responde desde el panel.
--
-- ── Modelo ──────────────────────────────────────────────────────────────────────────────
--   support_tickets          un reclamo. Siempre atado a una reserva (conductor) o a una
--                            cochera (propietario). Estados: open | resolved.
--   support_ticket_messages  el hilo. author_role: 'user' (quien abrió) | 'admin' (el equipo).
--
-- ── Reglas de negocio (en triggers `security definer`) ─────────────────────────────────
--   - un mensaje del usuario sobre un ticket 'resolved' lo reabre;
--   - cada mensaje bumpea `last_message_at` / `updated_at`;
--   - el equipo respondiendo o resolviendo le genera una notificación al usuario.

-- ── Código legible (TCK-00042) ────────────────────────────────────────────────────────
create sequence if not exists public.support_ticket_code_seq;
grant usage on sequence public.support_ticket_code_seq to authenticated;

-- ── Tablas ────────────────────────────────────────────────────────────────────────────
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('TCK-' || lpad(nextval('public.support_ticket_code_seq')::text, 5, '0')),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reporter_role text not null check (reporter_role in ('client', 'owner')),
  subject text not null check (length(btrim(subject)) between 1 and 140),
  category text not null check (category in ('access', 'payment', 'listing', 'behavior', 'other')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  related_booking_id uuid references public.bookings (id) on delete set null,
  related_parking_lot_id uuid references public.parking_lots (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index if not exists support_tickets_reporter_idx on public.support_tickets (reporter_id);
create index if not exists support_tickets_status_idx on public.support_tickets (status);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  author_role text not null check (author_role in ('user', 'admin')),
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_messages_ticket_idx
  on public.support_ticket_messages (ticket_id, created_at);

-- ── Notificaciones: puntero al ticket ─────────────────────────────────────────────────
alter table public.notifications
  add column if not exists related_ticket_id uuid references public.support_tickets (id) on delete cascade;

-- ── RLS ───────────────────────────────────────────────────────────────────────────────
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

-- Tickets: el que lo abrió lo ve; el equipo ve todos y puede cambiar estado/categoría.
drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists support_tickets_insert on public.support_tickets;
create policy support_tickets_insert on public.support_tickets for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'open'
    -- Un ticket queda vinculado a UNA cosa, según el rol de quien lo abre, y tiene que ser suya:
    --   conductor  → una reserva propia   (related_booking_id)
    --   propietario → una cochera propia   (related_parking_lot_id)
    and (
      (
        reporter_role = 'client'
        and related_parking_lot_id is null
        and related_booking_id is not null
        and exists (select 1 from public.bookings b where b.id = related_booking_id and b.user_id = auth.uid())
      )
      or (
        reporter_role = 'owner'
        and related_booking_id is null
        and related_parking_lot_id is not null
        and exists (select 1 from public.parking_lots p where p.id = related_parking_lot_id and p.owner_id = auth.uid())
      )
    )
  );

drop policy if exists support_tickets_update_admin on public.support_tickets;
create policy support_tickets_update_admin on public.support_tickets for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Mensajes: se ven si podés ver el ticket. Insertás como 'user' si sos el que lo abrió,
-- como 'admin' si sos del equipo — siempre con author_id = vos.
drop policy if exists support_ticket_messages_select on public.support_ticket_messages;
create policy support_ticket_messages_select on public.support_ticket_messages for select to authenticated
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.support_tickets t
      where t.id = support_ticket_messages.ticket_id and t.reporter_id = auth.uid()
    )
  );

drop policy if exists support_ticket_messages_insert on public.support_ticket_messages;
create policy support_ticket_messages_insert on public.support_ticket_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = support_ticket_messages.ticket_id
        and (
          (t.reporter_id = auth.uid() and author_role = 'user')
          or (public.is_admin(auth.uid()) and author_role = 'admin')
        )
    )
  );

-- ── Trigger: bump de updated_at en cualquier UPDATE del ticket ─────────────────────────
create or replace function public.touch_support_ticket()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists support_tickets_touch on public.support_tickets;
create trigger support_tickets_touch
  before update on public.support_tickets
  for each row execute function public.touch_support_ticket();

-- ── Trigger: mensaje nuevo → reabre si hacía falta, bumpea, y notifica ────────────────
create or replace function public.on_support_ticket_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
begin
  update public.support_tickets
    set last_message_at = now(),
        status = case
                   when new.author_role = 'user' and status = 'resolved' then 'open'
                   else status
                 end
    where id = new.ticket_id
    returning * into v_ticket;

  -- El equipo respondió: avisar a quien abrió el ticket.
  if new.author_role = 'admin' then
    insert into public.notifications (user_id, title, description, type, audience, related_ticket_id)
    values (
      v_ticket.reporter_id,
      'Respuesta de soporte',
      left(new.body, 90),
      'support_reply',
      v_ticket.reporter_role,
      v_ticket.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists support_ticket_messages_after_insert on public.support_ticket_messages;
create trigger support_ticket_messages_after_insert
  after insert on public.support_ticket_messages
  for each row execute function public.on_support_ticket_message();

-- ── Trigger: ticket resuelto → notificar a quien lo abrió ─────────────────────────────
create or replace function public.on_support_ticket_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    insert into public.notifications (user_id, title, description, type, audience, related_ticket_id)
    values (
      new.reporter_id,
      'Ticket de soporte resuelto',
      new.subject,
      'support_resolved',
      new.reporter_role,
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists support_tickets_on_resolved on public.support_tickets;
create trigger support_tickets_on_resolved
  after update on public.support_tickets
  for each row execute function public.on_support_ticket_resolved();

-- ── Contexto para el panel de administración ──────────────────────────────────────────
-- El admin no tiene RLS sobre `bookings`, así que no puede resolver el nombre de la cochera
-- de un ticket de conductor (que se vincula por reserva). Esta RPC `security definer` hace el
-- join y devuelve solo lo que el panel necesita para la lista: nombre del que reportó y
-- nombre de la cochera. Los tickets y sus mensajes el admin ya los lee por policy.
create or replace function public.admin_ticket_context()
returns table (ticket_id uuid, reporter_name text, related_lot_name text)
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
  select
    t.id,
    coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Usuario'),
    coalesce(pl_direct.name, pl_via_booking.name)
  from public.support_tickets t
  left join public.profiles p on p.id = t.reporter_id
  left join public.parking_lots pl_direct on pl_direct.id = t.related_parking_lot_id
  left join public.bookings b on b.id = t.related_booking_id
  left join public.parking_lots pl_via_booking on pl_via_booking.id = b.parking_lot_id;
end;
$$;

grant execute on function public.admin_ticket_context() to authenticated;

-- ── Realtime: el hilo se actualiza solo mientras está abierto ─────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_ticket_messages'
  ) then
    alter publication supabase_realtime add table public.support_ticket_messages;
  end if;
end $$;
