-- D3 REVIEW DRAFT ONLY. NOT RUN. Separate database execution approval required.
-- Use globetrotter-dev and TWO EMPTY dedicated TEST Auth accounts. Never production users.
-- Replace the three configuration placeholders. UUIDs are public user IDs, NOT tokens.
-- Run this WHOLE file in ONE SQL Editor session (privileged setup, then SET LOCAL ROLE).
-- SQL Editor setup privilege is not evidence of RLS; every application operation below
-- executes as authenticated/anon, with row_security=on and role bypass checks.
-- All fixtures roll back. Do not split the file, add COMMIT, or retry with RLS disabled.
-- Real multi-connection races are NOT tested here; see docs/stage-d3/sql-review.md.
begin;
set local row_security = on;
set local "d1.user_a" = 'REPLACE_WITH_DEDICATED_TEST_USER_A_UUID';
set local "d1.user_b" = 'REPLACE_WITH_DEDICATED_TEST_USER_B_UUID';
set local "d1.test_accounts_confirmed" = 'REPLACE_WITH_YES_DEDICATED_TEST_ACCOUNTS';
do $$ begin
  if current_setting('d1.test_accounts_confirmed') <> 'YES_DEDICATED_TEST_ACCOUNTS' then
    raise exception 'confirm two dedicated empty test accounts first'; end if;
  if current_setting('d1.user_a')::uuid = current_setting('d1.user_b')::uuid then raise exception 'need two distinct TEST users'; end if;
  if (select count(*) from auth.users where id in (current_setting('d1.user_a')::uuid,current_setting('d1.user_b')::uuid)) <> 2 then
    raise exception 'test users must already exist'; end if;
  if exists(select 1 from public.trips where user_id in (current_setting('d1.user_a')::uuid,current_setting('d1.user_b')::uuid))
    or exists(select 1 from public.country_records where user_id in (current_setting('d1.user_a')::uuid,current_setting('d1.user_b')::uuid)) then
    raise exception 'test accounts must contain NO application records, including tombstones'; end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('trips','country_records') and c.relrowsecurity and c.relforcerowsecurity) <> 2 then
    raise exception 'both tables must ENABLE and FORCE RLS'; end if;
end $$;
select set_config('d1.test_id','d3-rls-'||gen_random_uuid()::text,true);
select set_config('d1.geo_id',current_setting('d1.test_id')||':country',true);
select set_config('d1.direct_id',current_setting('d1.test_id')||':direct',true);
select set_config('d1.fixture','{"id": "d1-rls-test-trip", "title": "D1 approved future TEST fixture", "status": "completed", "stops": [{"id": "d1-stop-0", "airport": {"id": "6c680516-764d-5349-8dd6-ae4f53d775c1", "source": "ourairports", "sourceId": "5528", "ident": "RCTP", "iata": "TPE", "icao": "RCTP", "name": "Taiwan Taoyuan International Airport", "city": "Taoyuan", "latitude": 25.0777, "longitude": 121.233002, "sourceCountryCode": "TW", "isoCountryCode": "TW", "type": "large_airport", "scheduledService": true, "closed": false, "retired": false, "updatedAt": "2026-10-09T01:53:12Z", "aliases": [], "history": [], "keywords": "Taoyuan County, Dayuan District. 臺灣桃園國際機場", "wikipedia": "https://zh.wikipedia.org/wiki/%E8%87%BA%E7%81%A3%E6%A1%83%E5%9C%92%E5%9C%8B%E9%9A%9B%E6%A9%9F%E5%A0%B4"}, "countryPresence": "visited"}, {"id": "d1-stop-1", "airport": {"id": "2762e834-1cc4-535c-94cb-6752ea32369b", "source": "ourairports", "sourceId": "5235", "ident": "OMDB", "iata": "DXB", "icao": "OMDB", "name": "Dubai International Airport", "city": "Dubai", "latitude": 25.24979, "longitude": 55.370992, "sourceCountryCode": "AE", "isoCountryCode": "AE", "type": "large_airport", "scheduledService": true, "closed": false, "retired": false, "updatedAt": "2026-10-09T01:53:12Z", "aliases": [], "history": [], "keywords": "مطار دبي الدولي‎", "wikipedia": "https://en.wikipedia.org/wiki/Dubai_International_Airport"}, "countryPresence": "transit"}, {"id": "d1-stop-2", "airport": {"id": "8593f7f2-4419-5fc5-8a2a-e2d77c28fec7", "source": "ourairports", "sourceId": "4251", "ident": "LGAV", "iata": "ATH", "icao": "LGAV", "name": "Athens Eleftherios Venizelos International Airport", "city": "Spata-Artemida", "latitude": 37.936401, "longitude": 23.9445, "sourceCountryCode": "GR", "isoCountryCode": "GR", "type": "large_airport", "scheduledService": true, "closed": false, "retired": false, "updatedAt": "2026-10-09T01:53:12Z", "aliases": [], "history": [], "keywords": "", "wikipedia": "https://en.wikipedia.org/wiki/Athens_International_Airport"}, "countryPresence": "visited"}], "legs": [{"id": "d1-leg-0", "fromStopId": "d1-stop-0", "toStopId": "d1-stop-1"}, {"id": "d1-leg-1", "fromStopId": "d1-stop-1", "toStopId": "d1-stop-2"}]}',true);
-- Random namespacing prevents fixed-ID collisions. Airport snapshots are public fixtures.
select set_config('d1.fixture',jsonb_set(replace(current_setting('d1.fixture'),'d1-',current_setting('d1.test_id')||'-')::jsonb,
  '{id}',to_jsonb(current_setting('d1.test_id')))::text,true);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('d1.user_a'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('d1.user_a'),'role','authenticated')::text,true);
