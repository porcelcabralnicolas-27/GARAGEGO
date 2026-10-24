-- GarageGo — separa las notificaciones por rol (conductor / propietario).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: seguro de re-correr.
--
-- Problema: la tabla `notifications` solo tiene `user_id`. Como una misma persona puede ser
-- conductor y propietario, las dos vistas de notificaciones muestran exactamente lo mismo: al
-- propietario le aparece "Cargo por tiempo excedido" de una reserva que hizo como conductor, y
-- al conductor le aparece "Nueva reserva" de una cochera suya.
--
-- Solución: una columna `audience` que dice de qué lado de la reserva está el destinatario.
--
-- En vez de reescribir las seis funciones que insertan notificaciones (create_booking,
-- start_booking, _finalize_booking, cancel_booking, confirm_booking y el trigger
-- notify_new_message), se completa sola con un trigger BEFORE INSERT: mira la reserva
-- relacionada y compara el destinatario contra el conductor y el propietario. Una función que
-- inserte una notificación nueva en el futuro queda cubierta sin tocarla.
--
-- `audience` null = se muestra en las dos vistas. Es el default seguro para notificaciones sin
-- reserva asociada (las viejas, previas a la 0020) y para cualquier caso que el trigger no
-- pueda clasificar: preferimos mostrar de más que esconder algo importante.

alter table public.notifications
  add column if not exists audience text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notifications_audience_check'
  ) then
    alter table public.notifications
      add constraint notifications_audience_check check (audience in ('client', 'owner'));
  end if;
end $$;

create index if not exists notifications_user_audience_idx
  on public.notifications (user_id, audience);

-- Completa `audience` a partir de la reserva relacionada.
create or replace function public.set_notification_audience()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_owner_id uuid;
begin
  -- Si quien inserta ya lo definió explícitamente, se respeta.
  if new.audience is not null or new.related_booking_id is null then
    return new;
  end if;

  select b.user_id, p.owner_id into v_client_id, v_owner_id
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  where b.id = new.related_booking_id;

  if new.user_id = v_client_id then
    new.audience := 'client';
  elsif new.user_id = v_owner_id then
    new.audience := 'owner';
  end if;
  -- Si no es ninguno de los dos, queda null y se ve en las dos vistas.

  return new;
end;
$$;

drop trigger if exists notifications_set_audience on public.notifications;
create trigger notifications_set_audience
  before insert on public.notifications
  for each row execute function public.set_notification_audience();

-- Backfill de las notificaciones que ya existen, con la misma lógica que el trigger.
update public.notifications n
set audience = case when n.user_id = b.user_id then 'client' else 'owner' end
from public.bookings b
join public.parking_lots p on p.id = b.parking_lot_id
where n.related_booking_id = b.id
  and n.audience is null
  and (n.user_id = b.user_id or n.user_id = p.owner_id);
