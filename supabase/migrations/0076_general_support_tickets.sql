-- GarageGo — consultas de soporte generales (sin reserva ni cochera asociada).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE y DROP POLICY IF EXISTS. Re-correr OK. No cambia tickets existentes.
--
-- Hasta acá un ticket tenía que estar atado a algo: el conductor a una reserva propia y el
-- propietario a una cochera propia (0041/0054). Eso dejaba afuera los reportes que no son de una
-- reserva o publicación en particular: un problema con la app, una duda sobre el saldo, una queja
-- sobre otro usuario, etc.
--
-- Ahora un ticket puede quedar SIN vínculo (consulta general). Las demás reglas siguen igual:
--   * nunca las dos cosas a la vez (reserva y cochera);
--   * si trae una reserva, tiene que ser del conductor que la abre;
--   * si trae una cochera, tiene que ser del propietario que la abre.
-- En la base ya existían `related_booking_id` y `related_parking_lot_id` como nullable; lo único que
-- lo impedía eran la policy de inserción y la RPC `create_support_ticket`, que se actualizan acá.
-- El panel de administración no necesita cambios de datos: un ticket general simplemente no trae
-- nombre de cochera.

-- 1. Policy de inserción directa (la app usa la RPC, pero la policy tiene que decir lo mismo).
drop policy if exists support_tickets_insert on public.support_tickets;
create policy support_tickets_insert on public.support_tickets for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'open'
    and reporter_role in ('client', 'owner')
    and (
      -- Consulta general: sin vínculo.
      (related_booking_id is null and related_parking_lot_id is null)
      -- Sobre una reserva propia (conductor).
      or (
        reporter_role = 'client'
        and related_parking_lot_id is null
        and related_booking_id is not null
        and exists (select 1 from public.bookings b where b.id = related_booking_id and b.user_id = auth.uid())
      )
      -- Sobre una cochera propia (propietario).
      or (
        reporter_role = 'owner'
        and related_booking_id is null
        and related_parking_lot_id is not null
        and exists (select 1 from public.parking_lots p where p.id = related_parking_lot_id and p.owner_id = auth.uid())
      )
    )
  );

-- 2. RPC que crea el ticket y su primer mensaje en una sola transacción (misma firma que la 0054).
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

  -- Una reserva y una cochera a la vez no tiene sentido: un ticket se refiere a una sola cosa, o a
  -- ninguna (consulta general).
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
  end if;

  if p_related_parking_lot_id is not null then
    if p_reporter_role <> 'owner' then
      raise exception 'Solo un propietario puede asociar una cochera';
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
