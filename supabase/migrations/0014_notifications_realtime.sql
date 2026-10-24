-- GarageGo — habilita tiempo real para notificaciones (la tabla y sus policies ya existen desde 0001_init.sql).
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run

alter publication supabase_realtime add table public.notifications;
