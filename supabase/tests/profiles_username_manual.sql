-- Ejecutar COMPLETO en SQL Editor como postgres, con dos perfiles existentes.
-- No crea cuentas ni conserva usernames: toda la prueba termina en ROLLBACK.
-- Si ocurre un error inesperado, ejecutar ROLLBACK por separado.
begin;

do $$
declare
  test_ids uuid[];
  short_name text;
  long_name text;
begin
  select array_agg(id order by id) into test_ids
  from (select id from public.profiles order by id limit 2) as chosen;
  if coalesce(array_length(test_ids, 1), 0) < 2 then
    raise exception 'Se requieren los dos perfiles usados en la prueba RLS';
  end if;

  -- Elegir nombres libres antes de cambiar al rol sujeto a RLS.
  loop
    short_name := substr(replace(gen_random_uuid()::text, '-', ''), 1, 3);
    exit when not exists (
      select 1 from public.profiles where lower(username) = lower(short_name)
    );
  end loop;
  loop
    long_name := 'Tw_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 17);
    exit when not exists (
      select 1 from public.profiles where lower(username) = lower(long_name)
    );
  end loop;

  perform set_config('tapwar.test_user_a', test_ids[1]::text, true);
  perform set_config('tapwar.test_user_b', test_ids[2]::text, true);
  perform set_config('tapwar.test_short_username', short_name, true);
  perform set_config('tapwar.test_long_username', long_name, true);
end;
$$;

set local role authenticated;

do $$
declare
  user_a uuid := current_setting('tapwar.test_user_a')::uuid;
  user_b uuid := current_setting('tapwar.test_user_b')::uuid;
  valid_name text;
  invalid_name text;
  constraint_hit text;
  affected_count bigint;
  actor uuid;
begin
  if current_user <> 'authenticated'
     or not row_security_active('public.profiles'::regclass) then
    raise exception 'La prueba no esta ejecutando RLS como authenticated';
  end if;

  perform set_config('request.jwt.claim.sub', user_a::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_a, 'role', 'authenticated')::text, true);

  foreach valid_name in array array[
    current_setting('tapwar.test_short_username'),
    current_setting('tapwar.test_long_username')
  ] loop
    update public.profiles set username = valid_name where id = user_a;
    get diagnostics affected_count = row_count;
    if affected_count <> 1 or not exists (
      select 1 from public.profiles where id = user_a and username = valid_name
    ) then
      raise exception 'No se acepto o no se conservo el username valido';
    end if;
  end loop;

  foreach invalid_name in array array[
    '', 'ab', repeat('a', 21), 'con espacio', ' abc', 'abc ',
    'ábc', 'abc-', 'abc.', 'abc' || chr(10)
  ] loop
    begin
      update public.profiles set username = invalid_name where id = user_a;
      raise exception 'Se acepto un username invalido: %', invalid_name;
    exception when check_violation then
      get stacked diagnostics constraint_hit = constraint_name;
      if constraint_hit <> 'profiles_username_format' then
        raise exception 'Fallo una restriccion inesperada: %', constraint_hit;
      end if;
    end;
  end loop;

  -- B intenta ocupar el nombre de A cambiando solamente mayusculas/minusculas.
  perform set_config('request.jwt.claim.sub', user_b::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  begin
    update public.profiles
      set username = upper(current_setting('tapwar.test_long_username'))
      where id = user_b;
    raise exception 'Se acepto un username duplicado sin distinguir mayusculas';
  exception when unique_violation then
    get stacked diagnostics constraint_hit = constraint_name;
    if constraint_hit <> 'profiles_username_unique' then
      raise exception 'Fallo una restriccion unica inesperada: %', constraint_hit;
    end if;
  end;

  -- Dos cuentas pueden estar pendientes de elegir username al mismo tiempo.
  foreach actor in array array[user_a, user_b] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', actor, 'role', 'authenticated')::text, true);
    update public.profiles set username = null where id = actor;
    get diagnostics affected_count = row_count;
    if affected_count <> 1 or not exists (
      select 1 from public.profiles where id = actor and username is null
    ) then
      raise exception 'No se permitio el perfil incompleto con username NULL';
    end if;
  end loop;
end;
$$;

reset role;
select 'PASS' as resultado,
  'Limites 3 y 20 aceptados; 10 formatos invalidos rechazados; duplicado por mayusculas rechazado; varios NULL permitidos' as detalle;
rollback;
