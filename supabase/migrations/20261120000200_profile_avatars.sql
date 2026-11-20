-- Aplicar despues de 20261120000100_create_profiles.sql.
-- Si ya existe un bucket avatars o la columna avatar_path, revisar antes.
begin;

alter table public.profiles add column avatar_path text;

alter table public.profiles add constraint profiles_avatar_path_own
  check (avatar_path is null or (
    split_part(avatar_path, '/', 1) = id::text
    and avatar_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$'
  ));

grant update (avatar_path) on public.profiles to authenticated;

-- La foto se usa en el perfil/lobby propio, no se publica en la arena.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', false, 2097152, array['image/webp']);

-- El cliente convierte JPG/PNG/WebP a WebP y usa un nombre nuevo al reemplazar.
-- No se concede UPDATE: no hace falta sobrescribir objetos existentes.
create policy tapwar_avatars_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy tapwar_avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$'
  );

create policy tapwar_avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
