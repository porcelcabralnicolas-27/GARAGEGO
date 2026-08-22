-- GarageGo — mensajería por reserva (chat entre cliente y propietario)
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index messages_booking_idx on public.messages (booking_id, created_at);

alter table public.messages enable row level security;

-- Solo el cliente de la reserva o el propietario del estacionamiento pueden ver/escribir el hilo.
create policy messages_select on public.messages for select to authenticated
  using (exists (
    select 1 from public.bookings b
    join public.parking_lots p on p.id = b.parking_lot_id
    where b.id = messages.booking_id and (b.user_id = auth.uid() or p.owner_id = auth.uid())
  ));

create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      join public.parking_lots p on p.id = b.parking_lot_id
      where b.id = messages.booking_id and (b.user_id = auth.uid() or p.owner_id = auth.uid())
    )
  );

-- Habilita las actualizaciones en tiempo real para esta tabla.
alter publication supabase_realtime add table public.messages;