do $$ declare tbl text; privilege_name text; begin
  if current_user <> 'authenticated' or current_setting('row_security') <> 'on'
    or exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'test must use constrained authenticated role'; end if;
  foreach tbl in array array['public.trips','public.country_records'] loop
    foreach privilege_name in array array['SELECT','INSERT','UPDATE'] loop
      if not has_table_privilege(current_user,tbl,privilege_name) then
        raise exception 'authenticated table ACL missing % on %',privilege_name,tbl; end if;
    end loop;
    if has_table_privilege(current_user,tbl,'DELETE') then raise exception 'hard DELETE grant leaked'; end if;
  end loop;
  if not has_function_privilege(current_user,'public.d1_restore_country(text,bigint,uuid)','EXECUTE') then
    raise exception 'authenticated restore RPC missing'; end if;
end $$;

-- These are PREPARED PostgreSQL validation tests, not results from static checks.
do $$ declare label text; bad jsonb; begin
  if not public.d1_valid_trip(current_setting('d1.fixture')::jsonb) then raise exception 'valid TPE-DXB-ATH fixture rejected'; end if;
  if not public.d1_valid_trip(jsonb_set(current_setting('d1.fixture')::jsonb,'{legs,0,date}','""'))
    or not public.d1_valid_trip(jsonb_set(current_setting('d1.fixture')::jsonb,'{legs,0,date}','"2024-02-29"')) then
    raise exception 'optional blank / real leap date rejected'; end if;
  if not public.d1_valid_trip(jsonb_set(current_setting('d1.fixture')::jsonb,'{stops,0,airport,iata}','null')) then raise exception 'nullable IATA rejected'; end if;
  if public.d1_utf16_length('旅行😀') <> 4 or public.d1_json_text(to_jsonb(E' \t\n'),250,true) then
    raise exception 'JS string/identity contract mismatch'; end if;
  if public.d1_valid_date('1900-02-29') or public.d1_valid_date('2100-02-29')
    or not public.d1_valid_date('2000-02-29') or not public.d1_valid_date('0000-02-29') then
    raise exception 'Gregorian leap year contract mismatch'; end if;
  for label,bad in select * from (values
      ('missing airport name', current_setting('d1.fixture')::jsonb #- '{stops,0,airport,name}'),
      ('missing source country', current_setting('d1.fixture')::jsonb #- '{stops,0,airport,sourceCountryCode}'),
      ('numeric source ID', jsonb_set(current_setting('d1.fixture')::jsonb,'{stops,0,airport,sourceId}','5528')),
      ('invalid IATA', jsonb_set(current_setting('d1.fixture')::jsonb,'{stops,0,airport,iata}','"TP"')),
      ('invalid ICAO', jsonb_set(current_setting('d1.fixture')::jsonb,'{stops,0,airport,icao}','"RCT"')),
      ('invalid coordinate', jsonb_set(current_setting('d1.fixture')::jsonb,'{stops,0,airport,latitude}','91')),
      ('invalid timestamp', jsonb_set(current_setting('d1.fixture')::jsonb,'{stops,0,airport,updatedAt}','"2026-02-30T01:53:12Z"')),
      ('country mismatch', jsonb_set(current_setting('d1.fixture')::jsonb,'{stops,0,airport,sourceCountryCode}','"CN"')),
      ('unknown ISO', jsonb_set(jsonb_set(current_setting('d1.fixture')::jsonb,'{stops,0,airport,sourceCountryCode}','"ZZ"'),'{stops,0,airport,isoCountryCode}','"ZZ"')),
      ('pending territory', jsonb_set(jsonb_set(current_setting('d1.fixture')::jsonb,'{stops,0,airport,sourceCountryCode}','"AQ"'),'{stops,0,airport,isoCountryCode}','"AQ"')),
      ('non-string alias', jsonb_set(current_setting('d1.fixture')::jsonb,'{stops,0,airport,aliases}','[123]')),
      ('incomplete history', jsonb_set(current_setting('d1.fixture')::jsonb,'{stops,0,airport,history}','[{}]')),
      ('missing boolean', current_setting('d1.fixture')::jsonb #- '{stops,0,airport,closed}'),
      ('nonexistent date', jsonb_set(current_setting('d1.fixture')::jsonb,'{legs,0,date}','"2026-02-30"')),
      ('null optional field', jsonb_set(current_setting('d1.fixture')::jsonb,'{legs,0,airline}','null')),
      ('wrong adjacency', jsonb_set(current_setting('d1.fixture')::jsonb,'{legs,0,toStopId}','"unknown-stop"')),
      ('duplicate leg ID', jsonb_set(current_setting('d1.fixture')::jsonb,'{legs,1,id}',current_setting('d1.fixture')::jsonb->'legs'->0->'id')),
      ('same-airport adjacent', jsonb_set(current_setting('d1.fixture')::jsonb,'{stops,1,airport}',current_setting('d1.fixture')::jsonb->'stops'->0->'airport')),
      ('uncompleted', jsonb_set(current_setting('d1.fixture')::jsonb,'{status}','"planned"')),
      ('blank identity', jsonb_set(current_setting('d1.fixture')::jsonb,'{id}','"   "'))
    ) cases(label,bad) loop
    if public.d1_valid_trip(bad) then raise exception 'invalid fixture accepted: %',label; end if;
  end loop;
end $$;

-- A: legitimate SELECT/INSERT/UPDATE, RPC replay, direct REST CAS guard.
do $$ declare r public.trips; c public.country_records; p jsonb := current_setting('d1.fixture')::jsonb; begin
  r := public.d1_write_trip(current_setting('d1.test_id'),p,null,'00000000-0000-0000-0000-000000000001');
  if r.revision<>1 or r.user_id<>auth.uid() then raise exception 'owner trip INSERT failed'; end if;
  r := public.d1_write_trip(current_setting('d1.test_id'),p,null,'00000000-0000-0000-0000-000000000001');
  if r.revision<>1 then raise exception 'trip create replay duplicated'; end if;
  -- trip request reuse changed payload
  begin
    perform public.d1_write_trip(current_setting('d1.test_id'),jsonb_set(p,'{title}','"reused"'),null,'00000000-0000-0000-0000-000000000001');
    raise exception 'trip request reuse changed payload: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  p := jsonb_set(p,'{title}','"edited"');
  r := public.d1_write_trip(current_setting('d1.test_id'),p,1,'00000000-0000-0000-0000-000000000002');
  if r.revision<>2 or r.payload->>'title'<>'edited' then raise exception 'owner trip UPDATE failed'; end if;
  r := public.d1_write_trip(current_setting('d1.test_id'),p,1,'00000000-0000-0000-0000-000000000002');
  if r.revision<>2 then raise exception 'trip edit replay duplicated'; end if;
  -- trip stale version
  begin
    perform public.d1_write_trip(current_setting('d1.test_id'),p,1,'00000000-0000-0000-0000-000000000003');
    raise exception 'trip stale version: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  -- invalid trip INSERT
  begin
    perform public.d1_write_trip(current_setting('d1.test_id')||':invalid',jsonb_set(jsonb_set(p,'{id}',to_jsonb(current_setting('d1.test_id')||':invalid')),'{legs,0,date}','"2026-02-30"'),null,'00000000-0000-0000-0000-000000000004');
    raise exception 'invalid trip INSERT: unexpectedly succeeded';
  exception when check_violation then null; end;
  insert into public.trips(id,payload,last_mutation_id) values(current_setting('d1.direct_id'),replace(current_setting('d1.fixture')::jsonb::text,current_setting('d1.test_id'),current_setting('d1.direct_id'))::jsonb,'00000000-0000-0000-0000-000000000005');
  update public.trips set payload=jsonb_set(payload,'{title}','"direct edit"'),revision=2,
    last_expected_revision=1,last_mutation_id='00000000-0000-0000-0000-000000000006' where id=current_setting('d1.direct_id');
  if not found then raise exception 'owner direct trip UPDATE denied'; end if;
  -- direct trip stale version
  begin
    update public.trips set revision=3,last_expected_revision=1,last_mutation_id='00000000-0000-0000-0000-000000000007' where id=current_setting('d1.direct_id');
    raise exception 'direct trip stale version: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  c := public.d1_write_country(current_setting('d1.geo_id'),'visited','test notes','{"rating":5}'::jsonb,false,null,'00000000-0000-0000-0000-000000000010');
  c := public.d1_write_country(current_setting('d1.geo_id'),'visited','test notes','{"rating":5}'::jsonb,false,null,'00000000-0000-0000-0000-000000000010');
  if c.revision<>1 or c.user_id<>auth.uid() then raise exception 'country INSERT/replay failed'; end if;
  c := public.d1_write_country(current_setting('d1.geo_id'),'wishlist','edited notes','{}'::jsonb,false,1,'00000000-0000-0000-0000-000000000011');
  c := public.d1_write_country(current_setting('d1.geo_id'),'wishlist','edited notes','{}'::jsonb,false,1,'00000000-0000-0000-0000-000000000011');
  if c.revision<>2 then raise exception 'country UPDATE/replay failed'; end if;
  -- country request reuse changed payload
  begin
    perform public.d1_write_country(current_setting('d1.geo_id'),'visited','changed','{}'::jsonb,false,1,'00000000-0000-0000-0000-000000000011');
    raise exception 'country request reuse changed payload: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  -- country stale version
  begin
    perform public.d1_write_country(current_setting('d1.geo_id'),'visited','stale','{}'::jsonb,false,1,'00000000-0000-0000-0000-000000000012');
    raise exception 'country stale version: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  insert into public.country_records(geo_id,status,last_mutation_id) values(current_setting('d1.geo_id')||':direct','visited','00000000-0000-0000-0000-000000000013');
  update public.country_records set notes='direct edit',revision=2,last_expected_revision=1,last_mutation_id='00000000-0000-0000-0000-000000000014' where geo_id=current_setting('d1.geo_id')||':direct';
  if not found then raise exception 'owner direct country UPDATE denied'; end if;
  begin
    update public.country_records set revision=3,last_expected_revision=1,last_mutation_id='00000000-0000-0000-0000-000000000071'
      where geo_id=current_setting('d1.geo_id')||':direct';
    raise exception 'direct country stale version unexpectedly accepted';
  exception when serialization_failure then null; end;
  if (select count(*) from public.trips)<>2 or (select count(*) from public.country_records)<>2 then
    raise exception 'owner SELECT failed'; end if;
  -- owner hard DELETE trips
  begin
    delete from public.trips where user_id=auth.uid() and id=current_setting('d1.test_id');
    raise exception 'owner hard DELETE trips: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  -- owner hard DELETE country_records
  begin
    delete from public.country_records where user_id=auth.uid() and geo_id=current_setting('d1.geo_id');
    raise exception 'owner hard DELETE country_records: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('d1.user_b'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('d1.user_b'),'role','authenticated')::text,true);
do $$ declare tbl text; privilege_name text; begin
  if current_user <> 'authenticated' or current_setting('row_security') <> 'on'
    or exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'test must use constrained authenticated role'; end if;
  foreach tbl in array array['public.trips','public.country_records'] loop
    foreach privilege_name in array array['SELECT','INSERT','UPDATE'] loop
      if not has_table_privilege(current_user,tbl,privilege_name) then
        raise exception 'authenticated table ACL missing % on %',privilege_name,tbl; end if;
    end loop;
    if has_table_privilege(current_user,tbl,'DELETE') then raise exception 'hard DELETE grant leaked'; end if;
  end loop;
  if not has_function_privilege(current_user,'public.d1_restore_country(text,bigint,uuid)','EXECUTE') then
    raise exception 'authenticated restore RPC missing'; end if;
end $$;

-- B attacks only A's namespaced fixtures, with VALID revisions. A trigger conflict
-- must fail this test rather than masking a broken RLS UPDATE policy.
do $$ begin
  if exists(select 1 from public.trips) or exists(select 1 from public.country_records) then
    raise exception 'foreign SELECT leaked rows'; end if;
  -- foreign INSERT trips
  begin
    insert into public.trips(user_id,id,payload,last_mutation_id) values(current_setting('d1.user_a')::uuid,current_setting('d1.test_id')||':spoof',jsonb_set(current_setting('d1.fixture')::jsonb,'{id}',to_jsonb(current_setting('d1.test_id')||':spoof')),'00000000-0000-0000-0000-000000000020');
    raise exception 'foreign INSERT trips: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  -- foreign INSERT country_records
  begin
    insert into public.country_records(user_id,geo_id,last_mutation_id) values(current_setting('d1.user_a')::uuid,current_setting('d1.geo_id')||':spoof','00000000-0000-0000-0000-000000000021');
    raise exception 'foreign INSERT country_records: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  update public.trips set payload=jsonb_set(payload,'{title}','"attack"'),revision=3,
    last_expected_revision=2,last_mutation_id='00000000-0000-0000-0000-000000000022' where user_id=current_setting('d1.user_a')::uuid and id=current_setting('d1.test_id');
  if found then raise exception 'foreign UPDATE trips succeeded'; end if;
  update public.country_records set notes='attack',revision=3,last_expected_revision=2,last_mutation_id='00000000-0000-0000-0000-000000000023'
    where user_id=current_setting('d1.user_a')::uuid and geo_id=current_setting('d1.geo_id');
  if found then raise exception 'foreign UPDATE country_records succeeded'; end if;
  -- foreign hard DELETE trips
  begin
    delete from public.trips where user_id=current_setting('d1.user_a')::uuid and id=current_setting('d1.test_id');
    raise exception 'foreign hard DELETE trips: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  -- foreign hard DELETE country_records
  begin
    delete from public.country_records where user_id=current_setting('d1.user_a')::uuid and geo_id=current_setting('d1.geo_id');
    raise exception 'foreign hard DELETE country_records: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  -- foreign RPC trip update
  begin
    perform public.d1_write_trip(current_setting('d1.test_id'),current_setting('d1.fixture')::jsonb,2,'00000000-0000-0000-0000-000000000024');
    raise exception 'foreign RPC trip update: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  -- foreign RPC trip soft delete
  begin
    perform public.d1_write_trip(current_setting('d1.test_id'),null,2,'00000000-0000-0000-0000-000000000025');
    raise exception 'foreign RPC trip soft delete: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  -- foreign RPC country update
  begin
    perform public.d1_write_country(current_setting('d1.geo_id'),'visited','attack','{}'::jsonb,false,2,'00000000-0000-0000-0000-000000000026');
    raise exception 'foreign RPC country update: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  -- foreign RPC country soft delete
  begin
    perform public.d1_write_country(current_setting('d1.geo_id'),null,null,null,true,2,'00000000-0000-0000-0000-000000000027');
    raise exception 'foreign RPC country soft delete: unexpectedly succeeded';
  exception when serialization_failure then null; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('d1.user_a'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('d1.user_a'),'role','authenticated')::text,true);
do $$ declare tbl text; privilege_name text; begin
  if current_user <> 'authenticated' or current_setting('row_security') <> 'on'
    or exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'test must use constrained authenticated role'; end if;
  foreach tbl in array array['public.trips','public.country_records'] loop
    foreach privilege_name in array array['SELECT','INSERT','UPDATE'] loop
      if not has_table_privilege(current_user,tbl,privilege_name) then
        raise exception 'authenticated table ACL missing % on %',privilege_name,tbl; end if;
    end loop;
    if has_table_privilege(current_user,tbl,'DELETE') then raise exception 'hard DELETE grant leaked'; end if;
  end loop;
  if not has_function_privilege(current_user,'public.d1_restore_country(text,bigint,uuid)','EXECUTE') then
    raise exception 'authenticated restore RPC missing'; end if;
end $$;

-- A deletes; normal saves must NEVER resurrect either tombstone.
do $$ declare r public.trips; c public.country_records; begin
  if (select payload->>'title' from public.trips where id=current_setting('d1.test_id'))<>'edited'
    or (select notes from public.country_records where geo_id=current_setting('d1.geo_id'))<>'edited notes' then raise exception 'foreign mutation changed A'; end if;
  r := public.d1_write_trip(current_setting('d1.test_id'),null,2,'00000000-0000-0000-0000-000000000030');
  r := public.d1_write_trip(current_setting('d1.test_id'),null,2,'00000000-0000-0000-0000-000000000030');
  if r.revision<>3 or r.deleted_at is null then raise exception 'trip soft delete/replay failed'; end if;
  -- delayed trip create
  begin
    perform public.d1_write_trip(current_setting('d1.test_id'),current_setting('d1.fixture')::jsonb,null,'00000000-0000-0000-0000-000000000001');
    raise exception 'delayed trip create: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  -- deleted trip save
  begin
    perform public.d1_write_trip(current_setting('d1.test_id'),current_setting('d1.fixture')::jsonb,3,'00000000-0000-0000-0000-000000000031');
    raise exception 'deleted trip save: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  -- direct trip resurrection
  begin
    update public.trips set revision=4,last_expected_revision=3,last_mutation_id='00000000-0000-0000-0000-000000000032',last_operation='save',deleted_at=null where id=current_setting('d1.test_id');
    raise exception 'direct trip resurrection: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  c := public.d1_write_country(current_setting('d1.geo_id'),null,null,null,true,2,'00000000-0000-0000-0000-000000000033');
  c := public.d1_write_country(current_setting('d1.geo_id'),null,null,null,true,2,'00000000-0000-0000-0000-000000000033');
  if c.revision<>3 or c.deleted_at is null then raise exception 'country soft delete/replay failed'; end if;
  -- country requires explicit restore
  begin
    perform public.d1_write_country(current_setting('d1.geo_id'),'visited','ordinary save','{}'::jsonb,false,3,'00000000-0000-0000-0000-000000000034');
    raise exception 'country requires explicit restore: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  -- country restore stale version
  begin
    perform public.d1_restore_country(current_setting('d1.geo_id'),2,'00000000-0000-0000-0000-000000000035');
    raise exception 'country restore stale version: unexpectedly succeeded';
  exception when serialization_failure then null; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('d1.user_b'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('d1.user_b'),'role','authenticated')::text,true);
do $$ declare tbl text; privilege_name text; begin
  if current_user <> 'authenticated' or current_setting('row_security') <> 'on'
    or exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'test must use constrained authenticated role'; end if;
  foreach tbl in array array['public.trips','public.country_records'] loop
    foreach privilege_name in array array['SELECT','INSERT','UPDATE'] loop
      if not has_table_privilege(current_user,tbl,privilege_name) then
        raise exception 'authenticated table ACL missing % on %',privilege_name,tbl; end if;
    end loop;
    if has_table_privilege(current_user,tbl,'DELETE') then raise exception 'hard DELETE grant leaked'; end if;
  end loop;
  if not has_function_privilege(current_user,'public.d1_restore_country(text,bigint,uuid)','EXECUTE') then
    raise exception 'authenticated restore RPC missing'; end if;
end $$;

-- B cannot restore A's COUNTRY tombstone, including valid-version direct UPDATE.
do $$ declare r public.trips; c public.country_records; begin
  update public.country_records set revision=4,last_expected_revision=3,last_mutation_id='00000000-0000-0000-0000-000000000036',last_operation='restore',deleted_at=null
    where user_id=current_setting('d1.user_a')::uuid and geo_id=current_setting('d1.geo_id');
  if found then raise exception 'foreign direct restore succeeded'; end if;
  -- foreign RPC country restore
  begin
    perform public.d1_restore_country(current_setting('d1.geo_id'),3,'00000000-0000-0000-0000-000000000037');
    raise exception 'foreign RPC country restore: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  -- Same logical IDs are legal for a DIFFERENT owner and cannot expose A's content.
  r := public.d1_write_trip(current_setting('d1.test_id'),jsonb_set(current_setting('d1.fixture')::jsonb,'{title}','"B private"'),null,'00000000-0000-0000-0000-000000000038');
  c := public.d1_write_country(current_setting('d1.geo_id'),'visited','B private','{}'::jsonb,false,null,'00000000-0000-0000-0000-000000000039');
  if r.revision<>1 or c.revision<>1 or r.user_id<>auth.uid() or c.user_id<>auth.uid() then raise exception 'owner B isolation failed'; end if;
  if (select count(*) from public.trips)<>1 or (select count(*) from public.country_records)<>1
    or exists(select 1 from public.trips where user_id=current_setting('d1.user_a')::uuid)
    or exists(select 1 from public.country_records where user_id=current_setting('d1.user_a')::uuid) then
    raise exception 'same-ID owner isolation failed'; end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('d1.user_a'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('d1.user_a'),'role','authenticated')::text,true);
