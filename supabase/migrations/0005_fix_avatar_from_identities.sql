-- GarageGo — lee la foto/nombre desde auth.identities cuando la cuenta se vinculó
-- a un usuario ya existente (el picture de Google no siempre llega a auth.users.raw_user_meta_data
-- en ese caso, pero sí queda en auth.identities.identity_data del proveedor).
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
  v_full_name text;
  v_first_name text;
  v_last_name text;
  v_avatar_url text;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  select coalesce(u.raw_user_meta_data, '{}'::jsonb) || coalesce(i.identity_data, '{}'::jsonb)
  into v_meta
  from auth.users u
  left join auth.identities i on i.user_id = u.id and i.provider in ('google', 'email')
  where u.id = v_user_id
  order by i.provider = 'google' desc
  limit 1;

  v_full_name := coalesce(v_meta ->> 'full_name', v_meta ->> 'name');

  v_first_name := coalesce(
    nullif(v_meta ->> 'first_name', ''),
    nullif(v_meta ->> 'given_name', ''),
    nullif(split_part(v_full_name, ' ', 1), ''),
    ''
  );

  v_last_name := coalesce(
    nullif(v_meta ->> 'last_name', ''),
    nullif(v_meta ->> 'family_name', ''),
    nullif(trim(regexp_replace(v_full_name, '^\S+\s*', '')), ''),
    ''
  );

  v_avatar_url := coalesce(nullif(v_meta ->> 'avatar_url', ''), nullif(v_meta ->> 'picture', ''));

  insert into public.profiles (id, first_name, last_name, avatar_url)
  values (v_user_id, v_first_name, v_last_name, v_avatar_url)
  on conflict (id) do update set
    first_name = case when public.profiles.first_name = '' then excluded.first_name else public.profiles.first_name end,
    last_name = case when public.profiles.last_name = '' then excluded.last_name else public.profiles.last_name end,
    avatar_url = case when public.profiles.avatar_url is null then excluded.avatar_url else public.profiles.avatar_url end;

  insert into public.wallets (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;
end;
$$;
