-- Solo lectura. Despues de aplicar 20261120000200_profile_avatars.sql.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'avatar_path') = 1 as columna_creada,
  exists (select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_avatar_path_own') as restriccion_ruta,
  has_column_privilege('authenticated', 'public.profiles', 'avatar_path', 'UPDATE') as avatar_editable,
  exists (select 1 from storage.buckets
    where id = 'avatars' and public = false and file_size_limit = 2097152
      and allowed_mime_types = array['image/webp']::text[]) as bucket_privado_configurado,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('tapwar_avatars_select_own', 'tapwar_avatars_insert_own',
        'tapwar_avatars_delete_own')) = 3 as tres_politicas,
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) as storage_rls;
