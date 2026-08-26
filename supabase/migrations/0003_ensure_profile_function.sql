-- GarageGo — función de auto-reparación: garantiza profile + wallet para el usuario autenticado
-- Cubre cuentas creadas antes del trigger, o vinculadas por Supabase a un auth.users existente
-- (p. ej. Google OAuth con el mismo correo de una cuenta previa), donde el trigger de alta nunca se disparó.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run

create or replace function public.ensure_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_meta jsonb;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  select raw_user_meta_data into v_meta from auth.users where id = v_user_id;

  insert into public.profiles (id, first_name, last_name, avatar_url)
  values (
    v_user_id,
    coalesce(
      v_meta ->> 'first_name',
      v_meta ->> 'given_name',
      split_part(v_meta ->> 'full_name', ' ', 1),
      split_part(v_meta ->> 'name', ' ', 1),
      ''
    ),
    coalesce(v_meta ->> 'last_name', v_meta ->> 'family_name', ''),
    coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture')
  )
  on conflict (id) do nothing;

  insert into public.wallets (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;
end;
$$;

grant execute on function public.ensure_profile() to authenticated;
