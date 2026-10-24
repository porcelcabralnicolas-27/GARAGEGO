-- GarageGo — "Pedir cambios" ahora indica QUÉ hay que cambiar y se valida que el propietario lo
-- haya modificado antes de reenviar la publicación a revisión.
-- Requiere las migraciones 0035/0036 (RPC de revisión), 0037/0038/0053 (trigger de protección).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE y DROP IF EXISTS. Re-correr OK.
--
-- ── Cómo funciona ────────────────────────────────────────────────────────────────────────
-- 1. Al pedir cambios, el panel manda los campos a corregir (`p_fields`: name, description,
--    address, price, capacity, amenities, photos, availability, other). La RPC los guarda en
--    `parking_lots.requested_changes` junto con una "foto" del estado actual de la cochera
--    (`changes_snapshot`, ver `lot_review_snapshot`).
-- 2. Cuando el propietario reenvía (changes_requested -> pending), el trigger compara la cochera
--    de ahora con esa foto. Si algún campo pedido sigue igual, el reenvío falla con
--    `changes_not_made: <campos>` y la publicación queda en "cambios pedidos".
--    · "other" (algo que no entra en la lista) exige al menos un cambio en cualquier campo.
-- 3. Los datos del pedido se conservan mientras la publicación está en revisión, para que el
--    equipo vea qué se había pedido, y se borran al aprobar o rechazar.
--
-- El cliente no puede tocar `requested_changes` ni `changes_snapshot` (el trigger los congela).

alter table public.parking_lots add column if not exists requested_changes text[];
alter table public.parking_lots add column if not exists changes_snapshot jsonb;


-- 1. Foto del estado de una cochera, solo con lo que se puede pedir cambiar -------------------

create or replace function public.lot_review_snapshot(p_lot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
begin
  -- Solo el dueño o un admin (o el servidor, sin sesión): no es un lector libre de cocheras.
  if auth.uid() is not null
     and not public.is_admin(auth.uid())
     and not exists (select 1 from public.parking_lots where id = p_lot_id and owner_id = auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'name', btrim(l.name),
    'description', coalesce(btrim(l.description), ''),
    -- La dirección y el punto en el mapa cuentan como un solo campo.
    'address', jsonb_build_object('address', btrim(l.address), 'lat', l.latitude, 'lng', l.longitude),
    'price', l.price_per_hour,
    'capacity', l.capacity,
    'amenities', (select coalesce(jsonb_agg(a order by a), '[]'::jsonb) from unnest(l.amenities) a),
    -- Por conjunto de archivos: reordenar las fotos no cuenta como cambiarlas.
    'photos', (
      select coalesce(jsonb_agg(i.storage_path order by i.storage_path), '[]'::jsonb)
      from public.parking_images i where i.parking_lot_id = l.id
    ),
    'availability', (
      select coalesce(
        jsonb_agg(r.day_of_week::text || ' ' || r.start_time::text || '-' || r.end_time::text
                  order by r.day_of_week, r.start_time),
        '[]'::jsonb)
      from public.parking_availability_recurring r where r.parking_lot_id = l.id
    )
  )
  into v_snapshot
  from public.parking_lots l
  where l.id = p_lot_id;

  return v_snapshot;
end;
$$;

revoke all on function public.lot_review_snapshot(uuid) from public, anon;
grant execute on function public.lot_review_snapshot(uuid) to authenticated;

-- Campos cuyo valor difiere entre dos fotos.
create or replace function public.lot_changed_fields(p_before jsonb, p_after jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(k order by k), '{}'::text[])
  from jsonb_object_keys(p_after) k
  where p_before -> k is distinct from p_after -> k;
$$;


-- 2. RPC de revisión: guarda los campos pedidos y la foto del estado ----------------------------
-- Cambia la firma (suma `p_fields`), así que se borra la anterior. Los GRANT de la 0052 se
-- repiten para la firma nueva.

drop function if exists public.admin_review_parking_lot(uuid, text, text);

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
  v_allowed constant text[] := array[
    'name', 'description', 'address', 'price', 'capacity', 'amenities', 'photos', 'availability', 'other'
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

  if p_decision = 'changes_requested' then
    -- Sin campos marcados se interpreta "otro": alcanza con que cambie algo.
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
        changes_snapshot  = case when p_decision = 'changes_requested' then public.lot_review_snapshot(p_lot_id) else null end
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


-- 3. Trigger de protección: congela las columnas nuevas y valida el reenvío ---------------------
-- Misma función que la 0053, más: (a) `requested_changes` / `changes_snapshot` no se pueden tocar
-- desde el cliente y (b) el reenvío a revisión exige haber hecho los cambios pedidos.

create or replace function public.protect_parking_lot_moderation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_changed text[];
  v_missing text[];
begin
  -- postgres / service_role / RPCs security definer: sin restricción.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Columnas que solo el equipo puede tocar (vía las RPC de moderación): se congelan.
  new.reviewed_by       := old.reviewed_by;
  new.moderation_state  := old.moderation_state;
  new.pause_reason      := old.pause_reason;
  new.suspended_until   := old.suspended_until;
  new.requested_changes := old.requested_changes;
  new.changes_snapshot  := old.changes_snapshot;

  -- Archivado: solo por delete_parking_lot, y es definitivo.
  new.archived_at := old.archived_at;
  if old.archived_at is not null then
    new.is_active := false;
  end if;

  if new.approval_status is distinct from old.approval_status
     and old.approval_status = 'changes_requested'
     and new.approval_status = 'pending' then

    -- Validación: lo que el equipo pidió tiene que estar modificado respecto de cuando lo pidió.
    if old.requested_changes is not null
       and cardinality(old.requested_changes) > 0
       and old.changes_snapshot is not null then
      v_changed := public.lot_changed_fields(old.changes_snapshot, public.lot_review_snapshot(old.id));

      select coalesce(array_agg(f order by f), '{}'::text[])
      into v_missing
      from unnest(old.requested_changes) f
      where f <> 'other' and not f = any(v_changed);

      if 'other' = any(old.requested_changes) and cardinality(v_changed) = 0 then
        v_missing := array_append(v_missing, 'other');
      end if;

      if cardinality(v_missing) > 0 then
        raise exception 'changes_not_made: %', array_to_string(v_missing, ',') using errcode = 'P0001';
      end if;
    end if;

    -- Reenvío a revisión: permitido, y se borra el rastro anterior. Los campos pedidos y la foto
    -- se conservan hasta que el equipo apruebe o rechace.
    new.rejection_reason := null;
    new.reviewed_at      := null;
  else
    -- Cualquier otra transición de estado se ignora en silencio. En particular,
    -- 'rejected' -> 'pending' NO pasa: el rechazo es definitivo.
    new.approval_status  := old.approval_status;
    new.rejection_reason := old.rejection_reason;
    new.reviewed_at      := old.reviewed_at;
  end if;

  return new;
end;
$$;

-- El trigger de la 0037 ya apunta a esta función; no hace falta recrearlo.
