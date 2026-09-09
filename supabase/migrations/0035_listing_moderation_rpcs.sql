-- GarageGo — acciones de moderación de publicaciones para el panel de administración.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: solo CREATE OR REPLACE FUNCTION. Re-correr es seguro.
--
-- ── Por qué RPC y no policies de UPDATE ─────────────────────────────────────────────────
-- `parking_lots_update_own` (0001) es `using (owner_id = auth.uid())`. Sumarle `or is_admin()`
-- dejaría al admin editar CUALQUIER columna (nombre, precio, ubicación). Se prefieren dos RPC
-- `security definer` con firma acotada: solo tocan las columnas de moderación, sellan
-- `reviewed_by`/`reviewed_at` en el mismo statement y validan admin adentro, así la anon key
-- del bundle web no alcanza para nada aunque se filtre.

-- 1. Decisión de alta: aprobar / rechazar / pedir cambios ------------------------------
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
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'rejected', 'changes_requested') then
    raise exception 'invalid_decision: %', p_decision using errcode = '22023';
  end if;

  if p_decision <> 'approved' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  update public.parking_lots
    set approval_status  = p_decision,
        rejection_reason = case when p_decision = 'approved' then null else btrim(p_reason) end,
        reviewed_at      = now(),
        reviewed_by      = auth.uid(),
        updated_at       = now()
    where id = p_lot_id
    returning * into v_row;

  if not found then
    raise exception 'lot_not_found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

grant execute on function public.admin_review_parking_lot(uuid, text, text) to authenticated;

-- 2. Palanca operativa sobre una cochera ya aprobada ----------------------------------
--   live            → vuelve a la búsqueda, limpia motivo y fecha
--   paused_by_admin  → fuera de la búsqueda, con motivo, sin fecha de reanudación
--   suspended        → fuera de la búsqueda, con motivo y (opcional) 'suspended_until'
create or replace function public.admin_set_parking_lot_moderation(
  p_lot_id uuid,
  p_state text,
  p_reason text default null,
  p_until timestamptz default null
)
returns public.parking_lots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.parking_lots;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  if p_state not in ('live', 'paused_by_admin', 'suspended') then
    raise exception 'invalid_state: %', p_state using errcode = '22023';
  end if;

  if p_state <> 'live' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  update public.parking_lots
    set moderation_state = p_state,
        pause_reason     = case when p_state = 'live' then null else btrim(p_reason) end,
        suspended_until  = case when p_state = 'suspended' then p_until else null end,
        updated_at       = now()
    where id = p_lot_id
    returning * into v_row;

  if not found then
    raise exception 'lot_not_found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

grant execute on function public.admin_set_parking_lot_moderation(uuid, text, text, timestamptz) to authenticated;
