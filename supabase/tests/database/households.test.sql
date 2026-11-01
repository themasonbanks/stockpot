begin;
select no_plan();
select ok(has_table_privilege('service_role', 'public.household_members', 'SELECT'), 'trusted backend can inspect memberships');

insert into auth.users(id, raw_user_meta_data)
select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '{}'
from generate_series(11, 15) n;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}';
select lives_ok($$select public.create_household('10000000-0000-0000-0000-000000000001', ' Kitchen One ')$$, 'creates household and owner atomically');
select lives_ok($$select public.create_household('10000000-0000-0000-0000-000000000001', 'Ignored retry')$$, 'same request ID is safe to retry');
select is((select name from public.households where id = '10000000-0000-0000-0000-000000000001'), 'Kitchen One', 'retry does not overwrite settings');
select is((select count(*) from public.household_members)::integer, 1, 'retry creates no duplicate membership');
select throws_ok($$select public.create_household('10000000-0000-0000-0000-000000000099', 'Duplicate')$$, '23514', 'User already has an active household', 'one household per user');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000013","role":"authenticated"}';
select lives_ok($$select public.create_household('10000000-0000-0000-0000-000000000002', 'Kitchen Two')$$, 'another user creates separate household');
insert into public.household_members(household_id, user_id, role, slot)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 'member', 2);
set constraints all immediate;
set constraints all deferred;

-- Force deferred lifecycle checks within a statement so pgTAP can assert failures.
create function pg_temp.check_lifecycle() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end;
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}';
select is((select count(*) from public.households)::integer, 1, 'owner sees only own household');
select is((select count(*) from public.household_members)::integer, 2, 'owner sees both household members');
select ok(public.is_household_member('10000000-0000-0000-0000-000000000001'), 'membership helper recognises owner');
select ok(not public.is_household_member('10000000-0000-0000-0000-000000000002'), 'helper rejects another household');
select lives_ok($$update public.households set name = 'Owner edit' where id = '10000000-0000-0000-0000-000000000001'$$, 'owner edits shared settings');
select throws_ok($$update public.households set created_by_user_id = '00000000-0000-0000-0000-000000000012'$$, '42501', null, 'cannot change owner identity');
select throws_ok($$insert into public.household_members(household_id,user_id,role,slot) values ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000011','owner',2)$$, '42501', null, 'cannot grant self membership');
select throws_ok($$update public.household_members set role = 'owner'$$, '42501', null, 'cannot escalate membership role');
select throws_ok($$delete from public.households$$, '42501', null, 'client cannot delete household');
select throws_ok($$update public.households set archived_at = now()$$, '42501', null, 'client cannot bypass archival operation');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000012","role":"authenticated"}';
select ok(public.is_household_member('10000000-0000-0000-0000-000000000001'), 'helper recognises member equally');
select is((select count(*) from public.households)::integer, 1, 'member reads shared household');
select lives_ok($$update public.households set name = 'Member edit', default_servings = 1 where id = '10000000-0000-0000-0000-000000000001'$$, 'member edits shared settings');
select is((select name from public.households), 'Member edit', 'member change persists');
select throws_ok($$select public.archive_household('10000000-0000-0000-0000-000000000001')$$, '42501', 'Household owner required', 'member cannot archive household');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000014","role":"authenticated"}';
select is((select count(*) from public.households)::integer, 0, 'non-member sees no households');
select is((select count(*) from public.household_members)::integer, 0, 'non-member sees no members');
select lives_ok($$update public.households set name = 'Stolen'$$, 'non-member update affects no rows');
select throws_ok($$select public.archive_household('10000000-0000-0000-0000-000000000001')$$, '42501', 'Household owner required', 'non-member cannot archive');
select throws_ok($$select public.create_household(null, 'Missing ID')$$, '22023', 'Household request ID is required', 'create requires retry ID');
select throws_ok($$select public.create_household('10000000-0000-0000-0000-000000000004', '   ')$$, '23514', null, 'blank household name rejected');
select throws_ok($$select public.create_household('10000000-0000-0000-0000-000000000004', 'Bad zone', 'Invalid/Timezone')$$, '23514', 'Unknown household timezone', 'invalid timezone rejected');
select throws_ok($$select public.create_household('10000000-0000-0000-0000-000000000004', 'Bad servings', 'Europe/London', 3::smallint)$$, '23514', null, 'invalid servings rejected');

reset role;
select is((select name from public.households where id = '10000000-0000-0000-0000-000000000001'), 'Member edit', 'non-member did not mutate household');
select is((select count(*) from public.households)::integer, 2, 'failed creation leaves no partial household');
select throws_ok($$insert into public.household_members(household_id,user_id,role,slot) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000015','member',2)$$, '23505', null, 'third active member rejected');
select throws_ok($$insert into public.household_members(household_id,user_id,role,slot) values ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000012','member',2)$$, '23505', null, 'second active household membership rejected');
select throws_ok($$update public.household_members set role = 'member' where user_id = '00000000-0000-0000-0000-000000000011'; select pg_temp.check_lifecycle()$$, '23514', 'Active household requires an owner', 'last owner cannot be demoted');
select throws_ok($$update public.household_members set archived_at = now() where user_id = '00000000-0000-0000-0000-000000000011'; select pg_temp.check_lifecycle()$$, '23514', 'Active household requires an owner', 'last owner cannot be archived alone');
select throws_ok($$update public.households set archived_at = now() where id = '10000000-0000-0000-0000-000000000001'; select pg_temp.check_lifecycle()$$, '23514', 'Archived household cannot have active members', 'archival requires member archival');
select throws_ok($$delete from public.household_members where user_id = '00000000-0000-0000-0000-000000000011'$$, '23514', 'Memberships must be archived', 'membership history cannot be deleted');

set local role anon;
select throws_ok($$select * from public.households$$, '42501', null, 'anonymous household access denied');
select throws_ok($$select public.is_household_member('10000000-0000-0000-0000-000000000001')$$, '42501', null, 'anonymous helper access denied');
select throws_ok($$select public.create_household('10000000-0000-0000-0000-000000000004', 'Anon')$$, '42501', null, 'anonymous creation denied');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}';
select lives_ok($$select public.archive_household('10000000-0000-0000-0000-000000000001')$$, 'owner archives household atomically');
select lives_ok($$select public.archive_household('10000000-0000-0000-0000-000000000001')$$, 'owner archival retry is safe');
select ok(not public.is_household_member('10000000-0000-0000-0000-000000000001'), 'archival revokes shared access');
select is((select count(*) from public.households)::integer, 0, 'archived household hidden');
reset role;
select lives_ok($$select pg_temp.check_lifecycle()$$, 'archival satisfies final lifecycle constraints');
select is((select count(*) from public.household_members where household_id = '10000000-0000-0000-0000-000000000001' and archived_at is null)::integer, 0, 'all memberships archived together');
select throws_ok($$update public.households set archived_at = null where id = '10000000-0000-0000-0000-000000000001'$$, '23514', 'Archived households are immutable', 'archived household cannot be revived');
select throws_ok($$insert into public.household_members(household_id,user_id,role,slot) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000015','member',1)$$, '23514', 'Membership requires an active household', 'cannot join archived household');
select throws_ok($$delete from public.households where id = '10000000-0000-0000-0000-000000000001'$$, '23514', 'Households must be archived', 'household history cannot be deleted');

select * from finish();
rollback;
