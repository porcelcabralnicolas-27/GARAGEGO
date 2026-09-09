-- GarageGo — el rechazo de una publicación es definitivo.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE de la función de la 0037. Re-correr es seguro.
--
-- Decisión del equipo: "Rechazar" desde el panel es terminal. El propietario NO puede editar
-- una publicación rechazada para devolverla a la cola. El único camino de vuelta a revisión es
-- que el equipo elija "Pedir cambios" (`changes_requested`), que sí es corregible y reenviable.
--
-- Cambio respecto de la 0037: la transición permitida al cliente pasa de
--   ('rejected', 'changes_requested') -> 'pending'
-- a solo
--   'changes_requested' -> 'pending'
--
-- (La app además ni siquiera abre el editor de una publicación rechazada; esto es la red de
-- seguridad del lado del servidor.)

create or replace function public.protect_parking_lot_moderation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- postgres / service_role / RPCs de moderación (security definer): sin restricción.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Columnas que solo el equipo puede tocar (vía las RPC de moderación): se congelan.
  new.reviewed_by      := old.reviewed_by;
  new.moderation_state := old.moderation_state;
  new.pause_reason     := old.pause_reason;
  new.suspended_until  := old.suspended_until;

  if new.approval_status is distinct from old.approval_status
     and old.approval_status = 'changes_requested'
     and new.approval_status = 'pending' then
    -- Reenvío a revisión tras "Pedir cambios": permitido, y se borra el rastro anterior.
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