do $$ declare tbl text; privilege_name text; begin
  if current_user <> 'authenticated' or current_setting('row_security') <> 'on'
    or exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'test must use constrained authenticated role'; end if;
  foreach tbl in array array['public.trips','public.country_records'] loop
    foreach privilege_name in array array['SELECT','INSERT','UPDATE'] loop
      if not has_table_privilege(current_user,tbl,privilege_name) then
        raise exception 'authenticated table ACL missing % on %',privilege_name,tbl; end if;
    end loop;
    if has_table_privilege(current_user,tbl,'DELETE') then raise exception 'hard DELETE grant leaked'; end if;
  end loop;
  if not has_function_privilege(current_user,'public.d1_restore_country(text,bigint,uuid)','EXECUTE') then
    raise exception 'authenticated restore RPC missing'; end if;
end $$;

-- A explicitly restores previous manual contents, then marks the country again.
do $$ declare c public.country_records; begin
  if (select revision from public.country_records where geo_id=current_setting('d1.geo_id'))<>3 then raise exception 'B changed A tombstone'; end if;
  begin
    update public.country_records set revision=4,last_expected_revision=3,last_mutation_id='00000000-0000-0000-0000-000000000070',
      last_operation='restore',deleted_at=null,notes='altered during restore' where geo_id=current_setting('d1.geo_id');
    raise exception 'restore overwrote retained content';
  exception when check_violation then null; end;
  c := public.d1_restore_country(current_setting('d1.geo_id'),3,'00000000-0000-0000-0000-000000000040');
  if c.revision<>4 or c.deleted_at is not null or c.notes<>'edited notes' or c.status<>'wishlist' then raise exception 'country restore lost content'; end if;
  c := public.d1_restore_country(current_setting('d1.geo_id'),3,'00000000-0000-0000-0000-000000000040');
  if c.revision<>4 then raise exception 'country restore replay duplicated'; end if;
  -- restore reused UUID different request
  begin
    perform public.d1_restore_country(current_setting('d1.geo_id'),2,'00000000-0000-0000-0000-000000000040');
    raise exception 'restore reused UUID different request: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  -- restore active country
  begin
    perform public.d1_restore_country(current_setting('d1.geo_id'),4,'00000000-0000-0000-0000-000000000041');
    raise exception 'restore active country: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  c := public.d1_write_country(current_setting('d1.geo_id'),'visited','re-marked','{"rating":5}'::jsonb,false,4,'00000000-0000-0000-0000-000000000042');
  if c.revision<>5 or c.status<>'visited' then raise exception 'country re-mark failed'; end if;
  -- delayed restore after newer edit
  begin
    perform public.d1_restore_country(current_setting('d1.geo_id'),3,'00000000-0000-0000-0000-000000000040');
    raise exception 'delayed restore after newer edit: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  -- delayed delete after restore
  begin
    perform public.d1_write_country(current_setting('d1.geo_id'),null,null,null,true,2,'00000000-0000-0000-0000-000000000033');
    raise exception 'delayed delete after restore: unexpectedly succeeded';
  exception when serialization_failure then null; end;
  if exists(select 1 from public.trips where id=current_setting('d1.test_id') and deleted_at is null) then raise exception 'deleted trip restored'; end if;
  if (select count(*) from public.trips)<>2 or (select count(*) from public.country_records)<>2 then raise exception 'A sees B records'; end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims',json_build_object('sub','','role','authenticated')::text,true);
