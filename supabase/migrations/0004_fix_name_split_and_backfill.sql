-- GarageGo — corrige el split de nombre/apellido de Google y repara perfiles ya creados
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

  select raw_user_meta_data into v_meta from auth.users where id = v_user_id;
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

  v_avatar_url := coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture');

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

-- Mismo fix para altas nuevas (registro con Google que crea auth.users directamente)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name');
begin
  insert into public.profiles (id, first_name, last_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'first_name',
      new.raw_user_meta_data ->> 'given_name',
      nullif(split_part(v_full_name, ' ', 1), ''),
      ''
    ),
    coalesce(
      new.raw_user_meta_data ->> 'last_name',
      new.raw_user_meta_data ->> 'family_name',
      nullif(trim(regexp_replace(v_full_name, '^\S+\s*', '')), ''),
      ''
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );

  insert into public.wallets (user_id) values (new.id);

  return new;
end;
$$;
