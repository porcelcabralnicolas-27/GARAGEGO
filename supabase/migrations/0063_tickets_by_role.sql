-- GarageGo — tickets de soporte separados por rol.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: DROP de la firma anterior + CREATE OR REPLACE. Re-correr OK.
--
-- list_my_tickets (0059) devolvía todos los tickets del usuario. Alguien que es conductor y
-- propietario veía los mismos tickets mezclados en el centro de ayuda de los dos modos, sin
-- saber desde cuál había abierto cada uno. Cada ticket ya guarda `reporter_role`: ahora la
-- función recibe el rol de la pantalla y devuelve solo los abiertos desde ese modo.
--
-- Mismo cuerpo que la 0059 salvo el parámetro nuevo y su filtro.

drop function if exists public.list_my_tickets(integer, timestamptz, uuid);

create or replace function public.list_my_tickets(
  p_role text,
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
    and t.reporter_role = p_role
    and (p_cursor_id is null or (t.last_message_at, t.id) < (p_cursor_last_message_at, p_cursor_id))
  order by t.last_message_at desc, t.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke all on function public.list_my_tickets(text, integer, timestamptz, uuid) from public, anon;
grant execute on function public.list_my_tickets(text, integer, timestamptz, uuid) to authenticated;
