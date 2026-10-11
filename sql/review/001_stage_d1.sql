-- D3 REVIEW DRAFT ONLY. Not applied; separate database execution approval required.
-- Requires Supabase auth.users/auth.uid(). Built-in PostgreSQL functions only.
-- Fails if names already exist; no reset, migration of browser data, or overwrite.
begin;

-- Match JavaScript string.length (UTF-16 units), including emoji in notes/names.
create function public.d1_utf16_length(t text) returns integer
language sql immutable strict set search_path = '' as $$
  select length(t) + count(*)::integer from regexp_split_to_table(t,'') c where ascii(c) > 65535
$$;
create function public.d1_json_text(v jsonb, max_units integer, identity_required boolean default false, nullable boolean default false)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if v is null then return false; end if;
  if nullable and v = 'null'::jsonb then return true; end if;
  if jsonb_typeof(v) <> 'string' then return false; end if;
  return public.d1_utf16_length(v #>> '{}') <= max_units and
    (not identity_required or (v #>> '{}') collate "C" ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]');
end $$;
-- Empty optional flight dates are valid; nonempty dates must be real Gregorian dates.
-- Arithmetic also supports year 0000, as the existing JavaScript ISO date validator does.
create function public.d1_valid_date(t text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare y integer; m integer; d integer; days integer;
begin
  if t is null then return false; end if;
  if t = '' then return true; end if;
  if t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
  y := substring(t,1,4)::integer; m := substring(t,6,2)::integer; d := substring(t,9,2)::integer;
  if m not between 1 and 12 then return false; end if;
  days := (array[31,28,31,30,31,30,31,31,30,31,30,31])[m];
  if m=2 and y%4=0 and (y%100<>0 or y%400=0) then days := 29; end if;
  return d between 1 and days;
end $$;
create function public.d1_valid_timestamp(v jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare t text;
begin
  if not public.d1_json_text(v,40) then return false; end if;
  t := v #>> '{}';
  if t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$' then return false; end if;
  return public.d1_valid_date(substring(t,1,10)) and substring(t,12,2)::integer between 0 and 23
    and substring(t,15,2)::integer between 0 and 59 and substring(t,18,2)::integer between 0 and 59;
end $$;
create function public.d1_valid_airport_revision(a jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(a) is distinct from 'object' then return false; end if;
  if not public.d1_valid_timestamp(a->'updatedAt') or not public.d1_json_text(a->'name',250,true)
    or not public.d1_json_text(a->'ident',250,true) or not public.d1_json_text(a->'city',2000,false,true)
    or not public.d1_json_text(a->'iata',3,false,true) or not public.d1_json_text(a->'icao',4,false,true)
    or not public.d1_json_text(a->'isoCountryCode',2,false,true)
    or jsonb_typeof(a->'latitude') is distinct from 'number' or jsonb_typeof(a->'longitude') is distinct from 'number' then return false; end if;
  return (a->'iata'='null'::jsonb or a->>'iata' ~ '^[A-Z0-9]{3}$')
    and (a->'icao'='null'::jsonb or a->>'icao' ~ '^[A-Z0-9]{4}$')
    and (a->'isoCountryCode'='null'::jsonb or a->>'isoCountryCode' ~ '^[A-Z]{2}$')
    and (a->>'latitude')::numeric between -90 and 90 and (a->>'longitude')::numeric between -180 and 180;
end $$;
create function public.d1_valid_airport(a jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare h jsonb;
begin
  if not public.d1_valid_airport_revision(a) then return false; end if;
  if not public.d1_json_text(a->'id',250,true) or a->>'source' is distinct from 'ourairports'
    or not public.d1_json_text(a->'sourceId',20) or a->>'sourceId' !~ '^[0-9]+$'
    or not public.d1_json_text(a->'sourceCountryCode',3) or not public.d1_json_text(a->'type',250,true)
    or jsonb_typeof(a->'scheduledService') is distinct from 'boolean' or jsonb_typeof(a->'closed') is distinct from 'boolean'
    or jsonb_typeof(a->'retired') is distinct from 'boolean' or jsonb_typeof(a->'aliases') is distinct from 'array'
    or jsonb_typeof(a->'history') is distinct from 'array' or not public.d1_json_text(a->'keywords',10000)
    or not public.d1_json_text(a->'wikipedia',2000,false,true) then return false; end if;
  if jsonb_array_length(a->'aliases') > 100 or jsonb_array_length(a->'history') > 100 then return false; end if;
  if exists(select 1 from jsonb_array_elements(a->'aliases') v where not public.d1_json_text(v,2000)) then return false; end if;
  -- Frozen from airport-catalog/countries.json: approved mappings only, TW retained.
  -- Overseas/special/non-ISO areas remain pending. Static tests detect mapping drift.
  if a->'isoCountryCode'='null'::jsonb or upper(a->>'sourceCountryCode') is distinct from a->>'isoCountryCode'
    or a->>'isoCountryCode' <> all(array['AD','AE','AF','AG','AL','AM','AO','AR','AT','AU','AZ','BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BN','BO','BR','BS','BT','BW','BY','BZ','CA','CD','CF','CG','CH','CI','CL','CM','CN','CO','CR','CU','CV','CY','CZ','DE','DJ','DK','DM','DO','DZ','EC','EE','EG','ER','ES','ET','FI','FJ','FM','FR','GA','GB','GD','GE','GH','GM','GN','GQ','GR','GT','GW','GY','HN','HR','HT','HU','ID','IE','IL','IN','IQ','IR','IS','IT','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MG','MH','MK','ML','MM','MN','MR','MT','MU','MV','MW','MX','MY','MZ','NA','NE','NG','NI','NL','NO','NP','NR','NZ','OM','PA','PE','PG','PH','PK','PL','PT','PW','PY','QA','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SI','SK','SL','SM','SN','SO','SR','SS','ST','SV','SY','SZ','TD','TG','TH','TJ','TL','TM','TN','TO','TR','TT','TV','TW','TZ','UA','UG','US','UY','UZ','VA','VC','VE','VN','VU','WS','YE','ZA','ZM','ZW']) then return false; end if;
  for h in select value from jsonb_array_elements(a->'history') loop
    if not public.d1_valid_airport_revision(h) or h->'isoCountryCode' is distinct from a->'isoCountryCode' then return false; end if;
  end loop;
  return true;
end $$;
create function public.d1_valid_trip(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare n integer; i integer; s jsonb; a jsonb; l jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' or p->>'status' is distinct from 'completed'
    or not public.d1_json_text(p->'id',250,true) or not public.d1_json_text(p->'title',200)
    or jsonb_typeof(p->'stops') is distinct from 'array' or jsonb_typeof(p->'legs') is distinct from 'array'
    or octet_length(p::text) > 2000000 then return false; end if;
  n := jsonb_array_length(p->'stops');
  if n not between 2 and 100 or jsonb_array_length(p->'legs') <> n-1 then return false; end if;
  for i in 0..n-1 loop
    s := p->'stops'->i; a := s->'airport';
    if jsonb_typeof(s) is distinct from 'object' or not public.d1_json_text(s->'id',250,true)
      or coalesce(s->>'countryPresence','') not in ('visited','transit') or not public.d1_valid_airport(a) then return false; end if;
    if i>0 and a->>'id' = p->'stops'->(i-1)->'airport'->>'id' then return false; end if;
  end loop;
  if (select count(distinct v->>'id') from jsonb_array_elements(p->'stops') v) <> n then return false; end if;
  -- Distinct airport IDs must not alias the same source identity (TypeScript validateAirports).
  if exists(select 1 from jsonb_array_elements(p->'stops') v group by v->'airport'->>'sourceId'
    having count(distinct v->'airport'->>'id') > 1) then return false; end if;
  for i in 0..n-2 loop
    l := p->'legs'->i;
    if jsonb_typeof(l) is distinct from 'object' or not public.d1_json_text(l->'id',250,true)
      or not public.d1_json_text(l->'fromStopId',250,true) or not public.d1_json_text(l->'toStopId',250,true)
      or l->>'fromStopId' is distinct from p->'stops'->i->>'id'
      or l->>'toStopId' is distinct from p->'stops'->(i+1)->>'id' then return false; end if;
    if exists(select 1 from jsonb_each(l) e where e.key in ('date','airline','flightNumber','notes')
      and not public.d1_json_text(e.value,case when e.key='notes' then 2000 when e.key='date' then 10 else 200 end)) then return false; end if;
    if l ? 'date' and not public.d1_valid_date(l->>'date') then return false; end if;
  end loop;
  return (select count(distinct v->>'id') from jsonb_array_elements(p->'legs') v) = n-1;
exception when others then return false;
end $$;

create table public.trips (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (public.d1_json_text(to_jsonb(id),250,true)),
  payload jsonb not null check (public.d1_valid_trip(payload)) check (payload->>'id' = id),
  schema_version integer not null default 1 check (schema_version = 1),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  last_mutation_id uuid not null,
  last_expected_revision bigint,
  last_operation text not null default 'save' check (last_operation in ('save','delete')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (updated_at >= created_at),
  check (deleted_at is null or deleted_at >= created_at),
  primary key (user_id,id)
);
create index trips_active_updated on public.trips(user_id,updated_at desc) where deleted_at is null;

create table public.country_records (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  geo_id text not null check (public.d1_json_text(to_jsonb(geo_id),250,true)),
  status text check (status in ('visited','wishlist','blocked')),
  notes text not null default '' check (length(notes) <= 20000),
  review jsonb not null default '{}' check (jsonb_typeof(review) = 'object' and octet_length(review::text) <= 50000),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  last_mutation_id uuid not null,
  last_expected_revision bigint,
  last_operation text not null default 'save' check (last_operation in ('save','delete','restore')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (updated_at >= created_at),
  check (deleted_at is null or deleted_at >= created_at),
  primary key (user_id,geo_id)
);
create index country_records_active on public.country_records(user_id,updated_at desc) where deleted_at is null;

-- All writers (including direct REST calls) must supply a matching prior revision.
create function public.d1_guard_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.revision <> 1 or new.last_expected_revision is not null or new.deleted_at is not null or new.last_operation <> 'save' then
      raise exception 'invalid initial revision' using errcode='23514'; end if;
    new.created_at := now(); new.updated_at := new.created_at;
  else
    if new.user_id <> old.user_id or new.created_at <> old.created_at
      or (tg_table_name='trips' and to_jsonb(new)->>'id' is distinct from to_jsonb(old)->>'id')
      or (tg_table_name='country_records' and to_jsonb(new)->>'geo_id' is distinct from to_jsonb(old)->>'geo_id') then
      raise exception 'immutable identity' using errcode='23514'; end if;
    if new.revision <> old.revision+1
      or new.last_expected_revision is distinct from old.revision or new.last_mutation_id = old.last_mutation_id then
      raise exception 'revision conflict' using errcode='40001'; end if;
    if old.deleted_at is not null then
      if tg_table_name <> 'country_records' or new.last_operation <> 'restore' or new.deleted_at is not null then
        raise exception 'deleted record requires explicit country restore' using errcode='40001'; end if;
      if to_jsonb(new)->'status' is distinct from to_jsonb(old)->'status'
        or to_jsonb(new)->'notes' is distinct from to_jsonb(old)->'notes'
        or to_jsonb(new)->'review' is distinct from to_jsonb(old)->'review' then
        raise exception 'restore must retain deleted content' using errcode='23514'; end if;
    elsif new.last_operation = 'restore' then
      raise exception 'only tombstones can be restored' using errcode='40001';
    end if;
    new.updated_at := greatest(now(),old.updated_at);
  end if;
  if new.last_operation = 'delete' then new.deleted_at := new.updated_at;
  elsif new.deleted_at is not null then raise exception 'invalid deletion' using errcode='23514'; end if;
  return new;
end $$;
create trigger trips_revision before insert or update on public.trips for each row execute function public.d1_guard_revision();
create trigger country_records_revision before insert or update on public.country_records for each row execute function public.d1_guard_revision();

alter table public.trips enable row level security;
alter table public.trips force row level security;
alter table public.country_records enable row level security;
alter table public.country_records force row level security;
create policy trips_read on public.trips for select to authenticated using ((select auth.uid()) = user_id);
create policy trips_insert on public.trips for insert to authenticated with check ((select auth.uid()) = user_id);
create policy trips_update on public.trips for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy countries_read on public.country_records for select to authenticated using ((select auth.uid()) = user_id);
create policy countries_insert on public.country_records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy countries_update on public.country_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- Application deletion is a revision-checked tombstone UPDATE. Hard DELETE not granted.
revoke all on public.trips, public.country_records from public, anon, authenticated;
grant select,insert,update on public.trips, public.country_records to authenticated;
revoke all on function public.d1_utf16_length(text) from public, anon;
grant execute on function public.d1_utf16_length(text) to authenticated;
revoke all on function public.d1_json_text(jsonb,integer,boolean,boolean) from public, anon;
grant execute on function public.d1_json_text(jsonb,integer,boolean,boolean) to authenticated;
revoke all on function public.d1_valid_date(text) from public, anon;
grant execute on function public.d1_valid_date(text) to authenticated;
revoke all on function public.d1_valid_timestamp(jsonb) from public, anon;
grant execute on function public.d1_valid_timestamp(jsonb) to authenticated;
revoke all on function public.d1_valid_airport_revision(jsonb) from public, anon;
grant execute on function public.d1_valid_airport_revision(jsonb) to authenticated;
revoke all on function public.d1_valid_airport(jsonb) from public, anon;
grant execute on function public.d1_valid_airport(jsonb) to authenticated;
revoke all on function public.d1_valid_trip(jsonb) from public, anon;
grant execute on function public.d1_valid_trip(jsonb) to authenticated;
revoke all on function public.d1_guard_revision() from public, anon, authenticated;

-- One transaction/row lock; replay accepts ONLY the exact same request and payload.
create function public.d1_write_trip(p_id text, p_payload jsonb, p_expected_revision bigint, p_mutation_id uuid)
returns public.trips language plpgsql security invoker set search_path = '' as $$
declare r public.trips; uid uuid := auth.uid(); op text;
begin
  if uid is null then raise exception 'login required' using errcode='42501'; end if;
  if p_mutation_id is null or not public.d1_json_text(to_jsonb(p_id),250,true)
    or (p_expected_revision is not null and p_expected_revision not between 1 and 9007199254740991) then
    raise exception 'invalid request' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_id,0));
  op := case when p_payload is null then 'delete' else 'save' end;
  select * into r from public.trips where user_id=uid and id=p_id for update;
  if found then
    if r.last_mutation_id=p_mutation_id then
      if r.last_expected_revision is distinct from p_expected_revision or r.last_operation<>op
        or (op='save' and r.payload is distinct from p_payload) then raise exception 'request reused' using errcode='40001'; end if;
      return r;
    end if;
    if r.deleted_at is not null or r.revision is distinct from p_expected_revision then raise exception 'revision conflict' using errcode='40001'; end if;
    update public.trips set payload=coalesce(p_payload,payload),revision=revision+1,last_mutation_id=p_mutation_id,
      last_expected_revision=p_expected_revision,last_operation=op,deleted_at=case when op='delete' then now() else null end
      where user_id=uid and id=p_id returning * into r;
  else
    if p_expected_revision is not null or op='delete' then raise exception 'revision conflict' using errcode='40001'; end if;
    insert into public.trips(user_id,id,payload,last_mutation_id) values(uid,p_id,p_payload,p_mutation_id) returning * into r;
  end if;
  return r;
end $$;
revoke all on function public.d1_write_trip(text,jsonb,bigint,uuid) from public, anon;
grant execute on function public.d1_write_trip(text,jsonb,bigint,uuid) to authenticated;
create function public.d1_write_country(p_geo_id text, p_status text, p_notes text, p_review jsonb,
  p_delete boolean, p_expected_revision bigint, p_mutation_id uuid)
returns public.country_records language plpgsql security invoker set search_path = '' as $$
declare r public.country_records; uid uuid := auth.uid(); op text;
begin
  if uid is null then raise exception 'login required' using errcode='42501'; end if;
  if p_mutation_id is null or p_delete is null or not public.d1_json_text(to_jsonb(p_geo_id),250,true)
    or (p_expected_revision is not null and p_expected_revision not between 1 and 9007199254740991) then
    raise exception 'invalid request' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':country:' || p_geo_id,0));
  op := case when p_delete then 'delete' else 'save' end;
  select * into r from public.country_records where user_id=uid and geo_id=p_geo_id for update;
  if found then
    if r.last_mutation_id=p_mutation_id then
      if r.last_expected_revision is distinct from p_expected_revision or r.last_operation<>op
        or (not p_delete and (r.status is distinct from p_status or r.notes is distinct from p_notes or r.review is distinct from p_review))
        then raise exception 'request reused' using errcode='40001'; end if;
      return r;
    end if;
    if r.deleted_at is not null or r.revision is distinct from p_expected_revision then raise exception 'revision conflict' using errcode='40001'; end if;
    update public.country_records set status=case when p_delete then status else p_status end,
      notes=case when p_delete then notes else p_notes end,review=case when p_delete then review else p_review end,
      revision=revision+1,last_mutation_id=p_mutation_id,last_expected_revision=p_expected_revision,last_operation=op,
      deleted_at=case when p_delete then now() else null end where user_id=uid and geo_id=p_geo_id returning * into r;
  else
    if p_expected_revision is not null or p_delete then raise exception 'revision conflict' using errcode='40001'; end if;
    insert into public.country_records(user_id,geo_id,status,notes,review,last_mutation_id)
      values(uid,p_geo_id,p_status,p_notes,p_review,p_mutation_id) returning * into r;
  end if;
  return r;
end $$;
revoke all on function public.d1_write_country(text,text,text,jsonb,boolean,bigint,uuid) from public, anon;
grant execute on function public.d1_write_country(text,text,text,jsonb,boolean,bigint,uuid) to authenticated;

-- Explicit owner-only restoration of a COUNTRY tombstone, preserving its content.
-- Save/delete RPCs never restore; trips have no restoration operation or RPC.
create function public.d1_restore_country(p_geo_id text, p_expected_revision bigint, p_mutation_id uuid)
returns public.country_records language plpgsql security invoker set search_path = '' as $$
declare r public.country_records; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'login required' using errcode='42501'; end if;
  if p_mutation_id is null or not public.d1_json_text(to_jsonb(p_geo_id),250,true)
    or p_expected_revision is null or p_expected_revision not between 1 and 9007199254740991 then
    raise exception 'invalid restore request' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':country:' || p_geo_id,0));
  select * into r from public.country_records where user_id=uid and geo_id=p_geo_id for update;
  if not found then raise exception 'revision conflict' using errcode='40001'; end if;
  if r.last_mutation_id=p_mutation_id then
    if r.last_expected_revision is distinct from p_expected_revision or r.last_operation<>'restore' then
      raise exception 'request reused' using errcode='40001'; end if;
    return r;
  end if;
  if r.deleted_at is null or r.revision is distinct from p_expected_revision then
    raise exception 'revision conflict' using errcode='40001'; end if;
  update public.country_records set revision=revision+1,last_expected_revision=p_expected_revision,
    last_mutation_id=p_mutation_id,last_operation='restore',deleted_at=null
    where user_id=uid and geo_id=p_geo_id returning * into r;
  return r;
end $$;
revoke all on function public.d1_restore_country(text,bigint,uuid) from public, anon;
grant execute on function public.d1_restore_country(text,bigint,uuid) to authenticated;
-- Finalize ONLY this migration's objects after all CREATE FUNCTION/DDL events.
-- Never change global defaults, roles or the existing ensure_rls Event Trigger.
revoke all on public.trips, public.country_records from public, anon, authenticated;
grant select,insert,update on public.trips, public.country_records to authenticated;
-- Table-level REVOKE does not remove independent column ACLs.
-- Keep the loop record distinct from catalog aliases: c.relname must bind to pg_class.
do $$ declare column_acl_row record; begin
  for column_acl_row in select n.nspname,c.relname,a.attname from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid=a.attrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('trips','country_records')
      and a.attnum>0 and not a.attisdropped loop
    execute format('revoke all (%I) on table %I.%I from public, anon, authenticated',column_acl_row.attname,column_acl_row.nspname,column_acl_row.relname);
  end loop;
end $$;
revoke all on function public.d1_utf16_length(text) from public, anon;
grant execute on function public.d1_utf16_length(text) to authenticated;
revoke all on function public.d1_json_text(jsonb,integer,boolean,boolean) from public, anon;
grant execute on function public.d1_json_text(jsonb,integer,boolean,boolean) to authenticated;
revoke all on function public.d1_valid_date(text) from public, anon;
grant execute on function public.d1_valid_date(text) to authenticated;
revoke all on function public.d1_valid_timestamp(jsonb) from public, anon;
grant execute on function public.d1_valid_timestamp(jsonb) to authenticated;
revoke all on function public.d1_valid_airport_revision(jsonb) from public, anon;
grant execute on function public.d1_valid_airport_revision(jsonb) to authenticated;
revoke all on function public.d1_valid_airport(jsonb) from public, anon;
grant execute on function public.d1_valid_airport(jsonb) to authenticated;
revoke all on function public.d1_valid_trip(jsonb) from public, anon;
grant execute on function public.d1_valid_trip(jsonb) to authenticated;
revoke all on function public.d1_guard_revision() from public, anon, authenticated;
revoke all on function public.d1_write_trip(text,jsonb,bigint,uuid) from public, anon;
grant execute on function public.d1_write_trip(text,jsonb,bigint,uuid) to authenticated;
revoke all on function public.d1_write_country(text,text,text,jsonb,boolean,bigint,uuid) from public, anon;
grant execute on function public.d1_write_country(text,text,text,jsonb,boolean,bigint,uuid) to authenticated;
revoke all on function public.d1_restore_country(text,bigint,uuid) from public, anon;
grant execute on function public.d1_restore_country(text,bigint,uuid) to authenticated;
-- Fail closed before COMMIT. Catalog/privilege checks do not insert test data.
-- Any exception aborts the entire initial-schema transaction, including Event Trigger DDL.
do $$
declare
  role_name text; privilege_name text; table_name text; oid_table oid;
  client_role record; reachable_role record; expected record; policy_row record; function_row record;
  qual_text text; check_text text;
  denied text[] := array['DELETE','TRUNCATE','REFERENCES','TRIGGER'];
begin
  if current_setting('server_version_num')::integer >= 170000 then denied := array_append(denied,'MAINTAIN'); end if;
  foreach role_name in array array['anon','authenticated'] loop
    select * into client_role from pg_catalog.pg_roles where rolname=role_name;
    if not found or client_role.rolsuper or client_role.rolbypassrls then
      raise exception 'unsafe or missing client role: %',role_name;
    end if;
    -- Check membership too: NOINHERIT membership may still permit SET ROLE.
    if exists(select 1 from pg_catalog.pg_roles admin_role
      where (admin_role.rolsuper or admin_role.rolbypassrls or admin_role.rolname in ('postgres','supabase_admin','service_role'))
        and pg_catalog.pg_has_role(client_role.oid,admin_role.oid,'MEMBER')) then
      raise exception 'client role belongs to an administrative role: %',role_name;
    end if;
    foreach table_name in array array['trips','country_records'] loop
      select c.oid into oid_table from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname=table_name and c.relkind='r'
          and c.relrowsecurity and c.relforcerowsecurity
          and not pg_catalog.pg_has_role(client_role.oid,c.relowner,'MEMBER');
      if not found then raise exception 'missing RLS or unsafe owner: %',table_name; end if;
      foreach privilege_name in array array['SELECT','INSERT','UPDATE'] loop
        if pg_catalog.has_table_privilege(client_role.oid,oid_table,privilege_name) is distinct from (role_name='authenticated') then
          raise exception 'unexpected effective table privilege: % % %',role_name,table_name,privilege_name;
        end if;
        if pg_catalog.has_table_privilege(client_role.oid,oid_table,privilege_name||' WITH GRANT OPTION')
          or pg_catalog.has_any_column_privilege(client_role.oid,oid_table,privilege_name||' WITH GRANT OPTION') then
          raise exception 'client grant option remains: % % %',role_name,table_name,privilege_name;
        end if;
      end loop;
      foreach privilege_name in array denied loop
        if pg_catalog.has_table_privilege(client_role.oid,oid_table,privilege_name) then
          raise exception 'dangerous effective privilege: % % %',role_name,table_name,privilege_name;
        end if;
      end loop;
      -- Effective helpers include INHERIT. Also reject dangerous grants reachable
      -- through NOINHERIT memberships that could be exercised by SET ROLE.
      for reachable_role in select r.oid,r.rolname from pg_catalog.pg_roles r
        where r.oid<>client_role.oid and pg_catalog.pg_has_role(client_role.oid,r.oid,'MEMBER') loop
        foreach privilege_name in array denied loop
          if pg_catalog.has_table_privilege(reachable_role.oid,oid_table,privilege_name) then
            raise exception 'dangerous SET ROLE privilege: % via % % %',role_name,reachable_role.rolname,table_name,privilege_name;
          end if;
        end loop;
        foreach privilege_name in array array['SELECT','INSERT','UPDATE'] loop
          if pg_catalog.has_table_privilege(reachable_role.oid,oid_table,privilege_name||' WITH GRANT OPTION')
            or pg_catalog.has_any_column_privilege(reachable_role.oid,oid_table,privilege_name||' WITH GRANT OPTION') then
            raise exception 'SET ROLE grant option: % via % % %',role_name,reachable_role.rolname,table_name,privilege_name;
          end if;
        end loop;
        if pg_catalog.has_any_column_privilege(reachable_role.oid,oid_table,'REFERENCES') then
          raise exception 'SET ROLE column REFERENCES: % via % %',role_name,reachable_role.rolname,table_name;
        end if;
        if role_name='anon' and (pg_catalog.has_any_column_privilege(reachable_role.oid,oid_table,'SELECT')
          or pg_catalog.has_any_column_privilege(reachable_role.oid,oid_table,'INSERT')
          or pg_catalog.has_any_column_privilege(reachable_role.oid,oid_table,'UPDATE')) then
          raise exception 'anonymous SET ROLE data privilege: % %',reachable_role.rolname,table_name;
        end if;
      end loop;
      foreach privilege_name in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
        if pg_catalog.has_any_column_privilege(client_role.oid,oid_table,privilege_name)
          is distinct from (role_name='authenticated' and privilege_name<>'REFERENCES') then
          raise exception 'unexpected effective column privilege: % % %',role_name,table_name,privilege_name;
        end if;
      end loop;
      if exists(select 1 from pg_catalog.pg_class c cross join lateral pg_catalog.aclexplode(c.relacl) a
        where c.oid=oid_table and a.grantee=0)
        or exists(select 1 from pg_catalog.pg_attribute c cross join lateral pg_catalog.aclexplode(c.attacl) a
          where c.attrelid=oid_table and c.attnum>0 and not c.attisdropped and a.grantee=0) then
        raise exception 'PUBLIC ACL remains: %',table_name;
      end if;
      if (select count(*) from pg_catalog.pg_policy where polrelid=oid_table)<>3 then
        raise exception 'unexpected policy count: %',table_name;
      end if;
      if (select count(*) from pg_catalog.pg_trigger where tgrelid=oid_table and not tgisinternal)<>1 then
        raise exception 'unexpected application trigger count: %',table_name;
      end if;
      if not exists(select 1 from pg_catalog.pg_trigger where tgrelid=oid_table
        and tgname=case when table_name='trips' then 'trips_revision' else 'country_records_revision' end
        and tgfoid='public.d1_guard_revision()'::regprocedure and tgtype=23
        and tgenabled in ('O','A') and not tgisinternal and tgqual is null and tgnargs=0) then
        raise exception 'missing or unsafe revision trigger: %',table_name;
      end if;
    end loop;
  end loop;
  for expected in select * from (values
    ('trips','trips_read','r'),('trips','trips_insert','a'),('trips','trips_update','w'),
    ('country_records','countries_read','r'),('country_records','countries_insert','a'),('country_records','countries_update','w')
  ) e(table_name,policy_name,command) loop
    select p.* into policy_row from pg_catalog.pg_policy p
      where p.polrelid=format('public.%I',expected.table_name)::regclass and p.polname=expected.policy_name;
    if not found or policy_row.polcmd::text<>expected.command or not policy_row.polpermissive
      or policy_row.polroles is distinct from array[(select oid from pg_catalog.pg_roles where rolname='authenticated')]::oid[] then
      raise exception 'unexpected policy scope: %',expected.policy_name;
    end if;
    -- Compare the deparsed expression, not merely policy names/counts.
    -- Removing parentheses/whitespace leaves the exact scalar auth.uid() owner check.
    qual_text := regexp_replace(pg_catalog.pg_get_expr(policy_row.polqual,policy_row.polrelid),'[[:space:]()]','','g');
    check_text := regexp_replace(pg_catalog.pg_get_expr(policy_row.polwithcheck,policy_row.polrelid),'[[:space:]()]','','g');
    if (expected.command in ('r','w') and qual_text is distinct from 'SELECTauth.uidASuid=user_id')
      or (expected.command='a' and policy_row.polqual is not null)
      or (expected.command in ('a','w') and check_text is distinct from 'SELECTauth.uidASuid=user_id')
      or (expected.command='r' and policy_row.polwithcheck is not null) then
      raise exception 'unexpected policy predicate: %',expected.policy_name;
    end if;
  end loop;
  for expected in select * from (values
    ('public.d1_utf16_length(text)',true),('public.d1_json_text(jsonb,integer,boolean,boolean)',true),
    ('public.d1_valid_date(text)',true),('public.d1_valid_timestamp(jsonb)',true),
    ('public.d1_valid_airport_revision(jsonb)',true),('public.d1_valid_airport(jsonb)',true),
    ('public.d1_valid_trip(jsonb)',true),('public.d1_guard_revision()',false),
    ('public.d1_write_trip(text,jsonb,bigint,uuid)',true),
    ('public.d1_write_country(text,text,text,jsonb,boolean,bigint,uuid)',true),
    ('public.d1_restore_country(text,bigint,uuid)',true)
  ) e(signature,authenticated_execute) loop
    select * into function_row from pg_catalog.pg_proc where oid=expected.signature::regprocedure;
    if not found or function_row.prosecdef or function_row.proconfig is distinct from array['search_path=""']::text[] then
      raise exception 'unsafe function configuration: %',expected.signature;
    end if;
    if pg_catalog.has_function_privilege('authenticated',function_row.oid,'EXECUTE WITH GRANT OPTION')
      or pg_catalog.has_function_privilege('anon',function_row.oid,'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated',function_row.oid,'EXECUTE') is distinct from expected.authenticated_execute
      or exists(select 1 from pg_catalog.aclexplode(coalesce(function_row.proacl,pg_catalog.acldefault('f',function_row.proowner))) a where a.grantee=0) then
      raise exception 'unsafe effective function ACL: %',expected.signature;
    end if;
    foreach role_name in array array['anon','authenticated'] loop
      select * into client_role from pg_catalog.pg_roles where rolname=role_name;
      if pg_catalog.pg_has_role(client_role.oid,function_row.proowner,'MEMBER') then
        raise exception 'unsafe client function owner membership: % %',role_name,expected.signature;
      end if;
      for reachable_role in select r.oid,r.rolname from pg_catalog.pg_roles r
        where r.oid<>client_role.oid and pg_catalog.pg_has_role(client_role.oid,r.oid,'MEMBER') loop
        if pg_catalog.has_function_privilege(reachable_role.oid,function_row.oid,'EXECUTE WITH GRANT OPTION')
          or ((role_name='anon' or not expected.authenticated_execute)
            and pg_catalog.has_function_privilege(reachable_role.oid,function_row.oid,'EXECUTE')) then
          raise exception 'unsafe SET ROLE function privilege: % via % %',role_name,reachable_role.rolname,expected.signature;
        end if;
      end loop;
    end loop;
  end loop;
  if not pg_catalog.has_schema_privilege('authenticated','public','USAGE')
    or not pg_catalog.has_schema_privilege('authenticated','auth','USAGE')
    or not pg_catalog.has_function_privilege('authenticated','auth.uid()','EXECUTE') then
    raise exception 'missing authenticated schema/Auth prerequisite';
  end if;
end $$;
commit;
