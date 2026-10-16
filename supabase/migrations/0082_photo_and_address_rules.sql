-- GarageGo — dos reglas más del servidor: toda publicación necesita al menos una foto, y cambiar la
-- dirección de una cochera ya verificada exige volver a acreditar la titularidad.
-- Requiere 0078, 0079 y 0081.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE. Re-correr es seguro.
--
-- ── 1. Al menos una foto ──────────────────────────────────────────────────────────────────────
-- La app ya lo pide al crear, pero eso se esquiva con una llamada directa a la API. Ahora lo hace
-- cumplir el servidor en los dos puntos donde una cochera se vuelve visible:
--   * al ACTIVAR (publicar) una cochera pendiente: error `photo_required`;
--   * al APROBARLA desde el panel: error `photos_missing`. Este es el control que importa: una
--     cochera sin fotos nunca llega a la búsqueda.
-- Las cocheras ya aprobadas no se tocan: la regla corre al activar una pendiente o al aprobar.
--
-- ── 2. Cambiar la dirección exige acreditar la titularidad de nuevo ───────────────────────────
-- Al aprobar una publicación se borran sus documentos y queda un sello (`ownership_verified_at`):
-- "la titularidad de ESTE lugar ya se verificó". Si el propietario cambia la dirección o el punto en
-- el mapa, el sello ya no vale: podría ser otro lugar, que nadie verificó. Entonces el trigger de
-- edición (0081) le quita el sello, y la publicación (que ya vuelve a revisión por el mismo cambio)
-- no se puede aprobar hasta que suba los documentos otra vez. Cambiar solo el nombre, la tarifa o
-- las fotos no toca el sello.
-- Orden de los triggers: `parking_lots_rereview_on_edit` corre después de
-- `parking_lots_protect_verification` (0079), que le devuelve el sello al cliente; por eso este
-- puede quitarlo y que quede quitado.

-- 1a. Activar una cochera pendiente: fotos y documentos --------------------------------------------
create or replace function public.require_ownership_documents()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_missing text[];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.is_active and not old.is_active and new.approval_status = 'pending' then
    if not exists (select 1 from public.parking_images where parking_lot_id = new.id) then
      raise exception 'photo_required' using errcode = 'P0001';
    end if;

    v_missing := public.lot_missing_documents(new.id);
    if cardinality(v_missing) > 0 then
      raise exception 'ownership_docs_required: %', array_to_string(v_missing, ',') using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;


-- 2. Cambiar la dirección quita el sello de titularidad ----------------------------------------------
-- Misma función que la 0081; se suma el bloque del sello.
create or replace function public.rereview_on_listing_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Otra dirección u otro punto en el mapa: lo verificado ya no vale.
  if old.ownership_verified_at is not null
     and (
       btrim(coalesce(new.address, '')) is distinct from btrim(coalesce(old.address, ''))
       or new.latitude is distinct from old.latitude
       or new.longitude is distinct from old.longitude
     ) then
    new.ownership_verified_at := null;
    new.ownership_verified_by := null;
  end if;

  if old.approval_status = 'approved'
     and (
       btrim(coalesce(new.name, '')) is distinct from btrim(coalesce(old.name, ''))
       or btrim(coalesce(new.description, '')) is distinct from btrim(coalesce(old.description, ''))
       or btrim(coalesce(new.address, '')) is distinct from btrim(coalesce(old.address, ''))
       or new.latitude is distinct from old.latitude
       or new.longitude is distinct from old.longitude
       or new.price_per_hour is distinct from old.price_per_hour
       or new.capacity is distinct from old.capacity
       or new.amenities is distinct from old.amenities
       or new.lot_type is distinct from old.lot_type
     ) then
    new.approval_status   := 'pending';
    new.rejection_reason  := null;
    new.requested_changes := null;
    new.changes_snapshot  := null;
  end if;

  return new;
end;
$$;


