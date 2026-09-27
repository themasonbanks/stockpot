begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'one@example.com', '', '{}', '{"display_name":"Alex"}'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.com', '', '{}', '{}');

select is((select count(*) from public.profiles)::integer, 2, 'creates exactly one profile per auth user');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000001'), 'Alex', 'copies display name metadata');

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
