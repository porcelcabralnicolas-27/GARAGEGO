-- GarageGo — límite de tamaño y de tipo de archivo en los buckets de fotos.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: UPDATE simple. Re-correr OK.
--
-- ── El problema (auditoría técnica 2026-09-13, hallazgo 2.7) ─────────────────────────────
-- `parking-images` y `vehicle-images` (0006, 0016) se crearon sin `file_size_limit` ni
-- `allowed_mime_types`. Storage los deja en null por default, que Supabase interpreta como
-- "sin tope": se puede subir un archivo de cualquier tamaño y de cualquier tipo (un PDF, un
-- ejecutable, lo que sea) a un bucket que después se sirve como imagen pública.
--
-- ── Arreglo ────────────────────────────────────────────────────────────────────────────
-- 5 MB por archivo (con calidad 0.7 del picker, una foto normal pesa unos cientos de KB; 5 MB
-- da margen sin dejar pasar archivos gigantes) y solo los tres formatos que la app sube
-- (`guessImageContentType`, src/lib/imageMime.ts): jpeg, png y webp.
--
-- Esto es una red del lado del servidor. La app además valida ANTES de subir (más rápido: no
-- gasta el upload para que lo rechacen del otro lado), con el mismo límite.

update storage.buckets
set file_size_limit = 5242880, -- 5 MiB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id in ('parking-images', 'vehicle-images');
