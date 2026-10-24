-- GarageGo — historial de reservas: poder borrar una reserva del historial propio.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: seguro de re-correr.
--
-- El "borrar" del historial NO puede borrar la fila de `bookings`:
--   · La reserva es compartida. Si el conductor la borra, el propietario todavía la necesita
--     en su propio historial (y al revés).
--   · `ratings.booking_id` y `messages.booking_id` tienen ON DELETE CASCADE: borrar la reserva
--     se llevaría puesta la calificación y todo el chat.
--   · `wallet_transactions.related_booking_id` tiene ON DELETE SET NULL: se perdería el rastro
--     de qué movimiento de plata corresponde a qué reserva.
--
-- Entonces es un ocultamiento por usuario: cada uno decide qué ve en SU historial y no afecta
-- lo que ve la otra parte ni ningún registro contable.

create table if not exists public.hidden_bookings (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (booking_id, user_id)
);

create index if not exists hidden_bookings_user_idx on public.hidden_bookings (user_id);

alter table public.hidden_bookings enable row level security;

-- Cada usuario solo ve y maneja sus propios ocultamientos.
drop policy if exists hidden_bookings_select_own on public.hidden_bookings;
create policy hidden_bookings_select_own on public.hidden_bookings for select to authenticated
  using (user_id = auth.uid());

drop policy if exists hidden_bookings_insert_own on public.hidden_bookings;
create policy hidden_bookings_insert_own on public.hidden_bookings for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists hidden_bookings_delete_own on public.hidden_bookings;
create policy hidden_bookings_delete_own on public.hidden_bookings for delete to authenticated
  using (user_id = auth.uid());
