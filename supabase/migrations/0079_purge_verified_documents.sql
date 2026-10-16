-- GarageGo — los documentos de titularidad se borran una vez verificados.
-- Requiere la 0078.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, DROP IF EXISTS y CREATE OR REPLACE. Re-correr es seguro.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────────────────────
-- Un DNI y una escritura son datos personales sensibles: se guardan solo mientras hacen falta para
-- verificar. Cuando el equipo decide (aprueba o rechaza), el panel borra los archivos y sus filas.
-- Con "Pedir cambios" se conservan, porque el propietario tiene que reenviar la publicación.
--
-- Como los documentos ya no están, lo que queda como constancia de que la titularidad se verificó
-- es un sello en la cochera: `ownership_verified_at` y `ownership_verified_by` (quién y cuándo).
-- Lo pone la RPC de revisión al aprobar; el cliente no lo puede tocar.
--
-- ── Por qué el borrado lo hace el panel y no la base ──────────────────────────────────────────
-- Los archivos viven en Storage. Borrar sus filas de `storage.objects` con SQL NO borra el archivo
-- de verdad: hay que usar la API de Storage. Por eso el panel borra los archivos y después las
-- filas, y si algo falla en el medio, la próxima vez que se abre la cola vuelve a intentarlo solo.
-- Para eso el admin necesita permiso de borrado (abajo).

-- 1. Sello de verificación ----------------------------------------------------------------------
alter table public.parking_lots
  add column if not exists ownership_verified_at timestamptz,
  add column if not exists ownership_verified_by uuid references public.profiles (id);

-- Las que ya se aprobaron con documentos subidos (entre la 0078 y esta migración) quedan selladas
-- con la fecha y el revisor de su aprobación.
update public.parking_lots l
  set ownership_verified_at = l.reviewed_at,
      ownership_verified_by = l.reviewed_by
  where l.approval_status = 'approved'
    and l.ownership_verified_at is null
    and exists (select 1 from public.parking_lot_documents d where d.parking_lot_id = l.id);

-- El cliente no puede ponerse el sello. No toca el trigger grande de moderación (0072): es uno
-- aparte, con la misma idea (`current_user` distingue un PATCH directo de una RPC security definer).
create or replace function public.protect_ownership_verification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.ownership_verified_at := old.ownership_verified_at;
    new.ownership_verified_by := old.ownership_verified_by;
  end if;
  return new;
end;
$$;

drop trigger if exists parking_lots_protect_verification on public.parking_lots;
create trigger parking_lots_protect_verification
  before update on public.parking_lots
  for each row execute function public.protect_ownership_verification();

-- Un INSERT directo tampoco puede traerlo ya sellado.
create or replace function public.protect_ownership_verification_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.ownership_verified_at := null;
    new.ownership_verified_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists parking_lots_protect_verification_insert on public.parking_lots;
create trigger parking_lots_protect_verification_insert
  before insert on public.parking_lots
  for each row execute function public.protect_ownership_verification_insert();


-- 2. Una cochera ya verificada no "debe" documentos -----------------------------------------------
-- Misma función que la 0078, más: si ya tiene el sello, no le falta nada (sus documentos se borraron
-- a propósito).
create or replace function public.lot_missing_documents(p_lot_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_verified timestamptz;
  v_kinds text[];
  v_missing text[] := '{}';
begin
  if auth.uid() is not null
     and not public.is_admin(auth.uid())
     and not exists (select 1 from public.parking_lots where id = p_lot_id and owner_id = auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select holder_role, ownership_verified_at into v_role, v_verified
  from public.parking_lots where id = p_lot_id;
  if v_role is null then
    raise exception 'lot_not_found' using errcode = 'P0002';
  end if;

  if v_verified is not null then
    return v_missing;
  end if;

  select coalesce(array_agg(kind), '{}') into v_kinds
  from public.parking_lot_documents where parking_lot_id = p_lot_id;

  if not 'dni' = any(v_kinds) then
    v_missing := array_append(v_missing, 'dni');
  end if;

  if v_role = 'owner' then
    if not (v_kinds && array['ownership_deed', 'tax_bill']) then
      v_missing := array_append(v_missing, 'property_proof');
    end if;
  elsif v_role = 'tenant' then
    if not 'rental_contract' = any(v_kinds) then
      v_missing := array_append(v_missing, 'rental_contract');
    end if;
    if not 'owner_authorization' = any(v_kinds) then
      v_missing := array_append(v_missing, 'owner_authorization');
    end if;
  else
    if not 'owner_authorization' = any(v_kinds) then
      v_missing := array_append(v_missing, 'owner_authorization');
    end if;
  end if;

  return v_missing;
end;
$$;

revoke all on function public.lot_missing_documents(uuid) from public, anon;
grant execute on function public.lot_missing_documents(uuid) to authenticated;


-- 3. La RPC de revisión sella la verificación al aprobar ------------------------------------------
-- Misma firma, mismos grants y mismo cuerpo que la 0078; solo se suma el sello en el UPDATE.
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


-- 4. Permiso de borrado para el equipo --------------------------------------------------------------
-- Solo para limpiar los documentos de una publicación ya decidida: la tabla y el bucket.
drop policy if exists parking_lot_documents_delete_admin on public.parking_lot_documents;
create policy parking_lot_documents_delete_admin on public.parking_lot_documents for delete to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "ownership_docs_admin_delete" on storage.objects;
create policy "ownership_docs_admin_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'ownership-docs' and public.is_admin(auth.uid()));
