-- Permite registrar partidas de hasta 20 participantes (salas de 4, 10 o 20).
begin;

create or replace function public.record_match_result(payload jsonb) returns void
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
     or jsonb_array_length(payload->'players') not between 2 and 20 then
    raise exception 'Expected 2 to 20 participants';
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

commit;
