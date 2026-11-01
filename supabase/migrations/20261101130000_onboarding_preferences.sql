-- Personal planning inputs remain private; kitchen setup is household-shared.
create table public.user_preference_profiles (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  budget_weight numeric not null default 0.5 check (budget_weight between 0 and 1),
  variety_weight numeric not null default 0.5 check (variety_weight between 0 and 1),
  reuse_weight numeric not null default 0.5 check (reuse_weight between 0 and 1),
  adventure_weight numeric not null default 0.5 check (adventure_weight between 0 and 1),
  effort_weight numeric not null default 0.5 check (effort_weight between 0 and 1),
  max_cook_minutes smallint not null default 30 check (max_cook_minutes between 5 and 240),
  safety_reviewed boolean not null default false,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  check (not completed or safety_reviewed)
);
create table public.dietary_rules (
  user_id uuid not null references public.user_preference_profiles(user_id) on delete cascade,
  rule_type text not null check (rule_type in ('allergy','dietary','dislike')),
  value text not null check (value = lower(btrim(value)) and char_length(value) between 1 and 80),
  primary key(user_id,rule_type,value)
);
create table public.cuisine_preferences (
  user_id uuid not null references public.user_preference_profiles(user_id) on delete cascade,
  cuisine text not null check (cuisine = lower(btrim(cuisine)) and char_length(cuisine) between 1 and 80),
  score smallint not null check (score in (-1,0,1)),
  primary key(user_id,cuisine)
);
create table public.household_planning_settings (
  household_id uuid primary key references public.households(id) on delete restrict,
  cadence text not null default 'weekly' check (cadence in ('weekly','fortnightly')),
  planning_day smallint not null default 0 check (planning_day between 0 and 6),
  equipment_note text not null default '' check (char_length(equipment_note) <= 500),
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.household_equipment (
  household_id uuid not null references public.household_planning_settings(household_id) on delete cascade,
  equipment_key text not null check (equipment_key in ('oven','hob','microwave','air_fryer','blender','food_processor','slow_cooker','pressure_cooker','barbecue','rice_cooker')),
  primary key(household_id,equipment_key)
);

alter table public.user_preference_profiles enable row level security;
alter table public.dietary_rules enable row level security;
alter table public.cuisine_preferences enable row level security;
alter table public.household_planning_settings enable row level security;
alter table public.household_equipment enable row level security;
revoke all on public.user_preference_profiles, public.dietary_rules, public.cuisine_preferences,
  public.household_planning_settings, public.household_equipment from public, anon, authenticated;
grant select on public.user_preference_profiles, public.dietary_rules, public.cuisine_preferences,
  public.household_planning_settings, public.household_equipment to authenticated;
grant all on public.user_preference_profiles, public.dietary_rules, public.cuisine_preferences,
  public.household_planning_settings, public.household_equipment to service_role;
create policy "Own preference profile" on public.user_preference_profiles for select to authenticated using (user_id=(select auth.uid()));
create policy "Own dietary rules" on public.dietary_rules for select to authenticated using (user_id=(select auth.uid()));
create policy "Own cuisine preferences" on public.cuisine_preferences for select to authenticated using (user_id=(select auth.uid()));
create policy "Active members read planning" on public.household_planning_settings for select to authenticated using (public.is_household_member(household_id));
create policy "Active members read equipment" on public.household_equipment for select to authenticated using (public.is_household_member(household_id));

-- Validate and canonicalise before any replacement deletes take place.
create function private.preference_text_list(input jsonb) returns text[]
language plpgsql immutable set search_path='' as $$
declare item jsonb; normalized text; result text[] := array[]::text[];
begin
  if jsonb_typeof(input) is distinct from 'array' or jsonb_array_length(input)>40 then
    raise exception using errcode='22023',message='Invalid preference list'; end if;
  for item in select value from jsonb_array_elements(input) loop
    if jsonb_typeof(item) is distinct from 'string' then raise exception using errcode='22023',message='Invalid preference value'; end if;
    normalized := lower(btrim(item #>> '{}'));
    if char_length(normalized) not between 1 and 80 or normalized=any(result) then
      raise exception using errcode='22023',message='Invalid or duplicate preference value'; end if;
    result := array_append(result,normalized);
  end loop;
  return result;
end;
$$;
revoke all on function private.preference_text_list(jsonb) from public, anon, authenticated;

create function public.get_personal_preferences() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication required'; end if;
  select jsonb_build_object(
    'allergies',coalesce((select jsonb_agg(r.value order by r.value) from public.dietary_rules r where r.user_id=p.user_id and r.rule_type='allergy'),'[]'::jsonb),
    'dietaryRequirements',coalesce((select jsonb_agg(r.value order by r.value) from public.dietary_rules r where r.user_id=p.user_id and r.rule_type='dietary'),'[]'::jsonb),
    'dislikes',coalesce((select jsonb_agg(r.value order by r.value) from public.dietary_rules r where r.user_id=p.user_id and r.rule_type='dislike'),'[]'::jsonb),
    'cuisines',coalesce((select jsonb_agg(jsonb_build_object('cuisine',c.cuisine,'score',c.score) order by c.cuisine) from public.cuisine_preferences c where c.user_id=p.user_id),'[]'::jsonb),
    'weights',jsonb_build_object('budget',p.budget_weight,'variety',p.variety_weight,'reuse',p.reuse_weight,'adventure',p.adventure_weight,'effort',p.effort_weight),
    'maxCookMinutes',p.max_cook_minutes,'safetyReviewed',p.safety_reviewed,'completed',p.completed
  ) into result from public.user_preference_profiles p where p.user_id=auth.uid();
  return result;
end;
$$;

create function public.save_personal_preferences(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); allergies text[]; dietary text[]; dislikes text[];
  item jsonb; cuisines jsonb:='[]'::jsonb; names text[]:=array[]::text[]; cuisine text;
  weights jsonb; key text; minutes numeric;
begin
  if caller is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if jsonb_typeof(payload) is distinct from 'object' then raise exception using errcode='22023',message='Invalid preferences'; end if;
  allergies:=private.preference_text_list(payload->'allergies');
  dietary:=private.preference_text_list(payload->'dietaryRequirements');
  dislikes:=private.preference_text_list(payload->'dislikes');
  weights:=payload->'weights';
  if jsonb_typeof(weights) is distinct from 'object' then raise exception using errcode='22023',message='Invalid weights'; end if;
  foreach key in array array['budget','variety','reuse','adventure','effort'] loop
    if jsonb_typeof(weights->key) is distinct from 'number' then raise exception using errcode='22023',message='Invalid weight'; end if;
    if (weights->>key)::numeric not between 0 and 1 then raise exception using errcode='22023',message='Weight out of range'; end if;
  end loop;
  if jsonb_typeof(payload->'maxCookMinutes') is distinct from 'number'
    or jsonb_typeof(payload->'safetyReviewed') is distinct from 'boolean'
    or jsonb_typeof(payload->'completed') is distinct from 'boolean' then
    raise exception using errcode='22023',message='Invalid personal settings'; end if;
  minutes:=(payload->>'maxCookMinutes')::numeric;
  if minutes not between 5 and 240 or minutes<>trunc(minutes)
    or ((payload->>'completed')::boolean and not (payload->>'safetyReviewed')::boolean) then
    raise exception using errcode='22023',message='Invalid personal completion or cooking time'; end if;
  if jsonb_typeof(payload->'cuisines') is distinct from 'array' or jsonb_array_length(payload->'cuisines')>40 then
    raise exception using errcode='22023',message='Invalid cuisines'; end if;
  for item in select value from jsonb_array_elements(payload->'cuisines') loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'cuisine') is distinct from 'string'
      or jsonb_typeof(item->'score') is distinct from 'number' then raise exception using errcode='22023',message='Invalid cuisine'; end if;
    cuisine:=lower(btrim(item->>'cuisine'));
    if char_length(cuisine) not between 1 and 80 or cuisine=any(names) or (item->>'score')::numeric not in (-1,0,1) then
      raise exception using errcode='22023',message='Invalid cuisine preference'; end if;
    names:=array_append(names,cuisine);
    cuisines:=cuisines || jsonb_build_array(jsonb_build_object('cuisine',cuisine,'score',(item->>'score')::smallint));
  end loop;
  perform 1 from public.profiles where id=caller for update;
  if not found then raise exception using errcode='42501',message='User profile required'; end if;
  insert into public.user_preference_profiles(user_id,budget_weight,variety_weight,reuse_weight,adventure_weight,effort_weight,max_cook_minutes,safety_reviewed,completed)
    values(caller,(weights->>'budget')::numeric,(weights->>'variety')::numeric,(weights->>'reuse')::numeric,(weights->>'adventure')::numeric,(weights->>'effort')::numeric,minutes::smallint,(payload->>'safetyReviewed')::boolean,(payload->>'completed')::boolean)
    on conflict(user_id) do update set budget_weight=excluded.budget_weight,variety_weight=excluded.variety_weight,reuse_weight=excluded.reuse_weight,
      adventure_weight=excluded.adventure_weight,effort_weight=excluded.effort_weight,max_cook_minutes=excluded.max_cook_minutes,
      safety_reviewed=excluded.safety_reviewed,completed=public.user_preference_profiles.completed or excluded.completed,updated_at=clock_timestamp();
  delete from public.dietary_rules where user_id=caller;
  insert into public.dietary_rules select caller,'allergy',v from unnest(allergies) v;
  insert into public.dietary_rules select caller,'dietary',v from unnest(dietary) v;
  insert into public.dietary_rules select caller,'dislike',v from unnest(dislikes) v;
  delete from public.cuisine_preferences where user_id=caller;
  insert into public.cuisine_preferences select caller,c->>'cuisine',(c->>'score')::smallint from jsonb_array_elements(cuisines) c;
  return public.get_personal_preferences();
end;
$$;

create function public.get_kitchen_settings(target_household_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_household_member(target_household_id) then raise exception using errcode='42501',message='Household membership required'; end if;
  select jsonb_build_object('cadence',s.cadence,'planningDay',s.planning_day,'timezone',h.timezone,'defaultServings',h.default_servings,
    'equipment',coalesce((select jsonb_agg(e.equipment_key order by e.equipment_key) from public.household_equipment e where e.household_id=h.id),'[]'::jsonb),
    'equipmentNote',s.equipment_note,'completed',s.completed)
    into result from public.household_planning_settings s join public.households h on h.id=s.household_id
    where h.id=target_household_id and public.is_household_member(h.id);
  return result;
end;
$$;

create function public.save_kitchen_settings(target_household_id uuid,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare equipment text[]; item text; note text; zone text; day numeric; servings numeric;
begin
  -- Take the lifecycle lock before checking membership so archival cannot race the write.
  perform 1 from public.households where id=target_household_id and archived_at is null for update;
  if not found or not public.is_household_member(target_household_id) then
    raise exception using errcode='42501',message='Household membership required'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or jsonb_typeof(payload->'cadence') is distinct from 'string'
    or payload->>'cadence' not in ('weekly','fortnightly')
    or jsonb_typeof(payload->'planningDay') is distinct from 'number'
    or jsonb_typeof(payload->'defaultServings') is distinct from 'number'
    or jsonb_typeof(payload->'timezone') is distinct from 'string'
    or jsonb_typeof(payload->'equipmentNote') is distinct from 'string'
    or jsonb_typeof(payload->'completed') is distinct from 'boolean' then
    raise exception using errcode='22023',message='Invalid kitchen settings'; end if;
  day:=(payload->>'planningDay')::numeric; servings:=(payload->>'defaultServings')::numeric;
  zone:=btrim(payload->>'timezone'); note:=btrim(payload->>'equipmentNote');
  if day not between 0 and 6 or day<>trunc(day) or servings not in (1,2) or char_length(note)>500
    or char_length(zone)>100 or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then
    raise exception using errcode='22023',message='Invalid kitchen settings'; end if;
  equipment:=private.preference_text_list(payload->'equipment');
  foreach item in array equipment loop
    if item not in ('oven','hob','microwave','air_fryer','blender','food_processor','slow_cooker','pressure_cooker','barbecue','rice_cooker') then
      raise exception using errcode='22023',message='Unknown kitchen equipment'; end if;
  end loop;
  update public.households set timezone=zone,default_servings=servings::smallint where id=target_household_id;
  insert into public.household_planning_settings(household_id,cadence,planning_day,equipment_note,completed)
    values(target_household_id,payload->>'cadence',day::smallint,note,(payload->>'completed')::boolean)
    on conflict(household_id) do update set cadence=excluded.cadence,planning_day=excluded.planning_day,equipment_note=excluded.equipment_note,
      completed=public.household_planning_settings.completed or excluded.completed,updated_at=clock_timestamp();
  delete from public.household_equipment where household_id=target_household_id;
  insert into public.household_equipment select target_household_id,v from unnest(equipment) v;
  return public.get_kitchen_settings(target_household_id);
end;
$$;

revoke all on function public.get_personal_preferences(),public.save_personal_preferences(jsonb),
  public.get_kitchen_settings(uuid),public.save_kitchen_settings(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.get_personal_preferences(),public.save_personal_preferences(jsonb),
  public.get_kitchen_settings(uuid),public.save_kitchen_settings(uuid,jsonb) to authenticated;
