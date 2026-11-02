begin;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'one@example.com', '', '{}', '{"display_name":"Alex"}'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.com', '', '{}', '{}');

select is((select count(*) from public.profiles where id between '00000000-0000-0000-0000-000000000001' and '00000000-0000-0000-0000-000000000006')::integer, 2, 'creates exactly one profile per auth user');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000001'), 'Alex', 'copies display name metadata');

-- Signup metadata must not prevent auth-user creation at the profile boundary.
insert into auth.users (id, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000003', jsonb_build_object('display_name', repeat('A', 80))),
  ('00000000-0000-0000-0000-000000000004', jsonb_build_object('display_name', repeat('B', 81))),
  ('00000000-0000-0000-0000-000000000005', jsonb_build_object('display_name', '   ')),
  ('00000000-0000-0000-0000-000000000006', jsonb_build_object('display_name', repeat('界', 81)));

select is((select char_length(display_name) from public.profiles where id = '00000000-0000-0000-0000-000000000003'), 80, 'accepts the maximum display name');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000004'), repeat('B', 80), 'truncates oversized signup metadata');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000005'), null::text, 'normalises blank metadata');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000006'), repeat('界', 80), 'truncates Unicode names by characters');
select is((select count(*) from public.profiles where id between '00000000-0000-0000-0000-000000000001' and '00000000-0000-0000-0000-000000000006')::integer, 6, 'boundary signups each receive a profile');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is((select count(*) from public.profiles)::integer, 1, 'user reads only their own profile');
select lives_ok($$ update public.profiles set display_name = 'Alex Updated' where id = '00000000-0000-0000-0000-000000000001' $$, 'user updates their own display name');
select is((select display_name from public.profiles), 'Alex Updated', 'own update is persisted');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000002')::integer, 0, 'other profile is hidden');
select lives_ok($$ update public.profiles set display_name = 'Stolen' where id = '00000000-0000-0000-0000-000000000002' $$, 'updating another profile affects no visible row');

reset role;
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000002'), null::text, 'other profile was not updated');

set local role authenticated;
select throws_ok($$ delete from public.profiles where id = '00000000-0000-0000-0000-000000000001' $$, '42501', null, 'client cannot delete profiles');

select * from finish();
rollback;