do $$ declare tbl text; privilege_name text; begin
  if current_user <> 'authenticated' or current_setting('row_security') <> 'on'
    or exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'test must use constrained authenticated role'; end if;
  foreach tbl in array array['public.trips','public.country_records'] loop
    foreach privilege_name in array array['SELECT','INSERT','UPDATE'] loop
      if not has_table_privilege(current_user,tbl,privilege_name) then
        raise exception 'authenticated table ACL missing % on %',privilege_name,tbl; end if;
    end loop;
    if has_table_privilege(current_user,tbl,'DELETE') then raise exception 'hard DELETE grant leaked'; end if;
  end loop;
  if not has_function_privilege(current_user,'public.d1_restore_country(text,bigint,uuid)','EXECUTE') then
    raise exception 'authenticated restore RPC missing'; end if;
end $$;

-- Authenticated role WITHOUT verified sub must not access/mutate private records.
do $$ begin
  if exists(select 1 from public.trips) or exists(select 1 from public.country_records) then raise exception 'missing sub SELECT leaked'; end if;
  -- missing sub trip RPC
  begin
    perform public.d1_write_trip(current_setting('d1.test_id'),current_setting('d1.fixture')::jsonb,null,'00000000-0000-0000-0000-000000000050');
    raise exception 'missing sub trip RPC: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  -- missing sub country RPC
  begin
    perform public.d1_write_country(current_setting('d1.geo_id'),'visited','','{}'::jsonb,false,null,'00000000-0000-0000-0000-000000000051');
    raise exception 'missing sub country RPC: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  -- missing sub restore RPC
  begin
    perform public.d1_restore_country(current_setting('d1.geo_id'),5,'00000000-0000-0000-0000-000000000052');
    raise exception 'missing sub restore RPC: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims',json_build_object('sub','','role','anon')::text,true);
