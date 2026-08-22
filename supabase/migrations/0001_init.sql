-- GarageGo — esquema inicial (Fase 3)
-- Ejecutar completo en Supabase Dashboard > SQL Editor > New query > Run

-- ============ EXTENSIONES ============
create extension if not exists pgcrypto;
create extension if not exists postgis;
create extension if not exists btree_gist;

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  phone text,
  avatar_url text,
  active_role text not null default 'client' check (active_role in ('client', 'owner')),
  is_owner_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============ WALLETS (sistema de saldo) ============
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  balance numeric(12, 2) not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

-- ============ PARKING LOTS ============
create table public.parking_lots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  location geography(point, 4326) generated always as (
    st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
  ) stored,
  price_per_hour numeric(10, 2) not null check (price_per_hour > 0),
  rating_avg numeric(3, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index parking_lots_location_idx on public.parking_lots using gist (location);
create index parking_lots_owner_idx on public.parking_lots (owner_id);

-- ============ PARKING IMAGES ============
create table public.parking_images (
  id uuid primary key default gen_random_uuid(),
  parking_lot_id uuid not null references public.parking_lots (id) on delete cascade,
  storage_path text not null,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index parking_images_lot_idx on public.parking_images (parking_lot_id);

-- ============ DISPONIBILIDAD: franjas recurrentes semanales ============
create table public.parking_availability_recurring (
  id uuid primary key default gen_random_uuid(),
  parking_lot_id uuid not null references public.parking_lots (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

create index parking_availability_recurring_lot_idx on public.parking_availability_recurring (parking_lot_id);

-- ============ DISPONIBILIDAD: excepciones puntuales por fecha ============
create table public.parking_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  parking_lot_id uuid not null references public.parking_lots (id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  is_available boolean not null default true
);

create index parking_availability_exceptions_lot_idx on public.parking_availability_exceptions (parking_lot_id);

-- ============ BOOKINGS (reservas) ============
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  parking_lot_id uuid not null references public.parking_lots (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  total_price numeric(10, 2) not null check (total_price >= 0),
  created_at timestamptz not null default now(),
  time_range tsrange generated always as (
    tsrange(date + start_time, date + end_time)
  ) stored,
  check (end_time > start_time)
);

-- Un estacionamiento tiene capacidad de 1: no puede haber dos reservas activas superpuestas.
alter table public.bookings
  add constraint bookings_no_overlap exclude using gist (
    parking_lot_id with =,
    time_range with &&
  ) where (status in ('pending', 'confirmed'));

create index bookings_user_idx on public.bookings (user_id);
create index bookings_lot_idx on public.bookings (parking_lot_id);

-- ============ WALLET TRANSACTIONS ============
create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  type text not null check (type in ('topup', 'booking_payment', 'refund', 'adjustment')),
  amount numeric(12, 2) not null,
  related_booking_id uuid references public.bookings (id) on delete set null,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
  payment_gateway_ref text,
  created_at timestamptz not null default now()
);

create index wallet_transactions_wallet_idx on public.wallet_transactions (wallet_id);

-- ============ RATINGS (calificaciones) ============
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  parking_lot_id uuid not null references public.parking_lots (id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index ratings_lot_idx on public.ratings (parking_lot_id);

-- ============ NOTIFICATIONS ============
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  type text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id);

-- ============ TRIGGER: crear profile + wallet al registrarse ============
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  );

  insert into public.wallets (user_id) values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.parking_lots enable row level security;
alter table public.parking_images enable row level security;
alter table public.parking_availability_recurring enable row level security;
alter table public.parking_availability_exceptions enable row level security;
alter table public.bookings enable row level security;
alter table public.ratings enable row level security;
alter table public.notifications enable row level security;

-- profiles: lectura pública (nombre/avatar visibles en reservas y calificaciones), edición solo propia
create policy profiles_select_all on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- wallets: solo el dueño puede ver su saldo; escritura reservada a service_role (Edge Functions)
create policy wallets_select_own on public.wallets for select to authenticated
  using (auth.uid() = user_id);

-- wallet_transactions: solo el dueño del wallet puede ver su historial
create policy wallet_transactions_select_own on public.wallet_transactions for select to authenticated
  using (exists (
    select 1 from public.wallets w where w.id = wallet_transactions.wallet_id and w.user_id = auth.uid()
  ));

-- parking_lots: público ve solo activos; el propietario ve y administra los suyos
create policy parking_lots_select_public on public.parking_lots for select to authenticated
  using (is_active = true or owner_id = auth.uid());
create policy parking_lots_insert_own on public.parking_lots for insert to authenticated
  with check (owner_id = auth.uid());
create policy parking_lots_update_own on public.parking_lots for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy parking_lots_delete_own on public.parking_lots for delete to authenticated
  using (owner_id = auth.uid());

-- parking_images: hereda visibilidad/propiedad del estacionamiento padre
create policy parking_images_select on public.parking_images for select to authenticated
  using (exists (
    select 1 from public.parking_lots p
    where p.id = parking_images.parking_lot_id and (p.is_active or p.owner_id = auth.uid())
  ));
create policy parking_images_write on public.parking_images for all to authenticated
  using (exists (
    select 1 from public.parking_lots p where p.id = parking_images.parking_lot_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.parking_lots p where p.id = parking_images.parking_lot_id and p.owner_id = auth.uid()
  ));

-- disponibilidad recurrente: misma regla que las imágenes
create policy parking_availability_recurring_select on public.parking_availability_recurring for select to authenticated
  using (exists (
    select 1 from public.parking_lots p
    where p.id = parking_availability_recurring.parking_lot_id and (p.is_active or p.owner_id = auth.uid())
  ));
create policy parking_availability_recurring_write on public.parking_availability_recurring for all to authenticated
  using (exists (
    select 1 from public.parking_lots p where p.id = parking_availability_recurring.parking_lot_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.parking_lots p where p.id = parking_availability_recurring.parking_lot_id and p.owner_id = auth.uid()
  ));

-- disponibilidad por excepción: misma regla
create policy parking_availability_exceptions_select on public.parking_availability_exceptions for select to authenticated
  using (exists (
    select 1 from public.parking_lots p
    where p.id = parking_availability_exceptions.parking_lot_id and (p.is_active or p.owner_id = auth.uid())
  ));
create policy parking_availability_exceptions_write on public.parking_availability_exceptions for all to authenticated
  using (exists (
    select 1 from public.parking_lots p where p.id = parking_availability_exceptions.parking_lot_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.parking_lots p where p.id = parking_availability_exceptions.parking_lot_id and p.owner_id = auth.uid()
  ));

-- bookings: el cliente ve/gestiona las suyas; el propietario ve/gestiona las de sus estacionamientos
create policy bookings_select on public.bookings for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.parking_lots p where p.id = bookings.parking_lot_id and p.owner_id = auth.uid())
  );
create policy bookings_insert_own on public.bookings for insert to authenticated
  with check (user_id = auth.uid());
create policy bookings_update on public.bookings for update to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.parking_lots p where p.id = bookings.parking_lot_id and p.owner_id = auth.uid())
  );

-- ratings: lectura pública, solo el autor de una reserva finalizada puede calificarla
create policy ratings_select_all on public.ratings for select to authenticated using (true);
create policy ratings_insert_own on public.ratings for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = ratings.booking_id and b.user_id = auth.uid() and b.status = 'completed'
    )
  );

-- notifications: solo el dueño ve y marca como leídas las suyas; el insert lo hacen Edge Functions (service_role)
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
