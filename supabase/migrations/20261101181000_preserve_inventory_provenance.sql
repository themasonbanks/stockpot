-- Initial ledger confidence remains available after later corrections.
create or replace function private.inventory_lot_json(target_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',l.id,'householdId',l.household_id,'ingredient',private.inventory_ingredient_json(l.ingredient_id),'quantityBase',coalesce((select sum(t.quantity_delta_base) from public.inventory_transactions t where t.lot_id=l.id),0),'originalQuantityBase',l.original_quantity_base,'originalConfidence',(select t.confidence from public.inventory_transactions t where t.lot_id=l.id and t.source_type='manual_add' order by t.occurred_at,t.id limit 1),'measurementType',l.measurement_type,'storageLocation',l.storage_location,'confidence',l.confidence,'expiryDate',l.expiry_date,'expiryKind',l.expiry_kind,'expirySource',l.expiry_source,'frozenAt',l.frozen_at,'createdAt',l.created_at,'version',l.version,'note',l.note) from public.inventory_lots l where l.id=target_id;
$$;

-- Recording existing freezer stock does not establish when it was frozen.
create or replace function private.mutate_inventory(target_household_id uuid, operation text, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
   values(target_household_id,item.id,amount,original_amount,unit,measure,storage,certainty,expiry,expiry_kind,case when expiry is null then null when expiry_kind='estimated' then 'user_estimate' else 'packaging' end,null,caller,note) returning * into lot;
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

-- Remove timestamps inferred by the earlier addition path, retaining explicit freeze events.
update public.inventory_lots l set frozen_at=null
where l.frozen_at is not null and l.storage_location='freezer'
  and not exists(select 1 from public.inventory_transactions t where t.lot_id=l.id and t.source_type='freeze');
