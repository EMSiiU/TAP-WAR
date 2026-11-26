-- Prueba manual de aislamiento RLS, restricciones y limite de dispositivos.
-- Ejecutar completo desde SQL Editor como postgres; termina con ROLLBACK.
begin;

do $$
declare
  u1 uuid := '11111111-1111-4111-8111-111111111111';
  u2 uuid := '22222222-2222-4222-8222-222222222222';
  d1 uuid := 'aaaa1111-1111-4111-8111-111111111111';
  d2 uuid := 'bbbb2222-2222-4222-8222-222222222222';
  row_count integer;
  i integer;
begin
  insert into auth.users (id, email) values (u1, 'devctrl1@example.test'), (u2, 'devctrl2@example.test');
  update public.profiles set username = 'DevCtrlOne' where id = u1;
  update public.profiles set username = 'DevCtrlTwo' where id = u2;

  -- anon rechazado
  set local role anon;
  begin
    select count(*) into row_count from public.user_device_controls;
    raise exception 'FAIL: anon pudo leer user_device_controls';
  exception when insufficient_privilege then null;
  end;

  -- Usuario 1 guarda PC y Movil en su cuenta
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u1::text, 'is_anonymous', false)::text, true);

  insert into public.user_device_controls (account_id, device_key, device_type, device_label, pc_controls)
  values (u1, d1, 'desktop', 'Windows · PC', '{"dash":"ShiftLeft"}'::jsonb);

  insert into public.user_device_controls (account_id, device_key, device_type, device_label, touch_layout)
  values (u1, d2, 'mobile', 'Android · Móvil', '{"landscape":{"dash":{"x":0.74,"y":0.8,"scale":1}}}'::jsonb);

  -- No puede insertar para otro usuario
  begin
    insert into public.user_device_controls (account_id, device_key, device_type, device_label)
    values (u2, d1, 'desktop', 'Ajeno');
    raise exception 'FAIL: u1 pudo insertar para u2';
  exception when insufficient_privilege then null;
  end;

  -- device_type invalido rechazado
  begin
    insert into public.user_device_controls (account_id, device_key, device_type, device_label)
    values (u1, gen_random_uuid(), 'console', 'Otro');
    raise exception 'FAIL: device_type invalido permitido';
  exception when check_violation then null;
  end;

  -- Usuario 2 no ve registros de Usuario 1
  perform set_config('request.jwt.claims', json_build_object('sub', u2::text, 'is_anonymous', false)::text, true);
  select count(*) into row_count from public.user_device_controls;
  if row_count <> 0 then
    raise exception 'FAIL: u2 vio % filas de u1', row_count;
  end if;

  -- Poda automatica a 20 dispositivos por cuenta
  perform set_config('request.jwt.claims', json_build_object('sub', u1::text, 'is_anonymous', false)::text, true);
  for i in 1..22 loop
    insert into public.user_device_controls (account_id, device_key, device_type, device_label)
    values (u1, gen_random_uuid(), 'desktop', 'Extra ' || i);
  end loop;
  select count(*) into row_count from public.user_device_controls where account_id = u1;
  if row_count <> 20 then
    raise exception 'FAIL: se esperaban 20 filas tras poda, hay %', row_count;
  end if;

  raise notice 'PASS: user_device_controls RLS, constraints y poda verificados';
end $$;

rollback;
