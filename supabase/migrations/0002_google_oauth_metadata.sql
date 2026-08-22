-- GarageGo — soporte de metadatos de Google OAuth en el trigger de alta de usuario
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'first_name',
      new.raw_user_meta_data ->> 'given_name',
      split_part(new.raw_user_meta_data ->> 'full_name', ' ', 1),
      split_part(new.raw_user_meta_data ->> 'name', ' ', 1),
      ''
    ),
    coalesce(
      new.raw_user_meta_data ->> 'last_name',
      new.raw_user_meta_data ->> 'family_name',
      ''
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );

  insert into public.wallets (user_id) values (new.id);

  return new;
end;
$$;
