-- GarageGo — marca de administrador para el backoffice.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: seguro de re-correr.
--
-- El panel de administración (carpeta `admin-panel/`) hace login real contra Supabase Auth y
-- después necesita saber si esa persona puede entrar. No se crea una tabla `admins` aparte: la
-- pertenencia es un atributo de la persona, ya existe una fila por persona en `profiles`, y la
-- policy `profiles_select_all` (0001) permite a cualquier autenticado leer perfiles, así que el
-- panel puede leer su propia bandera sin políticas nuevas.
--
-- ── Por qué el trigger NO es opcional ────────────────────────────────────────────────────
-- `profiles_update_own` (0001_init.sql) es `for update using (auth.uid() = id)` SIN restricción
-- de columnas — y una policy de Postgres no puede restringir columnas, eso se hace con GRANTs.
-- Agregar `is_admin` a la tabla y nada más significa que cualquier usuario, con la anon key que
-- ya viaja en el bundle de la app, puede hacer
--     PATCH /rest/v1/profiles?id=eq.<su-uuid>   {"is_admin": true}
-- y quedar habilitado en el backoffice. El trigger de abajo congela la columna para todo lo que
-- no sea el rol de servicio.
--
-- Se elige un trigger y no GRANTs por columna para no tener que mantener una lista de columnas
-- permitidas cada vez que `profiles` crezca. El UPDATE no falla, simplemente el valor no cambia:
-- así no se rompe la edición normal de perfil (nombre, teléfono, avatar, cambio de rol).
--
-- Para dar de alta al primer admin, desde el SQL Editor (que corre como postgres, no como
-- `authenticated`, así que el trigger lo deja pasar):
--     update public.profiles set is_admin = true
--     where id = (select id from auth.users where email = 'tu-mail@ejemplo.com');

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Índice parcial: las consultas son siempre "quiénes son admin", nunca "quiénes no".
create index if not exists profiles_is_admin_idx
  on public.profiles (id) where is_admin;

-- auth.role() es 'authenticated' o 'anon' para las peticiones que entran por PostgREST con un
-- JWT de usuario, y 'service_role' para las que usan la service key. El SQL Editor y las
-- funciones security definer corren como postgres, donde auth.role() es null → pasan.
create or replace function public.protect_profile_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and auth.role() in ('authenticated', 'anon') then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_is_admin on public.profiles;
create trigger profiles_protect_is_admin
  before update on public.profiles
  for each row execute function public.protect_profile_is_admin();
