-- GarageGo — Realtime para la moderación y los tickets del panel de administración.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: cada tabla se agrega a la publicación solo si no está. Re-correr OK.
--
-- ── El problema (auditoría técnica 2026-09-13, hallazgo 3.5) ─────────────────────────────
-- Los contadores de la barra lateral del panel (cocheras pendientes de revisión, tickets
-- abiertos) se refrescaban con polling cada 20 s. El backlog del 2026-09-22 ya lo pausa con la
-- pestaña oculta; faltaba la otra mitad de la recomendación: enterarse por Realtime.
--
-- ── Arreglo ──────────────────────────────────────────────────────────────────────────────
-- Se publican `parking_lots` y `support_tickets` (support_ticket_messages ya estaba desde la
-- 0041). Realtime aplica la RLS de cada suscriptor: el panel recibe todo porque las policies
-- de lectura incluyen a los admins, y un usuario común solo recibiría lo que ya puede leer con
-- un SELECT, así que esto no expone nada nuevo. La app no se suscribe a estas tablas.
-- El panel deja un polling lento (cada 5 min) solo como red por si se corta la conexión.

do $$
declare
  v_table text;
begin
  foreach v_table in array array['parking_lots', 'support_tickets'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;
