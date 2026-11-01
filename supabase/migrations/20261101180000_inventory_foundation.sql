create table public.ingredients (
  id uuid primary key,
  canonical_name text not null unique check (char_length(canonical_name) between 1 and 80),
  category text not null,
  measurement_type text not null check (measurement_type in ('mass','volume','count')),
  default_storage_location text not null check (default_storage_location in ('fridge','freezer','cupboard','other'))
);
create table public.ingredient_aliases (
  alias text primary key check(alias = lower(btrim(alias)) and char_length(alias) between 1 and 100),
  ingredient_id uuid not null references public.ingredients(id) on delete restrict
);
create table public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete restrict,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  original_quantity_base numeric(15,3) not null check(original_quantity_base > 0 and original_quantity_base <= 1000000000),
  original_quantity numeric(15,3) not null check(original_quantity > 0),
  original_unit text not null check(original_unit in ('g','kg','ml','l','count')),
  measurement_type text not null check(measurement_type in ('mass','volume','count')),
  storage_location text not null check(storage_location in ('fridge','freezer','cupboard','other')),
  confidence text not null check(confidence in ('confirmed','estimated')),
  expiry_date date,
  expiry_kind text check(expiry_kind in ('use_by','best_before','estimated')),
  expiry_source text check(expiry_source in ('packaging','user_estimate')),
  frozen_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  version integer not null default 1 check(version > 0),
  note text not null default '' check(char_length(note) <= 500),
  unique(id,household_id),
  check ((expiry_date is null and expiry_kind is null and expiry_source is null) or
    (expiry_date is not null and expiry_kind is not null and expiry_source = case when expiry_kind='estimated' then 'user_estimate' else 'packaging' end)),
  check (frozen_at is null or storage_location='freezer')
);
create index inventory_lots_household on public.inventory_lots(household_id);
create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete restrict,
  lot_id uuid not null,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  quantity_delta_base numeric(15,3) not null check(abs(quantity_delta_base) <= 1000000000),
  measurement_type text not null check(measurement_type in ('mass','volume','count')),
  source_type text not null check(source_type in ('manual_add','manual_adjustment','freeze')),
  confidence text not null check(confidence in ('confirmed','estimated')),
  reason text not null check(char_length(reason) between 1 and 500),
  occurred_at timestamptz not null default clock_timestamp(),
  request_id uuid not null,
  foreign key(lot_id, household_id) references public.inventory_lots(id, household_id) on delete restrict,
  unique(household_id,request_id),
  check ((source_type='manual_add' and quantity_delta_base>0) or source_type='manual_adjustment' or (source_type='freeze' and quantity_delta_base=0))
);
create index inventory_transactions_lot on public.inventory_transactions(lot_id);
create table private.inventory_requests (
  household_id uuid not null references public.households(id) on delete restrict,
  request_id uuid not null,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  operation text not null,
  payload jsonb not null,
  response jsonb not null,
  primary key(household_id,request_id)
);
create function private.immutable_inventory_transaction() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='23514',message='Inventory history is immutable'; end;
$$;
create trigger immutable_inventory_transaction before update or delete on public.inventory_transactions for each row execute function private.immutable_inventory_transaction();

create function private.check_inventory_transaction() returns trigger language plpgsql set search_path='' as $$
declare lot public.inventory_lots; total numeric;
begin
  select * into lot from public.inventory_lots where id=new.lot_id for update;
  if lot.household_id<>new.household_id or lot.ingredient_id<>new.ingredient_id or lot.measurement_type<>new.measurement_type then
    raise exception using errcode='23514',message='Inventory identity mismatch';
  end if;
  select coalesce(sum(quantity_delta_base),0) into total from public.inventory_transactions where lot_id=new.lot_id;
  if total+new.quantity_delta_base<0 or total+new.quantity_delta_base>1000000000 then
    raise exception using errcode='23514',message='Inventory quantity out of range';
  end if;
  return new;
end;
$$;
create trigger check_inventory_transaction before insert on public.inventory_transactions for each row execute function private.check_inventory_transaction();

