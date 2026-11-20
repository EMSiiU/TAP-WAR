-- Ejecutar COMPLETO en SQL Editor como postgres, despues de la migracion.
-- Requiere al menos dos cuentas de prueba con perfiles ya creados.
-- Simula roles e identidades en PostgreSQL; no prueba JWT reales ni la API.
-- No crea usuarios ni conserva cambios: termina con ROLLBACK.
-- Si falla, ejecutar ROLLBACK antes de cualquier otra consulta.
begin;

-- El administrador solo selecciona dos perfiles para preparar la prueba.
do $$
declare
  test_ids uuid[];
begin
  select array_agg(id order by id) into test_ids
  from (select id from public.profiles order by id limit 2) as chosen;

  if coalesce(array_length(test_ids, 1), 0) < 2 then
    raise exception 'Se requieren dos perfiles. Crear solo la segunda cuenta de prueba si falta.';
  end if;

  perform set_config('tapwar.test_user_a', test_ids[1]::text, true);
  perform set_config('tapwar.test_user_b', test_ids[2]::text, true);
end;
$$;

-- Las comprobaciones siguientes NO se ejecutan con permisos administrativos.
set local role authenticated;

do $$
declare
  actor uuid;
  other_user uuid;
  visible_count bigint;
  affected_count bigint;
  column_name text;
  expected_update boolean;
begin
  if current_user <> 'authenticated'
     or not row_security_active('public.profiles'::regclass) then
    raise exception 'La prueba no esta ejecutando RLS como authenticated';
  end if;

  foreach column_name in array array[
    'id', 'username', 'preferred_skin', 'preferred_weapon',
    'crosshair_style', 'created_at', 'updated_at'
  ] loop
    expected_update := column_name in (
      'username', 'preferred_skin', 'preferred_weapon', 'crosshair_style'
    );
    if not has_column_privilege(current_user, 'public.profiles', column_name, 'SELECT')
       or has_column_privilege(current_user, 'public.profiles', column_name, 'UPDATE')
          is distinct from expected_update
       or has_column_privilege(current_user, 'public.profiles', column_name, 'INSERT') then
      raise exception 'Permisos inesperados en columna %', column_name;
    end if;
  end loop;

  if has_table_privilege(current_user, 'public.profiles', 'DELETE')
     or has_table_privilege(current_user, 'public.profiles', 'TRUNCATE')
     or has_function_privilege(current_user, 'public.create_profile_for_auth_user()', 'EXECUTE')
     or has_function_privilege(current_user, 'public.touch_profile_updated_at()', 'EXECUTE') then
    raise exception 'authenticated tiene permisos administrativos inesperados';
  end if;

  foreach actor in array array[
    current_setting('tapwar.test_user_a')::uuid,
    current_setting('tapwar.test_user_b')::uuid
  ] loop
    other_user := case
      when actor = current_setting('tapwar.test_user_a')::uuid
      then current_setting('tapwar.test_user_b')::uuid
      else current_setting('tapwar.test_user_a')::uuid
    end;

    perform set_config('request.jwt.claim.sub', actor::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', actor, 'role', 'authenticated')::text, true);

    if auth.uid() is distinct from actor then
      raise exception 'No se pudo establecer la identidad simulada';
    end if;

    select count(*) into visible_count from public.profiles;
    if visible_count <> 1
       or not exists (select 1 from public.profiles where id = actor)
       or exists (select 1 from public.profiles where id = other_user) then
      raise exception 'RLS no limita la lectura al perfil propio';
    end if;

    update public.profiles
      set preferred_skin = case when preferred_skin = 'fox' then 'mouse' else 'fox' end
      where id = actor;
    get diagnostics affected_count = row_count;
    if affected_count <> 1 then
      raise exception 'El usuario no puede actualizar su propio perfil';
    end if;

    update public.profiles set preferred_skin = 'rabbit' where id = other_user;
    get diagnostics affected_count = row_count;
    if affected_count <> 0 then
      raise exception 'Un usuario pudo actualizar el perfil ajeno';
    end if;
  end loop;

  -- Incluso con rol authenticated, sin identidad no debe verse ningun perfil.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  select count(*) into visible_count from public.profiles;
  if visible_count <> 0 then
    raise exception 'Una identidad ausente pudo consultar perfiles';
  end if;
end;
$$;

set local role anon;

do $$
begin
  if current_user <> 'anon' then
    raise exception 'No se establecio el rol anon';
  end if;

  begin
    perform id from public.profiles limit 1;
    raise exception 'anon pudo ejecutar SELECT sobre profiles';
  exception when insufficient_privilege then
    null; -- Denegacion esperada por falta de permiso SELECT.
  end;
end;
$$;

reset role;
select 'PASS' as resultado,
  'A y B aislados; actualizacion propia permitida; columnas protegidas; anon denegado' as detalle;
rollback;
