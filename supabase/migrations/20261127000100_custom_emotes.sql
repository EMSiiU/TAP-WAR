-- Emote personalizado por cuenta (1 archivo WebP reemplazable en bucket privado emotes).
begin;

alter table public.profiles add column if not exists custom_emote_path text;

alter table public.profiles drop constraint if exists profiles_custom_emote_path_own;
alter table public.profiles add constraint profiles_custom_emote_path_own
  check (custom_emote_path is null or (
    split_part(custom_emote_path, '/', 1) = id::text
    and custom_emote_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$'
  ));

grant update (custom_emote_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('emotes', 'emotes', false, 524288, array['image/webp'])
  on conflict (id) do nothing;

create policy tapwar_emotes_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'emotes' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy tapwar_emotes_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'emotes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$'
  );

create policy tapwar_emotes_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'emotes' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