-- 3. La RPC de revisión no aprueba sin fotos --------------------------------------------------------
-- Misma función que la 0079; solo se suma el control de fotos al aprobar.
create or replace function public.admin_review_parking_lot(
  p_lot_id uuid,
  p_decision text,
  p_reason text default null,
  p_fields text[] default null
)
returns public.parking_lots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.parking_lots;
  v_reason text := nullif(btrim(p_reason), '');
  v_fields text[];
  v_missing text[];
  v_allowed constant text[] := array[
    'name', 'description', 'address', 'price', 'capacity', 'amenities', 'photos', 'availability',
    'documents', 'other'
  ];
  v_labels text;
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

  -- No se aprueba una publicación sin verificar la titularidad.
  if p_decision = 'approved' then
    v_missing := public.lot_missing_documents(p_lot_id);
    if cardinality(v_missing) > 0 then
      raise exception 'ownership_docs_missing: %', array_to_string(v_missing, ',') using errcode = 'P0001';
    end if;

    -- Y tampoco sin fotos: una cochera sin ninguna foto no se publica.
    if not exists (select 1 from public.parking_images where parking_lot_id = p_lot_id) then
      raise exception 'photos_missing' using errcode = 'P0001';
    end if;
  end if;

  if p_decision = 'changes_requested' then
    select coalesce(array_agg(distinct f), array['other'])
    into v_fields
    from unnest(coalesce(p_fields, array['other'])) f;

    if exists (select 1 from unnest(v_fields) f where not f = any(v_allowed)) then
      raise exception 'invalid_fields: %', array_to_string(v_fields, ',') using errcode = '22023';
    end if;
  end if;

  update public.parking_lots
    set approval_status  = p_decision,
        rejection_reason = case when p_decision = 'approved' then null else v_reason end,
        reviewed_at      = now(),
        reviewed_by      = auth.uid(),
        updated_at       = now(),
        requested_changes = case when p_decision = 'changes_requested' then v_fields else null end,
        changes_snapshot  = case when p_decision = 'changes_requested' then public.lot_review_snapshot(p_lot_id) else null end,
        -- Al aprobar queda constancia de quién verificó la titularidad y cuándo (sin los documentos).
        ownership_verified_at = case when p_decision = 'approved' then coalesce(ownership_verified_at, now()) else ownership_verified_at end,
        ownership_verified_by = case when p_decision = 'approved' then coalesce(ownership_verified_by, auth.uid()) else ownership_verified_by end
    where id = p_lot_id
    returning * into v_row;

  if not found then
    raise exception 'lot_not_found' using errcode = 'P0002';
  end if;

  if p_decision = 'approved' then
    v_type  := 'listing_approved';
    v_title := 'Tu cochera fue aprobada';
    v_body  := format('«%s» ya está publicada y visible para los conductores. Borramos los documentos que subiste.', v_row.name);
  elsif p_decision = 'rejected' then
    v_type  := 'listing_rejected';
    v_title := 'Tu cochera fue rechazada';
    v_body  := format('«%s»: %s', v_row.name, v_reason);
  else
    v_type  := 'listing_changes_requested';
    v_title := 'Tu cochera necesita cambios';
    select string_agg(
             case f
               when 'name' then 'Nombre'
               when 'description' then 'Descripción'
               when 'address' then 'Dirección y ubicación'
               when 'price' then 'Tarifa por hora'
               when 'capacity' then 'Capacidad'
               when 'amenities' then 'Servicios'
               when 'photos' then 'Fotos'
               when 'availability' then 'Disponibilidad'
               when 'documents' then 'Documentos de titularidad'
               else 'Otro'
             end, ', ' order by f)
    into v_labels
    from unnest(v_fields) f;
    v_body  := format('«%s» — a modificar: %s. %s', v_row.name, v_labels, v_reason);
  end if;

  insert into public.notifications (user_id, title, description, type, audience)
  values (v_row.owner_id, v_title, v_body, v_type, 'owner');

  return v_row;
end;
$$;

revoke execute on function public.admin_review_parking_lot(uuid, text, text, text[]) from public, anon;
grant execute on function public.admin_review_parking_lot(uuid, text, text, text[]) to authenticated;
