-- GarageGo — bucket de Storage para fotos de estacionamientos (Fase 4)
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run

insert into storage.buckets (id, name, public)
values ('parking-images', 'parking-images', true)
on conflict (id) do nothing;

-- Lectura pública (las fotos de publicaciones activas deben verse sin sesión de por medio)
create policy "parking_images_public_read"
  on storage.objects for select
  using (bucket_id = 'parking-images');

-- Solo el dueño puede subir/editar/borrar, y solo dentro de su propia carpeta: {auth.uid()}/...
create policy "parking_images_owner_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'parking-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "parking_images_owner_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'parking-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "parking_images_owner_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'parking-images' and (storage.foldername(name))[1] = auth.uid()::text);
