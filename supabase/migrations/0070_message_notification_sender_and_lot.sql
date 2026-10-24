-- GarageGo — la notificación de mensaje nuevo indica quién escribió y de qué estacionamiento.
-- Antes el título era siempre "Nuevo mensaje"; ahora es "<Nombre Apellido>", el estacionamiento
-- va en `subtitle` y la descripción sigue siendo la vista previa del mensaje.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS y CREATE OR REPLACE. Re-correr OK. Solo afecta a las
-- notificaciones nuevas.
--
-- Cambio de formato (ajuste sobre la primera versión de esta migración): el título es solo el
-- nombre de quien escribió, y el estacionamiento va aparte en `subtitle`, que la app muestra
-- debajo del título en letra más chica (como un asunto). Si ya corriste la primera versión,
-- volvé a correr esta.

alter table public.notifications add column if not exists subtitle text;

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_owner_id uuid;
  v_lot_name text;
  v_recipient_id uuid;
  v_sender_name text;
  v_title text;
  v_preview text;
begin
  select b.user_id, p.owner_id, p.name into v_client_id, v_owner_id, v_lot_name
  from public.bookings b
  join public.parking_lots p on p.id = b.parking_lot_id
  where b.id = new.booking_id;

  if v_client_id is null then
    return new;
  end if;

  v_recipient_id := case when new.sender_id = v_client_id then v_owner_id else v_client_id end;
  v_preview := left(new.content, 80);

  select nullif(trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), '')
  into v_sender_name
  from public.profiles pr
  where pr.id = new.sender_id;

  v_title := coalesce(v_sender_name, 'Nuevo mensaje');

  insert into public.notifications (user_id, title, subtitle, description, type, related_booking_id)
  values (v_recipient_id, v_title, nullif(v_lot_name, ''), v_preview, 'new_message', new.booking_id);

  return new;
end;
$$;
