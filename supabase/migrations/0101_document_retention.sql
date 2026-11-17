-- GarageGo — documentos de titularidad: solo cuando hacen falta, y reemplazo sin perder el anterior.
-- Requiere 0078 (documentos y bucket ownership-docs), 0079 (sello de verificación y borrado al
-- decidir) y 0089 (la titularidad se verifica una sola vez).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: DROP IF EXISTS y CREATE OR REPLACE. Re-correr es seguro.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────────────────
--   1. Solo se pueden subir documentos a una cochera propia, no archivada, SIN la titularidad
--      verificada y que todavía no esté aprobada (pendiente, con cambios pedidos o rechazada para
--      corregir). Una aprobada ya está verificada para siempre (0089): no acumula documentos.
--      Vale para la fila (`parking_lot_documents`) y para el archivo (bucket `ownership-docs`). El
--      bucket sigue privado, con el tope de 5 MB y solo JPG, PNG o WEBP (0078).
--   2. `replace_lot_document`: registra el documento nuevo y quita el anterior del mismo requisito
--      en una sola transacción. La app sube primero el archivo nuevo, después llama a esta función
--      y recién si salió bien borra el archivo viejo. Si algo falla, el documento anterior queda
--      como estaba y la app borra el archivo nuevo que había subido.
--
-- ── Retención (sin cambios, para que quede claro) ─────────────────────────────────────────
--   * Pendiente / cambios pedidos: se conservan para revisarlos.
--   * Aprobada o rechazada: el panel borra archivos y filas al decidir y reintenta solo si falló
--     (0079). Al aprobar queda el sello `ownership_verified_at`.
--   * Cuenta eliminada: se borran filas (0100) y archivos (Edge Function delete-account).


-- 1. Cuándo una cochera acepta documentos ----------------------------------------------------------
create or replace function public.lot_accepts_documents(p_lot_id text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.parking_lots l
    -- Se compara como texto: la policy del bucket le pasa una carpeta que puede no ser un uuid.
    where l.id::text = p_lot_id
      and l.owner_id = p_user_id
      and l.archived_at is null
      and l.ownership_verified_at is null
      and l.approval_status in ('pending', 'changes_requested', 'rejected')
  );
$$;

revoke all on function public.lot_accepts_documents(text, uuid) from public, anon;
grant execute on function public.lot_accepts_documents(text, uuid) to authenticated;

-- Fila: además de la carpeta propia (0078), la cochera tiene que aceptar documentos.
drop policy if exists parking_lot_documents_insert on public.parking_lot_documents;
create policy parking_lot_documents_insert on public.parking_lot_documents for insert to authenticated
  with check (
    public.lot_accepts_documents(parking_lot_id::text, auth.uid())
    and storage_path like auth.uid()::text || '/' || parking_lot_id::text || '/%'
  );

-- Archivo: ruta {usuario}/{cochera}/archivo, de una cochera propia que acepta documentos.
drop policy if exists "ownership_docs_owner_insert" on storage.objects;
create policy "ownership_docs_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ownership-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.lot_accepts_documents((storage.foldername(name))[2], auth.uid())
  );

-- El bucket se reafirma privado con sus límites (por si alguien lo cambió a mano).
update storage.buckets
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id = 'ownership-docs';


-- 2. Reemplazo en una sola transacción ---------------------------------------------------------------
-- Registra `p_storage_path` como el documento `p_kind` de la cochera y quita los anteriores del mismo
-- requisito (`p_kind` y `p_replaces_kinds`, por ejemplo escritura o boleta). Devuelve el documento
-- nuevo y las rutas de los archivos viejos, que la app borra después.
create or replace function public.replace_lot_document(
  p_lot_id uuid,
  p_kind text,
  p_storage_path text,
  p_replaces_kinds text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_old_paths text[];
  v_doc public.parking_lot_documents%rowtype;
begin
  if v_user is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not public.lot_accepts_documents(p_lot_id::text, v_user) then
    raise exception 'documents_not_accepted' using errcode = '42501';
  end if;
  if p_storage_path is null or p_storage_path not like v_user::text || '/' || p_lot_id::text || '/%' then
    raise exception 'invalid_document_path' using errcode = '22023';
  end if;

  -- Mismo orden siempre: con la cochera bloqueada, dos reemplazos simultáneos no se pisan.
  perform 1 from public.parking_lots where id = p_lot_id for update;

  with removed as (
    delete from public.parking_lot_documents
    where parking_lot_id = p_lot_id
      and kind = any (array[p_kind] || coalesce(p_replaces_kinds, '{}'))
    returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into v_old_paths from removed;

  -- El check de la tabla (0078) rechaza un tipo de documento que no existe.
  insert into public.parking_lot_documents (parking_lot_id, kind, storage_path)
  values (p_lot_id, p_kind, p_storage_path)
  returning * into v_doc;

  return jsonb_build_object(
    'id', v_doc.id,
    'kind', v_doc.kind,
    'storage_path', v_doc.storage_path,
    'removed_paths', to_jsonb(array_remove(v_old_paths, p_storage_path))
  );
end;
$$;

revoke all on function public.replace_lot_document(uuid, text, text, text[]) from public, anon;
grant execute on function public.replace_lot_document(uuid, text, text, text[]) to authenticated;
