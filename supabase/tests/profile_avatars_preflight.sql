-- Solo lectura. Antes de aplicar 20261120000200_profile_avatars.sql.
-- Esperado: profiles_existe=true, columna_avatar=0, bucket_avatars=0,
-- politicas_storage_existentes=0. Si hay objetos/politicas previos, revisar.
select
  to_regclass('public.profiles') is not null as profiles_existe,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'avatar_path') as columna_avatar,
  (select count(*) from storage.buckets where id = 'avatars') as bucket_avatars,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects') as politicas_storage_existentes;
