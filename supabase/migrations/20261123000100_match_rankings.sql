begin;

-- Immutable results: only the trusted game server can call the write RPC.
create table public.matches (
  id uuid primary key,
  started_at timestamptz not null,
  ended_at timestamptz not null check (ended_at >= started_at),
  reason text not null check (reason in ('time','kills','abandon','interrupted')),
  payload jsonb not null
);
create table public.match_results (
  match_id uuid not null references public.matches(id),
  account_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  kills integer not null check (kills >= 0),
  deaths integer not null check (deaths >= 0),
  outcome text not null check (outcome in ('win','draw','loss')),
  points integer not null check (points in (0,1,3)),
  abandoned boolean not null,
  primary key (match_id, account_id)
);
create index match_results_account on public.match_results(account_id, match_id);
alter table public.matches enable row level security;
alter table public.match_results enable row level security;
revoke all on public.matches, public.match_results from public, anon, authenticated;

create function public.record_match_result(payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare existing jsonb; item jsonb; mid uuid := (payload->>'id')::uuid;
begin
  -- Serialize retries, including concurrent requests for this UUID.
  perform pg_advisory_xact_lock(hashtextextended(mid::text, 0));
  select m.payload into existing from public.matches m where m.id = mid;
  if found then
    if existing <> payload then raise exception 'Conflicting match replay'; end if;
    return;
  end if;
  if jsonb_typeof(payload->'players') is distinct from 'array'
     or jsonb_array_length(payload->'players') not between 2 and 4 then
    raise exception 'Expected 2 to 4 participants';
  end if;
  insert into public.matches values (mid, (payload->>'startedAt')::timestamptz,
    (payload->>'endedAt')::timestamptz, payload->>'reason', payload);
  for item in select value from jsonb_array_elements(payload->'players') loop
    if (item->>'points')::integer is distinct from
      (case when payload->>'reason' = 'interrupted' then 0 when item->>'outcome' = 'win' then 3 when item->>'outcome' = 'draw' then 1 else 0 end)
      or ((item->>'abandoned')::boolean and item->>'outcome' <> 'loss') then
      raise exception 'Invalid points or abandonment';
    end if;
    insert into public.match_results values (mid, (item->>'accountId')::uuid,
      item->>'name', (item->>'kills')::integer, (item->>'deaths')::integer,
      item->>'outcome', (item->>'points')::integer, (item->>'abandoned')::boolean);
  end loop;
end $$;
revoke all on function public.record_match_result(jsonb) from public, anon, authenticated;
grant execute on function public.record_match_result(jsonb) to service_role;

-- Internal projection; no direct client grants and no broad profiles policy.
create view public.ranking_totals as
with totals as (
  select p.id, p.username, p.avatar_path, p.preferred_skin,
    count(r.match_id)::integer as matches,
    coalesce(sum(r.points),0)::integer as points,
    count(*) filter (where r.outcome='win')::integer as wins,
    count(*) filter (where r.outcome='draw')::integer as draws,
    count(*) filter (where r.outcome='loss')::integer as losses,
    count(*) filter (where r.abandoned)::integer as abandonments,
    coalesce(sum(r.kills),0)::integer as kills,
    coalesce(sum(r.deaths),0)::integer as deaths
  from public.profiles p
  left join (public.match_results r join public.matches m on m.id=r.match_id and m.reason <> 'interrupted') on r.account_id=p.id
  where p.username is not null
  group by p.id
)
select *, case when matches > 0 then dense_rank() over (order by (matches>0) desc, points desc) end as position,
  case when matches > 0 then round(100.0*wins/matches,1) end as win_rate,
  case when deaths > 0 then round(1.0*kills/deaths,2) end as kd
from totals;
revoke all on public.ranking_totals from public, anon, authenticated;

create function public.get_rankings(search text default '', page integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare answer jsonb;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Authentication required' using errcode='42501'; end if;
  if page < 0 or page > 100000 or length(search)>20 then raise exception 'Invalid pagination'; end if;
  with ranked as (select r.*, r.id=auth.uid() as is_me from public.ranking_totals r),
  filtered as (select * from ranked where strpos(lower(username), lower(search))>0),
  paged as (select * from filtered order by position nulls last, lower(username) limit 20 offset page*20),
  top_players as (select * from ranked where matches>0 order by position, lower(username) limit 10)
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(to_jsonb(p)-'id' order by position nulls last,lower(username)) from paged p),'[]'::jsonb),
    'total',(select count(*) from filtered),
    'top',coalesce((select jsonb_agg(to_jsonb(t)-'id' order by position,lower(username)) from top_players t),'[]'::jsonb),
    'me',(select to_jsonb(r)-'id' from ranked r where r.id=auth.uid())
  ) into answer;
  return answer;
end $$;

create function public.get_my_statistics(page integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Authentication required' using errcode='42501'; end if;
  if page < 0 or page > 100000 then raise exception 'Invalid pagination'; end if;
  return (
    with history as (
      select r.match_id, m.ended_at, m.reason, r.outcome, r.points, r.kills, r.deaths, r.abandoned
      from public.match_results r join public.matches m on m.id=r.match_id
      where r.account_id=auth.uid() and m.reason <> 'interrupted'
    ), paged as (select * from history order by ended_at desc,match_id limit 20 offset page*20),
    recent as (select * from history order by ended_at desc,match_id limit 10)
    select jsonb_build_object(
      'summary',(select to_jsonb(r)-'id' from public.ranking_totals r where id=auth.uid()),
      'total',(select count(*) from history),
      'history',coalesce((select jsonb_agg(p order by ended_at desc,match_id) from paged p),'[]'::jsonb),
      'recent',coalesce((select jsonb_agg(r order by ended_at,match_id) from recent r),'[]'::jsonb)
    )
  );
end $$;
revoke all on function public.get_rankings(text,integer), public.get_my_statistics(integer) from public, anon;
grant execute on function public.get_rankings(text,integer), public.get_my_statistics(integer) to authenticated;

-- Only current avatars of complete profiles; bucket and mutations stay private.
create function public.is_ranking_avatar(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    and exists(select 1 from public.profiles where username is not null and avatar_path=object_name);
$$;
revoke all on function public.is_ranking_avatar(text) from public, anon;
grant execute on function public.is_ranking_avatar(text) to authenticated;
create policy avatars_ranking_read on storage.objects for select to authenticated
using (bucket_id='avatars' and public.is_ranking_avatar(name));

commit;