do $$ declare tbl text; privilege_name text; begin
  if current_user <> 'anon' or current_setting('row_security') <> 'on'
    or exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'test must use constrained anon role'; end if;
  if has_table_privilege(current_user,'public.trips','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege(current_user,'public.country_records','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'anon must have no table CRUD grants'; end if;
  if has_function_privilege(current_user,'public.d1_write_trip(text,jsonb,bigint,uuid)','EXECUTE')
    or has_function_privilege(current_user,'public.d1_write_country(text,text,text,jsonb,boolean,bigint,uuid)','EXECUTE')
    or has_function_privilege(current_user,'public.d1_restore_country(text,bigint,uuid)','EXECUTE') then
    raise exception 'anon RPC grant leaked'; end if;
end $$;

-- Anonymous SELECT/INSERT/UPDATE/DELETE rejected on BOTH tables; all RPCs denied.
do $$ begin
  -- anon SELECT trips
  begin
    perform 1 from public.trips;
    raise exception 'anon SELECT trips: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  -- anon UPDATE trips
  begin
    update public.trips set revision=revision+1,last_expected_revision=revision,last_mutation_id='00000000-0000-0000-0000-000000000060' where user_id=current_setting('d1.user_a')::uuid and id=current_setting('d1.test_id');
    raise exception 'anon UPDATE trips: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  -- anon DELETE trips
  begin
    delete from public.trips where user_id=current_setting('d1.user_a')::uuid and id=current_setting('d1.test_id');
    raise exception 'anon DELETE trips: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  -- anon SELECT country_records
  begin
    perform 1 from public.country_records;
    raise exception 'anon SELECT country_records: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  -- anon UPDATE country_records
  begin
    update public.country_records set revision=revision+1,last_expected_revision=revision,last_mutation_id='00000000-0000-0000-0000-000000000060' where user_id=current_setting('d1.user_a')::uuid and geo_id=current_setting('d1.geo_id');
    raise exception 'anon UPDATE country_records: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  -- anon DELETE country_records
  begin
    delete from public.country_records where user_id=current_setting('d1.user_a')::uuid and geo_id=current_setting('d1.geo_id');
    raise exception 'anon DELETE country_records: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  -- anon INSERT trips
  begin
    insert into public.trips(user_id,id,payload,last_mutation_id) values(current_setting('d1.user_a')::uuid,current_setting('d1.test_id'),current_setting('d1.fixture')::jsonb,'00000000-0000-0000-0000-000000000061');
    raise exception 'anon INSERT trips: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  -- anon INSERT country_records
  begin
    insert into public.country_records(user_id,geo_id,last_mutation_id) values(current_setting('d1.user_a')::uuid,current_setting('d1.geo_id'),'00000000-0000-0000-0000-000000000062');
    raise exception 'anon INSERT country_records: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  -- anon trip RPC
  begin
    perform public.d1_write_trip(current_setting('d1.test_id'),current_setting('d1.fixture')::jsonb,null,'00000000-0000-0000-0000-000000000063');
    raise exception 'anon trip RPC: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  -- anon country RPC
  begin
    perform public.d1_write_country(current_setting('d1.geo_id'),'visited','','{}'::jsonb,false,null,'00000000-0000-0000-0000-000000000064');
    raise exception 'anon country RPC: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  -- anon restore RPC
  begin
    perform public.d1_restore_country(current_setting('d1.geo_id'),5,'00000000-0000-0000-0000-000000000065');
    raise exception 'anon restore RPC: unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
