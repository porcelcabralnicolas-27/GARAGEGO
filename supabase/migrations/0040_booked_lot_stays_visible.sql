-- GarageGo — el conductor que ya reservó una cochera sigue viéndola aunque el admin la pause.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE + DROP/CREATE POLICY. Re-correr es seguro.
--
-- ── El problema ─────────────────────────────────────────────────────────────────────────
-- Con la 0034, `parking_lots_select_public` solo devuelve una cochera si está `approved` +
-- `live` (o sos el dueño / un admin). Cuando el admin pausa o suspende una cochera, el
-- conductor que YA tiene una reserva ahí deja de poder leer la fila: la pantalla de reservas
-- y la de sesión activa muestran "Estacionamiento" en vez del nombre real
-- (`getClientBooking` cae al fallback que agregó la 0034).
--
-- ── Por qué un helper `security definer` y no un `exists (... bookings ...)` en la policy ──
-- `bookings_select` (0001) ya referencia `parking_lots` en su propio `using`. Si la policy de
-- `parking_lots` referenciara `bookings`, Postgres aborta con "infinite recursion detected in
-- policy". El helper corre como `security definer` (rol postgres), que NO dispara la RLS de
-- `bookings`, así que no hay ciclo.

create or replace function public.user_has_booking_on_lot(p_lot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bookings b
    where b.parking_lot_id = p_lot_id
      and b.user_id = auth.uid()
  );
$$;

grant execute on function public.user_has_booking_on_lot(uuid) to authenticated;

drop policy if exists parking_lots_select_public on public.parking_lots;
create policy parking_lots_select_public on public.parking_lots for select to authenticated
  using (
    (is_active and approval_status = 'approved' and moderation_state = 'live')
    or owner_id = auth.uid()
    or public.is_admin(auth.uid())
    or public.user_has_booking_on_lot(id)
  );
