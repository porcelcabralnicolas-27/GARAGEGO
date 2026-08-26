-- GarageGo — notificación automática de "nuevo mensaje" (para el ícono/badge en la tab de
-- Mensajes, sin tener que abrir el chat). Reutiliza la tabla "notifications" que ya tiene
-- lectura en tiempo real habilitada (0014_notifications_realtime.sql).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: seguro de re-correr.

alter table public.notifications add column if not exists related_booking_id uuid references public.bookings (id) on delete cascade;

-- Al insertar un mensaje, se avisa a "la otra parte" de la reserva (el que no lo envió):
-- si lo mandó el cliente, avisa al propietario del estacionamiento, y viceversa.
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_owner_id uuid;
  v_recipient_id uuid;
  v_preview text;
begin
  select b.user_id, p.owner_id into v_client_id, v_owner_id
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  where b.id = new.booking_id;

  if v_client_id is null then
    return new;
  end if;

  v_recipient_id := case when new.sender_id = v_client_id then v_owner_id else v_client_id end;
  v_preview := left(new.content, 80);

  insert into public.notifications (user_id, title, description, type, related_booking_id)
  values (v_recipient_id, 'Nuevo mensaje', v_preview, 'new_message', new.booking_id);

  return new;
end;
$$;

drop trigger if exists messages_notify_new_message on public.messages;
create trigger messages_notify_new_message
  after insert on public.messages
  for each row execute function public.notify_new_message();
