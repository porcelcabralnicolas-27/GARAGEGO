-- GarageGo — crear un ticket de soporte y su primer mensaje en una sola transacción.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE. Re-correr OK.
--
-- ── El problema (auditoría técnica 2026-09-13, hallazgo 1.9) ─────────────────────────────
-- `createTicket` (src/features/support/api.ts) hacía dos inserts separados desde el cliente:
-- primero `support_tickets`, después `support_ticket_messages` con la descripción. Si el
-- segundo fallaba (conexión cortada, error de validación), quedaba un ticket sin ningún
-- mensaje — huérfano, visible en la lista, pero sin la descripción del reclamo.
--
-- ── Arreglo ────────────────────────────────────────────────────────────────────────────
-- Una función hace las dos escrituras. Si cualquiera falla, Postgres revierte las dos: no hay
-- forma de que quede un ticket sin su primer mensaje. Replica exactamente las reglas de las
-- policies `support_tickets_insert` y `support_ticket_messages_insert` (0041), porque una
-- función `security definer` no pasa por RLS.

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

  -- Mismo vínculo obligatorio que la policy: conductor → una reserva propia,
  -- propietario → una cochera propia. Nunca las dos, nunca ninguna.
  if p_reporter_role = 'client' then
    if p_related_parking_lot_id is not null or p_related_booking_id is null then
      raise exception 'Un ticket de conductor tiene que estar atado a una reserva propia';
    end if;
    if not exists (select 1 from public.bookings b where b.id = p_related_booking_id and b.user_id = v_user_id) then
      raise exception 'Esa reserva no te pertenece';
    end if;
  else
    if p_related_booking_id is not null or p_related_parking_lot_id is null then
      raise exception 'Un ticket de propietario tiene que estar atado a una cochera propia';
    end if;
    if not exists (select 1 from public.parking_lots p where p.id = p_related_parking_lot_id and p.owner_id = v_user_id) then
      raise exception 'Esa cochera no te pertenece';
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
