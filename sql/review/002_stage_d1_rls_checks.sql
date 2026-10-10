-- REVIEW ONLY: NOT RUN. D2 requires approval, schema applied and two TEST Auth users.
-- Replace the UUID placeholders below; these are user IDs, NEVER session tokens.
-- Run the WHOLE file in one approved SQL session. All fixture writes roll back.
begin;
set local "d1.user_a" = 'REPLACE_WITH_TEST_USER_A_UUID';
set local "d1.user_b" = 'REPLACE_WITH_TEST_USER_B_UUID';
do $$ begin
  if current_setting('d1.user_a')::uuid = current_setting('d1.user_b')::uuid then raise exception 'need two distinct TEST users'; end if;
  if (select count(*) from auth.users where id in (current_setting('d1.user_a')::uuid,current_setting('d1.user_b')::uuid)) <> 2 then raise exception 'test users must already exist'; end if;
end $$;
select set_config('d1.fixture','{"id": "d1-rls-test-trip", "title": "D1 approved future TEST fixture", "status": "completed", "stops": [{"id": "d1-stop-0", "airport": {"id": "6c680516-764d-5349-8dd6-ae4f53d775c1", "source": "ourairports", "sourceId": "5528", "ident": "RCTP", "iata": "TPE", "icao": "RCTP", "name": "Taiwan Taoyuan International Airport", "city": "Taoyuan", "latitude": 25.0777, "longitude": 121.233002, "sourceCountryCode": "TW", "isoCountryCode": "TW", "type": "large_airport", "scheduledService": true, "closed": false, "retired": false, "updatedAt": "2026-10-09T01:53:12Z", "aliases": [], "history": [], "keywords": "Taoyuan County, Dayuan District. 臺灣桃園國際機場", "wikipedia": "https://zh.wikipedia.org/wiki/%E8%87%BA%E7%81%A3%E6%A1%83%E5%9C%92%E5%9C%8B%E9%9A%9B%E6%A9%9F%E5%A0%B4"}, "countryPresence": "visited"}, {"id": "d1-stop-1", "airport": {"id": "2762e834-1cc4-535c-94cb-6752ea32369b", "source": "ourairports", "sourceId": "5235", "ident": "OMDB", "iata": "DXB", "icao": "OMDB", "name": "Dubai International Airport", "city": "Dubai", "latitude": 25.24979, "longitude": 55.370992, "sourceCountryCode": "AE", "isoCountryCode": "AE", "type": "large_airport", "scheduledService": true, "closed": false, "retired": false, "updatedAt": "2026-10-09T01:53:12Z", "aliases": [], "history": [], "keywords": "مطار دبي الدولي‎", "wikipedia": "https://en.wikipedia.org/wiki/Dubai_International_Airport"}, "countryPresence": "transit"}, {"id": "d1-stop-2", "airport": {"id": "8593f7f2-4419-5fc5-8a2a-e2d77c28fec7", "source": "ourairports", "sourceId": "4251", "ident": "LGAV", "iata": "ATH", "icao": "LGAV", "name": "Athens Eleftherios Venizelos International Airport", "city": "Spata-Artemida", "latitude": 37.936401, "longitude": 23.9445, "sourceCountryCode": "GR", "isoCountryCode": "GR", "type": "large_airport", "scheduledService": true, "closed": false, "retired": false, "updatedAt": "2026-10-09T01:53:12Z", "aliases": [], "history": [], "keywords": "", "wikipedia": "https://en.wikipedia.org/wiki/Athens_International_Airport"}, "countryPresence": "visited"}], "legs": [{"id": "d1-leg-0", "fromStopId": "d1-stop-0", "toStopId": "d1-stop-1"}, {"id": "d1-leg-1", "fromStopId": "d1-stop-1", "toStopId": "d1-stop-2"}]}',true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('d1.user_a'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('d1.user_a'),'role','authenticated')::text,true);
do $$ declare r public.trips; begin
  r := public.d1_write_trip('d1-rls-test-trip',current_setting('d1.fixture')::jsonb,null,'00000000-0000-0000-0000-000000000001');
  if r.revision <> 1 then raise exception 'create failed'; end if;
  r := public.d1_write_trip('d1-rls-test-trip',current_setting('d1.fixture')::jsonb,null,'00000000-0000-0000-0000-000000000001');
  if r.revision <> 1 then raise exception 'replay duplicated revision'; end if;
  perform public.d1_write_country('158','visited','test notes','{"rating":5}'::jsonb,false,null,'00000000-0000-0000-0000-000000000010');
  begin
    perform public.d1_write_trip('d1-rls-test-trip',current_setting('d1.fixture')::jsonb,99,'00000000-0000-0000-0000-000000000002');
    raise exception 'stale revision unexpectedly accepted';
  exception when serialization_failure then null; end;
  begin
    insert into public.country_records(user_id,geo_id,last_mutation_id) values(current_setting('d1.user_b')::uuid,'392','00000000-0000-0000-0000-000000000003');
    raise exception 'spoofed owner accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('d1.user_b'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('d1.user_b'),'role','authenticated')::text,true);
do $$ begin
  if exists(select 1 from public.trips where user_id=current_setting('d1.user_a')::uuid)
    or exists(select 1 from public.country_records where user_id=current_setting('d1.user_a')::uuid) then raise exception 'private rows leaked'; end if;
  update public.country_records set notes='attack' where user_id=current_setting('d1.user_a')::uuid;
  if found then raise exception 'foreign UPDATE succeeded'; end if;
  begin
    perform public.d1_write_trip('d1-rls-test-trip',null,1,'00000000-0000-0000-0000-000000000004');
    raise exception 'foreign delete succeeded';
  exception when serialization_failure then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('d1.user_a'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('d1.user_a'),'role','authenticated')::text,true);
do $$ declare r public.trips; begin
  if (select notes from public.country_records where geo_id='158') is distinct from 'test notes' then raise exception 'foreign mutation changed notes'; end if;
  r := public.d1_write_trip('d1-rls-test-trip',null,1,'00000000-0000-0000-0000-000000000005');
  if r.deleted_at is null or r.revision <> 2 then raise exception 'delete failed'; end if;
  r := public.d1_write_trip('d1-rls-test-trip',null,1,'00000000-0000-0000-0000-000000000005');
  if r.revision <> 2 then raise exception 'delete replay failed'; end if;
  if exists(select 1 from public.trips where deleted_at is null and id='d1-rls-test-trip') then raise exception 'tombstone still active'; end if;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
  begin
    perform 1 from public.trips;
    raise exception 'anonymous private SELECT permitted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.d1_write_trip('d1-rls-test-trip',null,2,'00000000-0000-0000-0000-000000000006');
    raise exception 'anonymous mutation permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
