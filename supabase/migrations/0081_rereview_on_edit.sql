-- GarageGo — editar una publicación ya aprobada la manda de nuevo a revisión.
-- Requiere 0034/0037/0053/0072 (moderación y su trigger de protección).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE y DROP TRIGGER IF EXISTS. Re-correr es seguro.
--
-- ── Regla (decisión del equipo) ───────────────────────────────────────────────────────────────
-- Cuando el propietario cambia algo de una publicación YA APROBADA, el equipo la revisa de nuevo:
--   SÍ vuelve a revisión:    datos del lugar (nombre, descripción, dirección y ubicación), tarifa y
--                            servicios (precio, capacidad, servicios, tipo) y fotos.
--   NO vuelve a revisión:    disponibilidad (días y horarios) y activar/pausar. El propietario los
--                            cambia cuando quiere, sin verificación posterior.
-- Hasta que el equipo la apruebe de nuevo, la publicación queda `pending`: no aparece en la
-- búsqueda ni se puede reservar (create_booking exige `approved`, 0048). Las reservas que ya
-- tenía no se tocan.
--
-- ── Cómo se hace cumplir ──────────────────────────────────────────────────────────────────────
-- En la base y no en la app, para que no se pueda esquivar con una llamada directa a la API:
--   1. Un trigger sobre `parking_lots` mira las columnas de arriba.
--   2. Un trigger sobre `parking_images` mira altas y bajas de fotos (viven en otra tabla).
-- Solo reaccionan cuando quien cambia es un cliente de la API (el propietario): las RPC del equipo,
-- el servidor y el SQL Editor no disparan nada. `reviewed_at` y `reviewed_by` se conservan: así el
-- panel distingue una edición ya aprobada de un alta nueva.

-- 1. Cambios en la tabla de cocheras -----------------------------------------------------------------
-- Compara sin espacios sobrantes: guardar el formulario sin tocar nada no tiene que dar falsos
-- positivos. Se llama `parking_lots_rereview_on_edit` para ordenarse DESPUÉS de los triggers de
-- protección (los triggers corren por orden alfabético): el de moderación congela `approval_status`
-- para el cliente, y este lo cambia recién cuando aquel ya pasó.
create or replace function public.rereview_on_listing_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
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

drop trigger if exists parking_lots_rereview_on_edit on public.parking_lots;
create trigger parking_lots_rereview_on_edit
  before update on public.parking_lots
  for each row execute function public.rereview_on_listing_edit();


-- 2. Cambios en las fotos ----------------------------------------------------------------------------
-- `security definer` porque tiene que actualizar la cochera por encima de los triggers de protección
-- (que le impiden al cliente cambiar `approval_status`). Solo actúa si quien cambia la foto es el
-- DUEÑO de una cochera aprobada: con `auth.uid()` nulo (servidor, SQL Editor) no hace nada.
create or replace function public.rereview_on_photo_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot uuid := coalesce(new.parking_lot_id, old.parking_lot_id);
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  update public.parking_lots
    set approval_status   = 'pending',
        rejection_reason  = null,
        requested_changes = null,
        changes_snapshot  = null,
        updated_at        = now()
    where id = v_lot
      and owner_id = auth.uid()
      and approval_status = 'approved';

  return coalesce(new, old);
end;
$$;

revoke all on function public.rereview_on_photo_change() from public, anon, authenticated;

drop trigger if exists parking_images_rereview on public.parking_images;
create trigger parking_images_rereview
  after insert or delete on public.parking_images
  for each row execute function public.rereview_on_photo_change();
