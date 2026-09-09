-- GarageGo — congela las columnas de moderación de `parking_lots` para el cliente.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE + DROP/CREATE TRIGGER. Re-correr es seguro.
--
-- ── El agujero que tapa ─────────────────────────────────────────────────────────────────
-- `parking_lots_update_own` (0001) es `for update using (owner_id = auth.uid())` SIN
-- restricción de columnas — y una policy de Postgres no puede restringir columnas. Con la
-- 0034 eso significa que cualquier propietario, con la anon key que viaja en el bundle, puede
--     PATCH /rest/v1/parking_lots?id=eq.<suyo>   {"approval_status": "approved"}
-- y saltarse la revisión del equipo por completo. Mismo problema que `is_admin` en 0033, misma
-- idea de solución: un trigger que congela esas columnas para el cliente.
--
-- ── Por qué NO es `security definer` y por qué mira `current_user` ─────────────────────
-- El corte que queremos es "¿esto lo hizo un PATCH directo del cliente, o una de las RPC de
-- moderación (0035/0036)?".
--   * `auth.role()` (claim del JWT) da 'authenticated' en los DOS casos: las RPC corren como
--     `security definer` pero con el JWT del admin. No sirve.
--   * `current_user` sí distingue: en un PATCH por PostgREST es 'authenticated'; dentro de una
--     función `security definer` propiedad de postgres pasa a ser 'postgres'. Pero SOLO si
--     ESTE trigger NO es `security definer` — si lo fuera, `current_user` sería siempre
--     'postgres' y el trigger no filtraría nada. Por eso va como `security invoker` (el
--     default). No necesita privilegios: solo lee OLD/NEW.
--
-- ── Lo único que el propietario sí puede hacer ────────────────────────────────────────
-- Reenviar a revisión una publicación 'rejected' o 'changes_requested' (volverla a 'pending').
-- Al hacerlo se limpian el motivo y los datos de la última revisión.

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
     and old.approval_status in ('rejected', 'changes_requested')
     and new.approval_status = 'pending' then
    -- Reenvío a revisión: permitido, y se borra el rastro de la revisión anterior.
    new.rejection_reason := null;
    new.reviewed_at      := null;
  else
    -- Cualquier otra transición de estado se ignora en silencio (igual que 0033).
    new.approval_status  := old.approval_status;
    new.rejection_reason := old.rejection_reason;
    new.reviewed_at      := old.reviewed_at;
  end if;

  return new;
end;
$$;

drop trigger if exists parking_lots_protect_moderation on public.parking_lots;
create trigger parking_lots_protect_moderation
  before update on public.parking_lots
  for each row execute function public.protect_parking_lot_moderation();
