-- New application tables need explicit trusted-backend privileges as well as RLS.
-- Browser/mobile roles retain their restricted grants and policies.
grant all on public.profiles, public.households, public.household_members to service_role;
