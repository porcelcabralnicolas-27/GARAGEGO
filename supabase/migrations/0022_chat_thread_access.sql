-- GarageGo — que desactivar un estacionamiento no le borre el chat al cliente.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: DROP + CREATE OR REPLACE / IF NOT EXISTS. Seguro de re-correr.
--
-- El problema: la policy de lectura de `messages` hace join contra `parking_lots`, y esa
-- subconsulta también está sujeta a la RLS de parking_lots, que hasta ahora era
-- "is_active = true or owner_id = auth.uid()". Entonces, apenas el propietario desactivaba la
-- publicación, el cliente dejaba de ver la fila del estacionamiento, el EXISTS daba falso, y
-- perdía TODO el historial del chat sin ningún mensaje de error. Lo mismo pasaba con la lista
-- de sus propias reservas en ese estacionamiento.
--
-- La solución es dejar ver el estacionamiento (no editarlo) a quien tenga reservas ahí.

-- security definer para evitar recursión de RLS: la policy de bookings ya referencia
-- parking_lots, así que un EXISTS directo sobre bookings dentro de la policy de parking_lots
-- daría "infinite recursion detected in policy for relation".
drop function if exists public.has_booking_in_lot(uuid, uuid);
create or replace function public.has_booking_in_lot(p_lot_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bookings b
    where b.parking_lot_id = p_lot_id and b.user_id = p_user_id
  );
$$;

grant execute on function public.has_booking_in_lot(uuid, uuid) to authenticated;

drop policy if exists parking_lots_select_public on public.parking_lots;
create policy parking_lots_select_public on public.parking_lots for select to authenticated
  using (
    is_active = true
    or owner_id = auth.uid()
    or public.has_booking_in_lot(id, auth.uid())
  );

-- El chat ahora marca como leídas las notificaciones de todas las reservas del hilo de una
-- sola vez (related_booking_id IN (...)), así que conviene tener el índice.
create index if not exists notifications_related_booking_idx
  on public.notifications (related_booking_id)
  where type = 'new_message';
