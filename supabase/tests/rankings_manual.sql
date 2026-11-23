-- Ejecutar completo como postgres tras las tres migraciones.
-- Crea cuentas sintéticas SOLO dentro de esta transacción y revierte TODO.
-- Simula roles/JWT; no sustituye la prueba por API con dos sesiones reales.
begin;
do $$
declare ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  prefix text := 'qa_'||left(replace(gen_random_uuid()::text,'-',''),10);
  mid uuid := gen_random_uuid(); item uuid; payload jsonb;
begin
  foreach item in array ids loop insert into auth.users(id) values(item); end loop;
  for i in 1..4 loop update public.profiles set username=prefix||i where id=ids[i]; end loop;
  perform set_config('tapwar.qa_ids',array_to_json(ids)::text,true);
  perform set_config('tapwar.qa_prefix',prefix,true);
  perform set_config('tapwar.qa_mid',mid::text,true);
  payload := jsonb_build_object('id',mid,'startedAt',now()-interval '1 minute','endedAt',now(),'reason','kills',
    'players', jsonb_build_array(
      jsonb_build_object('accountId',ids[1],'name',prefix||1,'kills',20,'deaths',1,'outcome','win','points',3,'abandoned',false),
      jsonb_build_object('accountId',ids[2],'name',prefix||2,'kills',1,'deaths',20,'outcome','loss','points',0,'abandoned',false)));
  perform set_config('tapwar.qa_payload',payload::text,true);
end $$;

set local role service_role;
select public.record_match_result(current_setting('tapwar.qa_payload')::jsonb);
select public.record_match_result(current_setting('tapwar.qa_payload')::jsonb);
do $$ begin
  begin
    perform public.record_match_result(current_setting('tapwar.qa_payload')::jsonb || '{"reason":"time"}'::jsonb);
    raise exception 'Conflicting replay was accepted' using errcode='XX000';
  exception when raise_exception then null;
  end;
end $$;
reset role;

do $$
declare ids jsonb := current_setting('tapwar.qa_ids')::jsonb; prefix text := current_setting('tapwar.qa_prefix'); payload jsonb;
begin
  if (select count(*) from public.match_results where match_id=current_setting('tapwar.qa_mid')::uuid)<>2 then raise exception 'Duplicate scoring'; end if;
  payload := jsonb_build_object('id',gen_random_uuid(),'startedAt',now()-interval '2 minutes','endedAt',now(),'reason','time',
    'players',jsonb_build_array(
      jsonb_build_object('accountId',ids->>1,'name',prefix||2,'kills',4,'deaths',2,'outcome','draw','points',1,'abandoned',false),
      jsonb_build_object('accountId',ids->>2,'name',prefix||3,'kills',4,'deaths',2,'outcome','draw','points',1,'abandoned',false)));
  perform public.record_match_result(payload);
  -- A failed insert rolls back both match and participants.
  begin
    perform public.record_match_result(jsonb_set(payload,'{id}',to_jsonb(gen_random_uuid())) || jsonb_build_object('players',jsonb_build_array(payload->'players'->0,payload->'players'->0)));
    raise exception 'Duplicate account accepted' using errcode='XX000';
  exception when unique_violation then null;
  end;
  payload := jsonb_set(payload,'{id}',to_jsonb(gen_random_uuid())) || '{"reason":"interrupted"}'::jsonb;
  payload := jsonb_set(jsonb_set(payload,'{players,0,points}','0'),'{players,1,points}','0');
  perform public.record_match_result(payload);
  update public.profiles set avatar_path=id::text||'/'||gen_random_uuid()::text||'.webp' where id=(ids->>2)::uuid;
  perform set_config('tapwar.qa_photo',(select avatar_path from public.profiles where id=(ids->>2)::uuid),true);
  perform set_config('request.jwt.claim.sub',ids->>0,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ids->>0,'role','authenticated','is_anonymous',false)::text,true);
end $$;

set local role authenticated;
do $$
declare ranking jsonb; stats jsonb; selected jsonb; prefix text := current_setting('tapwar.qa_prefix');
begin
  if has_function_privilege(current_user,'public.record_match_result(jsonb)','EXECUTE') then raise exception 'Client can write results'; end if;
  if has_table_privilege(current_user,'public.match_results','INSERT') or has_table_privilege(current_user,'public.matches','UPDATE')
     or has_table_privilege(current_user,'public.ranking_totals','SELECT') then raise exception 'Unexpected table grants'; end if;
  ranking := public.get_rankings(prefix,0);
  if (ranking->>'total')::integer<>4 then raise exception 'Profile inclusion'; end if;
  if ranking->'me'->>'points'<>'3' or ranking->'me'->>'matches'<>'1' then raise exception 'Invalid totals'; end if;
  if ranking->'me' ? 'id' then raise exception 'Unnecessary identity exposed'; end if;
  selected := public.get_rankings(prefix||3,0)->'rows'->0;
  if selected->>'position' is distinct from public.get_rankings(prefix||2,0)->'rows'->0->>'position' then raise exception 'Tie not shared'; end if;
  if public.get_rankings(prefix||4,0)->'rows'->0->>'position' is not null then raise exception 'Unplayed profile ranked'; end if;
  stats := public.get_my_statistics(0);
  if stats->>'total'<>'1' or jsonb_array_length(stats->'recent')<>1 then raise exception 'Interrupted or foreign history leaked'; end if;
  if not public.is_ranking_avatar(current_setting('tapwar.qa_photo')) or public.is_ranking_avatar('unreferenced.webp') then raise exception 'Avatar access'; end if;
  if (select count(*) from public.profiles)<>1 then raise exception 'Broad profiles read policy'; end if;
  begin
    perform public.get_rankings('',-1);
    raise exception 'Invalid page accepted' using errcode='XX000';
  exception when raise_exception then null; end;
end $$;

-- Anonymous Auth sessions and unauthenticated clients are denied.
select set_config('request.jwt.claims','{"is_anonymous":true}',true);
do $$ begin
  begin perform public.get_rankings(); raise exception 'Anonymous Auth accepted' using errcode='XX000';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  if has_function_privilege(current_user,'public.get_rankings(text,integer)','EXECUTE')
     or has_function_privilege(current_user,'public.get_my_statistics(integer)','EXECUTE')
     or has_function_privilege(current_user,'public.is_ranking_avatar(text)','EXECUTE') then raise exception 'anon has access'; end if;
end $$;
reset role;
select 'PASS' as resultado, '3/1/0, reintentos, atomicidad, empates, historial propio, perfiles y acceso a fotos' as detalle;
rollback;
