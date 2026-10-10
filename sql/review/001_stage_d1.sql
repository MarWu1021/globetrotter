-- D1 REVIEW ONLY. Not applied. Run ONLY after separate D2 authorization.
-- Requires Supabase auth.users/auth.uid(), built-in gen_random_uuid().
-- Intentionally fails if tables already exist: no destructive reset or blind overwrite.
begin;

create function public.d1_valid_trip(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare n integer; i integer; s jsonb; a jsonb; l jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' or p->>'status' is distinct from 'completed'
    or jsonb_typeof(p->'id') is distinct from 'string' or length(p->>'id') not between 1 and 250
    or jsonb_typeof(p->'title') is distinct from 'string' or length(p->>'title') > 200
    or jsonb_typeof(p->'stops') is distinct from 'array' or jsonb_typeof(p->'legs') is distinct from 'array'
    or octet_length(p::text) > 2000000 then return false; end if;
  n := jsonb_array_length(p->'stops');
  if n not between 2 and 100 or jsonb_array_length(p->'legs') <> n-1 then return false; end if;
  for i in 0..n-1 loop
    s := p->'stops'->i; a := s->'airport';
    if jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(s->'id') is distinct from 'string'
      or length(s->>'id') not between 1 and 250 or coalesce(s->>'countryPresence','') not in ('visited','transit')
      or jsonb_typeof(a) is distinct from 'object' or a->>'source' is distinct from 'ourairports'
      or jsonb_typeof(a->'id') is distinct from 'string' or length(a->>'id') not between 1 and 250
      or coalesce(a->>'sourceId','') !~ '^[0-9]+$' or coalesce(a->>'isoCountryCode','') !~ '^[A-Z]{2}$'
      or jsonb_typeof(a->'latitude') is distinct from 'number' or jsonb_typeof(a->'longitude') is distinct from 'number'
      then return false; end if;
    if (a->>'latitude')::numeric not between -90 and 90 or (a->>'longitude')::numeric not between -180 and 180 then return false; end if;
  end loop;
  if (select count(distinct v->>'id') from jsonb_array_elements(p->'stops') v) <> n then return false; end if;
  for i in 0..n-2 loop
    l := p->'legs'->i;
    if jsonb_typeof(l) is distinct from 'object' or jsonb_typeof(l->'id') is distinct from 'string'
      or length(l->>'id') not between 1 and 250
      or l->>'fromStopId' is distinct from p->'stops'->i->>'id'
      or l->>'toStopId' is distinct from p->'stops'->(i+1)->>'id' then return false; end if;
    if exists (select 1 from jsonb_each(l) e where e.key in ('date','airline','flightNumber','notes')
      and (jsonb_typeof(e.value) <> 'string' or length(e.value #>> '{}') > case when e.key='notes' then 2000 when e.key='date' then 10 else 200 end)) then return false; end if;
  end loop;
  return (select count(distinct v->>'id') from jsonb_array_elements(p->'legs') v) = n-1;
exception when others then return false;
end $$;

create table public.trips (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 250),
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
  geo_id text not null check (length(geo_id) between 1 and 250),
  status text check (status in ('visited','wishlist','blocked')),
  notes text not null default '' check (length(notes) <= 20000),
  review jsonb not null default '{}' check (jsonb_typeof(review) = 'object' and octet_length(review::text) <= 50000),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  last_mutation_id uuid not null,
  last_expected_revision bigint,
  last_operation text not null default 'save' check (last_operation in ('save','delete')),
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
    if old.deleted_at is not null or new.revision <> old.revision+1
      or new.last_expected_revision is distinct from old.revision or new.last_mutation_id = old.last_mutation_id then
      raise exception 'revision conflict' using errcode='40001'; end if;
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
revoke all on function public.d1_valid_trip(jsonb) from public, anon;
grant execute on function public.d1_valid_trip(jsonb) to authenticated;
revoke all on function public.d1_guard_revision() from public, anon, authenticated;

-- One transaction/row lock; replay accepts ONLY the exact same request and payload.
create function public.d1_write_trip(p_id text, p_payload jsonb, p_expected_revision bigint, p_mutation_id uuid)
returns public.trips language plpgsql security invoker set search_path = '' as $$
declare r public.trips; uid uuid := auth.uid(); op text;
begin
  if uid is null then raise exception 'login required' using errcode='42501'; end if;
  if p_mutation_id is null then raise exception 'request id required' using errcode='23514'; end if;
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
  if p_mutation_id is null or p_delete is null then raise exception 'invalid request' using errcode='23514'; end if;
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
commit;
