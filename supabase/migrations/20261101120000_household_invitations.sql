create extension if not exists pgcrypto with schema extensions;
create table private.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id),
  created_by_user_id uuid not null references public.profiles(id),
  secret_hash bytea not null unique check (octet_length(secret_hash) = 32),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by_user_id uuid references public.profiles(id),
  accepted_membership_id uuid references public.household_members(id),
  check (expires_at > created_at),
  check ((accepted_at is null and accepted_by_user_id is null and accepted_membership_id is null)
    or (accepted_at is not null and accepted_by_user_id is not null and accepted_membership_id is not null)),
  check (accepted_at is null or revoked_at is null)
);
alter table private.household_invitations enable row level security;
revoke all on private.household_invitations from public, anon, authenticated;
create index household_invitations_household on private.household_invitations(household_id);

create function public.create_household_invitation(target_household_id uuid)
returns table (id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare secret text; issued private.household_invitations; household public.households;
begin
  select * into household from public.households where households.id = target_household_id for update;
  if auth.uid() is null or not found or household.archived_at is not null or not exists (
    select 1 from public.household_members where household_id = target_household_id
      and user_id = auth.uid() and role = 'owner' and archived_at is null
  ) then raise exception using errcode = '42501', message = 'Household owner required'; end if;
  if (select count(*) from public.household_members where household_id = target_household_id and archived_at is null) >= 2 then
    raise exception using errcode = '23514', message = 'Household is full';
  end if;
  update private.household_invitations set revoked_at = clock_timestamp()
    where household_id = target_household_id and accepted_at is null and revoked_at is null;
  secret := encode(extensions.gen_random_bytes(12), 'hex');
  insert into private.household_invitations(household_id, created_by_user_id, secret_hash, expires_at)
    values (target_household_id, auth.uid(), extensions.digest(secret, 'sha256'), clock_timestamp() + interval '24 hours')
    returning * into issued;
  return query select issued.id, upper(secret), issued.expires_at;
end;
$$;

create function public.list_household_invitations(target_household_id uuid)
returns table (id uuid, expires_at timestamptz, revoked_at timestamptz, accepted_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.household_members m join public.households h on h.id = m.household_id
    where h.id = target_household_id and h.archived_at is null and m.user_id = auth.uid()
      and m.role = 'owner' and m.archived_at is null
  ) then raise exception using errcode = '42501', message = 'Household owner required'; end if;
  return query select i.id, i.expires_at, i.revoked_at, i.accepted_at
    from private.household_invitations i where i.household_id = target_household_id
    order by i.created_at desc limit 20;
end;
$$;

create function public.revoke_household_invitation(target_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  select household_id into target from private.household_invitations where id = target_invitation_id;
  perform 1 from public.households where id = target and archived_at is null for update;
  if auth.uid() is null or not found or not exists (select 1 from public.household_members
    where household_id = target and user_id = auth.uid() and role = 'owner' and archived_at is null)
  then raise exception using errcode = '42501', message = 'Household owner required'; end if;
  update private.household_invitations set revoked_at = coalesce(revoked_at, clock_timestamp())
    where id = target_invitation_id and accepted_at is null;
end;
$$;

create function public.accept_household_invitation(invitation_code text)
returns public.households language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); secret text; target uuid; invitation private.household_invitations;
  household public.households; membership uuid; free_slot smallint;
begin
  if caller is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if invitation_code is null or length(invitation_code) > 128 then
    raise exception using errcode = '22023', message = 'Invalid invitation code';
  end if;
  secret := lower(regexp_replace(invitation_code, '[[:space:]-]', '', 'g'));
  if secret !~ '^[0-9a-f]{24}$' then raise exception using errcode = '22023', message = 'Invalid invitation code'; end if;
  -- Shared lock order: profile, household, invitation. Revalidate after waiting.
  perform 1 from public.profiles where id = caller for update;
  if not found then raise exception using errcode = '42501', message = 'User profile required'; end if;
  select household_id into target from private.household_invitations where secret_hash = extensions.digest(secret, 'sha256');
  if not found then raise exception using errcode = '23514', message = 'Invitation is invalid or unavailable'; end if;
  select * into household from public.households where id = target for update;
  select * into invitation from private.household_invitations where secret_hash = extensions.digest(secret, 'sha256') for update;
  if not found or household.archived_at is not null then
    raise exception using errcode = '23514', message = 'Invitation is invalid or unavailable';
  end if;
  if invitation.accepted_by_user_id = caller and exists (select 1 from public.household_members
    where id = invitation.accepted_membership_id and user_id = caller and household_id = target and archived_at is null)
  then return household; end if;
  if invitation.accepted_at is not null or invitation.revoked_at is not null or invitation.expires_at <= clock_timestamp() then
    raise exception using errcode = '23514', message = 'Invitation is invalid or unavailable';
  end if;
  if exists (select 1 from public.household_members where user_id = caller and archived_at is null) then
    raise exception using errcode = '23514', message = 'User already has an active household';
  end if;
  select candidate.slot::smallint into free_slot from generate_series(1, 2) as candidate(slot)
    where not exists (select 1 from public.household_members m where m.household_id = target and m.slot = candidate.slot and m.archived_at is null)
    order by candidate.slot limit 1;
  if free_slot is null then raise exception using errcode = '23514', message = 'Household is full'; end if;
  insert into public.household_members(household_id, user_id, role, slot)
    values (target, caller, 'member', free_slot) returning id into membership;
  update private.household_invitations set accepted_at = clock_timestamp(), accepted_by_user_id = caller,
    accepted_membership_id = membership where id = invitation.id;
  return household;
end;
$$;
revoke all on function public.create_household_invitation(uuid), public.list_household_invitations(uuid),
  public.revoke_household_invitation(uuid), public.accept_household_invitation(text) from public, anon, authenticated;
grant execute on function public.create_household_invitation(uuid), public.list_household_invitations(uuid),
  public.revoke_household_invitation(uuid), public.accept_household_invitation(text) to authenticated;
