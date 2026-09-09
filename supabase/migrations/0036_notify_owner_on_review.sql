-- GarageGo — el propietario recibe una notificación cuando el equipo revisa su publicación.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE de la función de la 0035. Re-correr es seguro.
--
-- La RPC `admin_review_parking_lot` (0035) cambiaba `approval_status` y nada más: el propietario
-- no se enteraba de que le pidieron cambios o le rechazaron la cochera. Acá se le suma un
-- insert en `notifications` con el resultado de la revisión.
--
-- Corre como `security definer`, así que el insert no lo frena la RLS (igual que
-- `notify_new_message`, 0019). `audience => 'owner'` explícito: la notificación no tiene
-- `related_booking_id`, así que el trigger `notifications_set_audience` (0030) no puede
-- clasificarla sola y sin esto aparecería también en la vista de conductor.

create or replace function public.admin_review_parking_lot(
  p_lot_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.parking_lots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.parking_lots;
  v_reason text := nullif(btrim(p_reason), '');
  v_title text;
  v_body text;
  v_type text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'rejected', 'changes_requested') then
    raise exception 'invalid_decision: %', p_decision using errcode = '22023';
  end if;

  if p_decision <> 'approved' and v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  update public.parking_lots
    set approval_status  = p_decision,
        rejection_reason = case when p_decision = 'approved' then null else v_reason end,
        reviewed_at      = now(),
        reviewed_by      = auth.uid(),
        updated_at       = now()
    where id = p_lot_id
    returning * into v_row;

  if not found then
    raise exception 'lot_not_found' using errcode = 'P0002';
  end if;

  -- Aviso al propietario.
  if p_decision = 'approved' then
    v_type  := 'listing_approved';
    v_title := 'Tu cochera fue aprobada';
    v_body  := format('«%s» ya está publicada y visible para los conductores.', v_row.name);
  elsif p_decision = 'rejected' then
    v_type  := 'listing_rejected';
    v_title := 'Tu cochera fue rechazada';
    v_body  := format('«%s»: %s', v_row.name, v_reason);
  else
    v_type  := 'listing_changes_requested';
    v_title := 'Tu cochera necesita cambios';
    v_body  := format('«%s»: %s', v_row.name, v_reason);
  end if;

  insert into public.notifications (user_id, title, description, type, audience)
  values (v_row.owner_id, v_title, v_body, v_type, 'owner');

  return v_row;
end;
$$;

grant execute on function public.admin_review_parking_lot(uuid, text, text) to authenticated;
