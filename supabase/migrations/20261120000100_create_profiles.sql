-- Configuración inicial para un proyecto sin public.profiles.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  preferred_skin text not null default 'fox'
    check (preferred_skin in ('fox', 'squirrel', 'mouse', 'rabbit')),
  preferred_weapon text not null default 'rifle'
    check (preferred_weapon in ('pistol', 'revolver', 'smg', 'sniper',
      'launcher', 'rifle', 'plasma', 'shotgun', 'knife', 'axe')),
  crosshair_style text not null default 'outline'
    check (crosshair_style in ('outline', 'plain')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format
    check (username is null or username ~ '^[A-Za-z0-9_]{3,20}$')
);

-- Mantener la escritura elegida; EMSiiU y emsiiu ocupan el mismo username.
-- NULL significa que falta completar el perfil; admite varios usuarios nuevos.
create unique index profiles_username_unique
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

-- El trigger crea perfiles. El navegador solo lee y edita el propio.
revoke all on table public.profiles from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on table public.profiles to authenticated;
grant update (username, preferred_skin, preferred_weapon, crosshair_style)
  on table public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create function public.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

-- No copiar un username de Google/GitHub ni de metadata no validada.
-- Todos los proveedores pasan por la elección de username tras autenticarse.
create function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke all on function public.create_profile_for_auth_user()
  from public, anon, authenticated;
revoke all on function public.touch_profile_updated_at()
  from public, anon, authenticated;

create trigger tapwar_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

-- Cubrir también cuentas creadas antes de aplicar esta migración.
insert into public.profiles (id)
  select id from auth.users
  on conflict (id) do nothing;

commit;
