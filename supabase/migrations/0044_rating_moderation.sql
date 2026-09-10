-- GarageGo — moderación de reseñas: el equipo puede ocultar una calificación.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / DROP+CREATE POLICY. Re-correr OK.
--
-- `ratings` no tenía forma de moderarse: policy `ratings_select_all using (true)` (todos ven
-- todo) y sin policy de UPDATE ni DELETE (nadie puede tocarlas desde el cliente).
--
-- Decisión: ocultar = deja de verse en la ficha pública de la cochera, pero **sigue contando
-- para el promedio** (`parking_lots.rating_avg`). El trigger `on_rating_change` (0011) ya
-- promedia sobre todas las filas, así que no se toca.

alter table public.ratings
  add column if not exists is_hidden boolean not null default false,
  add column if not exists hidden_reason text,
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references public.profiles (id);

-- Lectura: el público no ve las ocultas; el autor sigue viendo la suya; el admin ve todo.
drop policy if exists ratings_select_all on public.ratings;
drop policy if exists ratings_select on public.ratings;
create policy ratings_select on public.ratings for select to authenticated
  using (not is_hidden or user_id = auth.uid() or public.is_admin(auth.uid()));

-- Ocultar / restaurar. Solo por RPC: `ratings` no tiene policy de UPDATE, así que el cliente
-- no puede tocar estas columnas ni aunque quiera. `security definer` corre como postgres.
create or replace function public.admin_set_rating_hidden(
  p_rating_id uuid,
  p_hidden boolean,
  p_reason text default null
)
returns public.ratings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ratings;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  if p_hidden and coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  update public.ratings
    set is_hidden     = p_hidden,
        hidden_reason = case when p_hidden then btrim(p_reason) else null end,
        hidden_at     = case when p_hidden then now() else null end,
        hidden_by     = case when p_hidden then auth.uid() else null end
    where id = p_rating_id
    returning * into v_row;

  if not found then
    raise exception 'rating_not_found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

grant execute on function public.admin_set_rating_hidden(uuid, boolean, text) to authenticated;
