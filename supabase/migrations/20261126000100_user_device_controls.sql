-- Aplicar despues de 20261120000100_create_profiles.sql.
-- Guarda configuraciones de controles por cuenta y dispositivo (PC, movil o tablet).
begin;

create table if not exists public.user_device_controls (
  account_id uuid not null references public.profiles(id) on delete cascade,
  device_key uuid not null,
  device_type text not null check (device_type in ('desktop', 'mobile', 'tablet')),
  device_label text not null default '' check (char_length(device_label) <= 64),
  pc_controls jsonb check (
    pc_controls is null
    or (jsonb_typeof(pc_controls) = 'object' and pg_column_size(pc_controls) <= 4096)
  ),
  touch_layout jsonb check (
    touch_layout is null
    or (jsonb_typeof(touch_layout) = 'object' and pg_column_size(touch_layout) <= 8192)
  ),
  updated_at timestamptz not null default now(),
  primary key (account_id, device_key)
);

create index if not exists user_device_controls_account_type
  on public.user_device_controls (account_id, device_type, updated_at desc);

alter table public.user_device_controls enable row level security;

revoke all on table public.user_device_controls from public, anon, authenticated;
grant select, insert, update, delete on table public.user_device_controls to authenticated;

drop policy if exists user_device_controls_select_own on public.user_device_controls;
create policy user_device_controls_select_own on public.user_device_controls
  for select to authenticated
  using (
    account_id = (select auth.uid())
    and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false)
  );

drop policy if exists user_device_controls_insert_own on public.user_device_controls;
create policy user_device_controls_insert_own on public.user_device_controls
  for insert to authenticated
  with check (
    account_id = (select auth.uid())
    and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false)
  );

drop policy if exists user_device_controls_update_own on public.user_device_controls;
create policy user_device_controls_update_own on public.user_device_controls
  for update to authenticated
  using (
    account_id = (select auth.uid())
    and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false)
  )
  with check (
    account_id = (select auth.uid())
    and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false)
  );

drop policy if exists user_device_controls_delete_own on public.user_device_controls;
create policy user_device_controls_delete_own on public.user_device_controls
  for delete to authenticated
  using (
    account_id = (select auth.uid())
    and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false)
  );

create or replace function public.touch_device_controls_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_device_controls_touch_updated_at on public.user_device_controls;
create trigger user_device_controls_touch_updated_at
  before insert or update on public.user_device_controls
  for each row execute function public.touch_device_controls_updated_at();

-- Mantiene como maximo 20 dispositivos recientes por cuenta para evitar crecimiento ilimitado.
create or replace function public.prune_old_device_controls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.user_device_controls
  where account_id = new.account_id
    and device_key in (
      select device_key
      from public.user_device_controls
      where account_id = new.account_id
      order by updated_at desc, device_key asc
      offset 20
    );
  return new;
end;
$$;

drop trigger if exists user_device_controls_prune_old on public.user_device_controls;
create trigger user_device_controls_prune_old
  after insert on public.user_device_controls
  for each row execute function public.prune_old_device_controls();

revoke all on function public.touch_device_controls_updated_at() from public, anon, authenticated;
revoke all on function public.prune_old_device_controls() from public, anon, authenticated;

commit;
