-- GarageGo — las fotos de vehículos pasan a un bucket privado.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: UPDATE simple y DROP POLICY IF EXISTS. Re-correr OK.
--
-- ── El problema (informe de recomendaciones 2026-10-15, privacidad 1) ──────────────────────
-- `vehicle-images` se creó público (0016), con una policy de lectura para cualquiera. Una foto
-- de un auto suele mostrar la patente: cualquiera que tuviera (o adivinara) la URL podía verla,
-- sin iniciar sesión. Y nadie más que el dueño del vehículo necesita verlas: la tabla
-- `vehicle_images` ya solo deja leer sus filas al dueño (`vehicle_images_select_own`, 0016).
--
-- ── Arreglo ────────────────────────────────────────────────────────────────────────────
--   * El bucket deja de ser público: las URLs públicas viejas dejan de funcionar.
--   * Lectura de los archivos solo para el dueño, por la misma regla de carpeta que ya usan la
--     subida y el borrado: la ruta es {auth.uid()}/{vehicle_id}/archivo.
--   * La app pide URLs firmadas con vencimiento (`createSignedUrls`, src/features/vehicle/api.ts),
--     que solo se emiten si el usuario puede leer el archivo según esta policy.
-- No hay que mover archivos ni cambiar filas: las rutas guardadas siguen siendo las mismas.

update storage.buckets
set public = false
where id = 'vehicle-images';

drop policy if exists "vehicle_images_public_read" on storage.objects;

drop policy if exists "vehicle_images_owner_read" on storage.objects;
create policy "vehicle_images_owner_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'vehicle-images' and (storage.foldername(name))[1] = auth.uid()::text);