create function private.inventory_ingredient_json(target_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',i.id,'name',i.canonical_name,'category',i.category,'measurementType',i.measurement_type,'defaultStorageLocation',i.default_storage_location,'aliases',coalesce((select jsonb_agg(a.alias order by a.alias) from public.ingredient_aliases a where a.ingredient_id=i.id),'[]'::jsonb)) from public.ingredients i where i.id=target_id;
$$;
create function private.inventory_lot_json(target_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',l.id,'householdId',l.household_id,'ingredient',private.inventory_ingredient_json(l.ingredient_id),'quantityBase',coalesce((select sum(t.quantity_delta_base) from public.inventory_transactions t where t.lot_id=l.id),0),'originalQuantityBase',l.original_quantity_base,'measurementType',l.measurement_type,'storageLocation',l.storage_location,'confidence',l.confidence,'expiryDate',l.expiry_date,'expiryKind',l.expiry_kind,'expirySource',l.expiry_source,'frozenAt',l.frozen_at,'createdAt',l.created_at,'version',l.version,'note',l.note) from public.inventory_lots l where l.id=target_id;
$$;
create function private.lock_inventory_household(target_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Active household membership required'; end if;
  update public.households set updated_at=clock_timestamp() where id=target_id and archived_at is null;
  if not found or not public.is_household_member(target_id) then raise exception using errcode='42501',message='Active household membership required'; end if;
end;
$$;
create function public.search_inventory_ingredients(search_query text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if search_query is null or char_length(search_query)>80 then raise exception using errcode='22023',message='Search is too long'; end if;
  return coalesce((select jsonb_agg(private.inventory_ingredient_json(i.id) order by i.canonical_name) from public.ingredients i where strpos(lower(i.canonical_name),lower(btrim(search_query)))>0 or exists(select 1 from public.ingredient_aliases a where a.ingredient_id=i.id and strpos(a.alias,lower(btrim(search_query)))>0)),'[]'::jsonb);
end;
$$;
create function public.list_inventory_lots(target_household_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_household_member(target_household_id) then raise exception using errcode='42501',message='Active household membership required'; end if;
 return coalesce((select jsonb_agg(private.inventory_lot_json(l.id) order by l.created_at,l.id) from public.inventory_lots l where l.household_id=target_household_id),'[]'::jsonb);
end;
$$;
create function public.get_inventory_history(target_household_id uuid,target_lot_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_household_member(target_household_id) then raise exception using errcode='42501',message='Active household membership required'; end if;
 if not exists(select 1 from public.inventory_lots where id=target_lot_id and household_id=target_household_id) then raise exception using errcode='42501',message='Item unavailable'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'lotId',t.lot_id,'householdId',t.household_id,'actorUserId',t.actor_user_id,'quantityDeltaBase',t.quantity_delta_base,'sourceType',t.source_type,'confidence',t.confidence,'reason',t.reason,'occurredAt',t.occurred_at,'requestId',t.request_id) order by t.occurred_at,t.id) from public.inventory_transactions t where t.household_id=target_household_id and t.lot_id=target_lot_id),'[]'::jsonb);
end;
$$;

create function private.mutate_inventory(target_household_id uuid, operation text, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); req uuid; previous private.inventory_requests; lot public.inventory_lots; item public.ingredients;
 amount numeric; original_amount numeric; unit text; measure text; storage text; certainty text; expiry date; expiry_kind text; note text; reason text; delta numeric; result jsonb; expected integer;
begin
 perform private.lock_inventory_household(target_household_id);
 if jsonb_typeof(payload) is distinct from 'object' or jsonb_typeof(payload->'requestId') is distinct from 'string' then raise exception using errcode='22023',message='Invalid inventory request'; end if;
 req:=(payload->>'requestId')::uuid;
 select * into previous from private.inventory_requests where household_id=target_household_id and request_id=req;
 if found then
   if previous.actor_user_id<>caller or previous.operation<>operation or previous.payload<>payload then raise exception using errcode='40001',message='Request ID already used for different changes'; end if;
   return previous.response;
 end if;
 if operation='add' then
   if jsonb_typeof(payload->'ingredientId') is distinct from 'string' or jsonb_typeof(payload->'quantity') is distinct from 'number' or jsonb_typeof(payload->'unit') is distinct from 'string' or jsonb_typeof(payload->'storageLocation') is distinct from 'string' or jsonb_typeof(payload->'confidence') is distinct from 'string' or jsonb_typeof(payload->'note') is distinct from 'string' then raise exception using errcode='22023',message='Invalid inventory details'; end if;
   select * into item from public.ingredients where id=(payload->>'ingredientId')::uuid;
   if not found then raise exception using errcode='22023',message='Choose a catalogue ingredient'; end if;
   original_amount:=(payload->>'quantity')::numeric;
   unit:=payload->>'unit'; measure:=case when unit in ('g','kg') then 'mass' when unit in ('ml','l') then 'volume' when unit='count' then 'count' end;
   amount:=original_amount*case when unit in ('kg','l') then 1000 else 1 end;
   storage:=payload->>'storageLocation'; certainty:=payload->>'confidence'; note:=btrim(payload->>'note');
   if original_amount<=0 or original_amount<>round(original_amount,3) or amount>1000000000 or measure is distinct from item.measurement_type or storage not in ('fridge','freezer','cupboard','other') or certainty not in ('confirmed','estimated') or char_length(note)>500 then raise exception using errcode='22023',message='Invalid quantity, unit or storage'; end if;
   if payload->>'expiryDate' is null then
     if payload->>'expiryKind' is not null then raise exception using errcode='22023',message='Date required'; end if;
   else
     if jsonb_typeof(payload->'expiryDate') is distinct from 'string' or (payload->>'expiryDate')!~'^(19|20|21)[0-9]{2}-[0-9]{2}-[0-9]{2}$' then raise exception using errcode='22023',message='Invalid expiry date'; end if;
     expiry:=(payload->>'expiryDate')::date; expiry_kind:=payload->>'expiryKind';
     if expiry_kind is null or expiry_kind not in ('use_by','best_before','estimated') then raise exception using errcode='22023',message='Date provenance required'; end if;
   end if;
   insert into public.inventory_lots(household_id,ingredient_id,original_quantity_base,original_quantity,original_unit,measurement_type,storage_location,confidence,expiry_date,expiry_kind,expiry_source,frozen_at,created_by_user_id,note)
   values(target_household_id,item.id,amount,original_amount,unit,measure,storage,certainty,expiry,expiry_kind,case when expiry is null then null when expiry_kind='estimated' then 'user_estimate' else 'packaging' end,case when storage='freezer' then clock_timestamp() else null end,caller,note) returning * into lot;
   delta:=amount; reason:='Added to kitchen';
 else
   if jsonb_typeof(payload->'lotId') is distinct from 'string' or jsonb_typeof(payload->'expectedVersion') is distinct from 'number' then raise exception using errcode='22023',message='Invalid item version'; end if;
   if (payload->>'expectedVersion')::numeric<>trunc((payload->>'expectedVersion')::numeric) then raise exception using errcode='22023',message='Invalid item version'; end if;
   expected:=(payload->>'expectedVersion')::integer;
   select * into lot from public.inventory_lots where id=(payload->>'lotId')::uuid and household_id=target_household_id for update;
   if not found then raise exception using errcode='42501',message='Item unavailable'; end if;
   if lot.version<>expected then raise exception using errcode='40001',message='Item changed; refresh before correcting'; end if;
   if operation='adjust' then
     if jsonb_typeof(payload->'quantityBase') is distinct from 'number' or jsonb_typeof(payload->'confidence') is distinct from 'string' or jsonb_typeof(payload->'reason') is distinct from 'string' then raise exception using errcode='22023',message='Invalid correction'; end if;
     amount:=(payload->>'quantityBase')::numeric; certainty:=payload->>'confidence'; reason:=btrim(payload->>'reason');
     if amount<0 or amount>1000000000 or amount<>round(amount,3) or certainty not in ('confirmed','estimated') or char_length(reason) not between 1 and 500 then raise exception using errcode='22023',message='Invalid correction'; end if;
     select amount-coalesce(sum(quantity_delta_base),0) into delta from public.inventory_transactions where lot_id=lot.id;
     update public.inventory_lots set confidence=certainty,version=version+1 where id=lot.id;
   elsif operation='freeze' then
     if lot.storage_location='freezer' then raise exception using errcode='22023',message='Item is already frozen'; end if;
     if not exists(select 1 from public.inventory_transactions where lot_id=lot.id group by lot_id having sum(quantity_delta_base)>0) then raise exception using errcode='22023',message='No stock to freeze'; end if;
     update public.inventory_lots set storage_location='freezer',frozen_at=clock_timestamp(),version=version+1 where id=lot.id;
     delta:=0; certainty:=lot.confidence; reason:='Moved to freezer';
   else raise exception using errcode='22023',message='Unknown inventory operation'; end if;
 end if;
 insert into public.inventory_transactions(household_id,lot_id,ingredient_id,actor_user_id,quantity_delta_base,measurement_type,source_type,confidence,reason,request_id)
 values(target_household_id,lot.id,lot.ingredient_id,caller,delta,lot.measurement_type,case operation when 'add' then 'manual_add' when 'adjust' then 'manual_adjustment' else 'freeze' end,certainty,reason,req);
 result:=private.inventory_lot_json(lot.id);
 insert into private.inventory_requests values(target_household_id,req,caller,operation,payload,result);
 return result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
 raise exception using errcode='22023',message='Invalid inventory input';
end;
$$;
create function public.add_inventory_lot(target_household_id uuid,payload jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.mutate_inventory(target_household_id,'add',payload); $$;
create function public.adjust_inventory_lot(target_household_id uuid,payload jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.mutate_inventory(target_household_id,'adjust',payload); $$;
create function public.freeze_inventory_lot(target_household_id uuid,payload jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.mutate_inventory(target_household_id,'freeze',payload); $$;

alter table public.ingredients enable row level security;
alter table public.ingredient_aliases enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_transactions enable row level security;
revoke all on public.ingredients,public.ingredient_aliases,public.inventory_lots,public.inventory_transactions from public,anon,authenticated;
grant select on public.ingredients,public.ingredient_aliases,public.inventory_lots,public.inventory_transactions to authenticated;
grant all on public.ingredients,public.ingredient_aliases,public.inventory_lots,public.inventory_transactions to service_role;
create policy "Signed in users read ingredients" on public.ingredients for select to authenticated using(true);
create policy "Signed in users read aliases" on public.ingredient_aliases for select to authenticated using(true);
create policy "Members read inventory lots" on public.inventory_lots for select to authenticated using(public.is_household_member(household_id));
create policy "Members read inventory history" on public.inventory_transactions for select to authenticated using(public.is_household_member(household_id));
revoke all on function private.immutable_inventory_transaction(),private.check_inventory_transaction(),private.inventory_ingredient_json(uuid),private.inventory_lot_json(uuid),private.lock_inventory_household(uuid),private.mutate_inventory(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.search_inventory_ingredients(text),public.list_inventory_lots(uuid),public.get_inventory_history(uuid,uuid),public.add_inventory_lot(uuid,jsonb),public.adjust_inventory_lot(uuid,jsonb),public.freeze_inventory_lot(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.search_inventory_ingredients(text),public.list_inventory_lots(uuid),public.get_inventory_history(uuid,uuid),public.add_inventory_lot(uuid,jsonb),public.adjust_inventory_lot(uuid,jsonb),public.freeze_inventory_lot(uuid,jsonb) to authenticated;
insert into public.ingredients values ('60000000-0000-0000-0000-000000000001','chicken breast','meat','mass','fridge');
insert into public.ingredient_aliases values ('chicken breasts','60000000-0000-0000-0000-000000000001');
insert into public.ingredient_aliases values ('boneless chicken breast','60000000-0000-0000-0000-000000000001');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000002','chicken thigh','meat','mass','fridge');
insert into public.ingredient_aliases values ('chicken thighs','60000000-0000-0000-0000-000000000002');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000003','salmon fillet','fish','mass','fridge');
insert into public.ingredient_aliases values ('salmon fillets','60000000-0000-0000-0000-000000000003');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000004','beef mince','meat','mass','fridge');
insert into public.ingredient_aliases values ('minced beef','60000000-0000-0000-0000-000000000004');
insert into public.ingredient_aliases values ('ground beef','60000000-0000-0000-0000-000000000004');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000005','tofu','protein','mass','fridge');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000006','egg','dairy','count','fridge');
insert into public.ingredient_aliases values ('eggs','60000000-0000-0000-0000-000000000006');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000007','milk','dairy','volume','fridge');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000008','Greek yoghurt','dairy','mass','fridge');
insert into public.ingredient_aliases values ('greek yogurt','60000000-0000-0000-0000-000000000008');
insert into public.ingredient_aliases values ('greek yoghurt','60000000-0000-0000-0000-000000000008');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000009','cheddar','dairy','mass','fridge');
insert into public.ingredient_aliases values ('cheddar cheese','60000000-0000-0000-0000-000000000009');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000010','butter','dairy','mass','fridge');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000011','onion','vegetable','count','cupboard');
insert into public.ingredient_aliases values ('onions','60000000-0000-0000-0000-000000000011');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000012','garlic','vegetable','count','cupboard');
insert into public.ingredient_aliases values ('garlic bulbs','60000000-0000-0000-0000-000000000012');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000013','potato','vegetable','mass','cupboard');
insert into public.ingredient_aliases values ('potatoes','60000000-0000-0000-0000-000000000013');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000014','carrot','vegetable','mass','fridge');
insert into public.ingredient_aliases values ('carrots','60000000-0000-0000-0000-000000000014');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000015','bell pepper','vegetable','count','fridge');
insert into public.ingredient_aliases values ('peppers','60000000-0000-0000-0000-000000000015');
insert into public.ingredient_aliases values ('bell peppers','60000000-0000-0000-0000-000000000015');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000016','broccoli','vegetable','mass','fridge');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000017','spinach','vegetable','mass','fridge');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000018','mushroom','vegetable','mass','fridge');
insert into public.ingredient_aliases values ('mushrooms','60000000-0000-0000-0000-000000000018');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000019','tomato','vegetable','mass','fridge');
insert into public.ingredient_aliases values ('tomatoes','60000000-0000-0000-0000-000000000019');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000020','courgette','vegetable','count','fridge');
insert into public.ingredient_aliases values ('courgettes','60000000-0000-0000-0000-000000000020');
insert into public.ingredient_aliases values ('zucchini','60000000-0000-0000-0000-000000000020');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000021','lime','fruit','count','fridge');
insert into public.ingredient_aliases values ('limes','60000000-0000-0000-0000-000000000021');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000022','lemon','fruit','count','fridge');
insert into public.ingredient_aliases values ('lemons','60000000-0000-0000-0000-000000000022');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000023','basmati rice','grain','mass','cupboard');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000024','brown rice','grain','mass','cupboard');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000025','pasta','grain','mass','cupboard');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000026','tortilla','bakery','count','cupboard');
insert into public.ingredient_aliases values ('tortillas','60000000-0000-0000-0000-000000000026');
insert into public.ingredient_aliases values ('wraps','60000000-0000-0000-0000-000000000026');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000027','chickpeas','pulse','mass','cupboard');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000028','chopped tomatoes','tinned','mass','cupboard');
insert into public.ingredient_aliases values ('tinned tomatoes','60000000-0000-0000-0000-000000000028');
insert into public.ingredient_aliases values ('canned tomatoes','60000000-0000-0000-0000-000000000028');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000029','coconut milk','tinned','volume','cupboard');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000030','olive oil','staple','volume','cupboard');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000031','salt','staple','mass','cupboard');
insert into public.ingredients values ('60000000-0000-0000-0000-000000000032','black pepper','staple','mass','cupboard');
