-- Household-scoped access and a closed membership write boundary.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.households (
  id uuid primary key,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  timezone text not null default 'Europe/London',
  default_servings smallint not null default 2 check (default_servings between 1 and 2),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz check (archived_at is null or archived_at >= created_at)
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role text not null check (role in ('owner', 'member')),
  slot smallint not null check (slot in (1, 2)),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz check (archived_at is null or archived_at >= joined_at)
);

create unique index household_members_active_slot
  on public.household_members(household_id, slot) where archived_at is null;
create unique index household_members_one_active_household
  on public.household_members(user_id) where archived_at is null;
create index household_members_history on public.household_members(household_id, user_id);

create function private.guard_household() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    raise exception using errcode = '23514', message = 'Households must be archived';
  end if;
  if TG_OP = 'UPDATE' then
    if old.archived_at is not null then
      raise exception using errcode = '23514', message = 'Archived households are immutable';
    end if;
    if (new.id, new.created_by_user_id, new.created_at) is distinct from
       (old.id, old.created_by_user_id, old.created_at) then
      raise exception using errcode = '23514', message = 'Household identity is immutable';
    end if;
    new.updated_at = now();
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception using errcode = '23514', message = 'Unknown household timezone';
  end if;
  return new;
end;
$$;
create trigger guard_household before insert or update or delete on public.households
  for each row execute function private.guard_household();

create function private.guard_household_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    raise exception using errcode = '23514', message = 'Memberships must be archived';
  end if;
  if TG_OP = 'UPDATE' then
    if old.archived_at is not null then
      raise exception using errcode = '23514', message = 'Archived memberships are immutable';
    end if;
    if (new.id, new.household_id, new.user_id, new.slot, new.joined_at) is distinct from
       (old.id, old.household_id, old.user_id, old.slot, old.joined_at) then
      raise exception using errcode = '23514', message = 'Membership identity is immutable';
    end if;
    new.updated_at = now();
  end if;
  -- A real parent-row write serializes lifecycle changes. REPEATABLE READ
  -- contenders must abort rather than validate against a stale parent version.
  update public.households set updated_at = now()
    where id = new.household_id and archived_at is null;
  if not found then
    raise exception using errcode = '23514', message = 'Membership requires an active household';
  end if;
  return new;
end;
$$;
create trigger guard_household_member before insert or update or delete on public.household_members
  for each row execute function private.guard_household_member();

create function private.check_household_lifecycle() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_id uuid; archived timestamptz;
begin
  if TG_TABLE_NAME = 'households' then target_id = new.id;
  else target_id = new.household_id; end if;
  select archived_at into archived from public.households where id = target_id;
  if archived is null then
    if not exists (select 1 from public.household_members where household_id = target_id
      and archived_at is null and role = 'owner') then
      raise exception using errcode = '23514', message = 'Active household requires an owner';
    end if;
  elsif exists (select 1 from public.household_members
    where household_id = target_id and archived_at is null) then
    raise exception using errcode = '23514', message = 'Archived household cannot have active members';
  end if;
  return null;
end;
$$;
create constraint trigger households_lifecycle after insert or update on public.households
  deferrable initially deferred for each row execute function private.check_household_lifecycle();
create constraint trigger household_members_lifecycle after insert or update on public.household_members
  deferrable initially deferred for each row execute function private.check_household_lifecycle();
revoke all on function private.guard_household(), private.guard_household_member(),
  private.check_household_lifecycle() from public, anon, authenticated;

-- Caller identity only; definer access avoids recursive membership RLS.
create function public.is_household_member(target_household_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_members m
    join public.households h on h.id = m.household_id
    where m.household_id = target_household_id and m.user_id = (select auth.uid())
      and m.archived_at is null and h.archived_at is null);
$$;
revoke all on function public.is_household_member(uuid) from public, anon, authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
revoke all on public.households, public.household_members from anon, authenticated;
grant select on public.households, public.household_members to authenticated;
grant update (name, timezone, default_servings) on public.households to authenticated;
create policy "Members read their active household" on public.households for select
  to authenticated using (public.is_household_member(id));
create policy "Members update shared household settings" on public.households for update
  to authenticated using (public.is_household_member(id)) with check (public.is_household_member(id));
create policy "Members read their household membership" on public.household_members for select
  to authenticated using (public.is_household_member(household_id));

create function public.create_household(household_id uuid, household_name text,
  household_timezone text default 'Europe/London', servings smallint default 2)
returns public.households language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); result public.households;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if household_id is null then
    raise exception using errcode = '22023', message = 'Household request ID is required';
  end if;
  perform 1 from public.profiles where id = caller for update;
  if not found then
    raise exception using errcode = '42501', message = 'User profile required';
  end if;
  select h.* into result from public.households h
    join public.household_members m on m.household_id = h.id
    where m.user_id = caller and m.archived_at is null and h.archived_at is null;
  if found then
    if result.id = household_id and result.created_by_user_id = caller then return result; end if;
    raise exception using errcode = '23514', message = 'User already has an active household';
  end if;
  insert into public.households(id, name, timezone, default_servings, created_by_user_id)
    values (household_id, btrim(household_name), household_timezone, servings, caller)
    returning * into result;
  insert into public.household_members(household_id, user_id, role, slot)
    values (result.id, caller, 'owner', 1);
  return result;
end;
$$;
revoke all on function public.create_household(uuid, text, text, smallint) from public, anon, authenticated;
grant execute on function public.create_household(uuid, text, text, smallint) to authenticated;

create function public.archive_household(target_household_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare archived timestamptz;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  select archived_at into archived from public.households where id = target_household_id for update;
  if not found or not exists (select 1 from public.household_members
    where household_id = target_household_id and user_id = (select auth.uid()) and role = 'owner'
      and (archived_at is null or archived_at = archived)) then
    raise exception using errcode = '42501', message = 'Household owner required';
  end if;
  if archived is not null then return; end if;
  update public.household_members set archived_at = now()
    where household_id = target_household_id and archived_at is null;
  update public.households set archived_at = now() where id = target_household_id;
end;
$$;
revoke all on function public.archive_household(uuid) from public, anon, authenticated;
grant execute on function public.archive_household(uuid) to authenticated;
