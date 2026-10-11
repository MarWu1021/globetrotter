/* Unit/transport doubles only. No database, real JWT, OAuth provider or network calls. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import {createRequire} from 'node:module'
const native=createRequire(import.meta.url),cache=new Map()
function load(file){
 const absolute=path.resolve(file);if(cache.has(absolute))return cache.get(absolute)
 if(absolute.endsWith('.json'))return JSON.parse(fs.readFileSync(absolute,'utf8'))
 const mod={exports:{}};cache.set(absolute,mod.exports)
 const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 const req=name=>{if(!name.startsWith('.')&&!name.startsWith('@/'))return native(name);const base=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(absolute),name);return load(path.extname(base)?base:base+'.ts')}
 new vm.Script(`(function(exports,require){${code}\n})`).runInThisContext()(mod.exports,req);return mod.exports
}
const {supabaseRepositories,sameJSON}=load('src/lib/cloud-trips/supabase.ts')
const {AccountSession}=load('src/lib/cloud-trips/account.ts')
const {httpRepositories}=load('src/lib/cloud-trips/http.ts')
const {cloudError}=load('src/lib/cloud-trips/validation.ts')
const {savedTripMap}=load('src/lib/trip-map/core.ts')
const fixture=JSON.parse(fs.readFileSync('sql/review/002_stage_d1_rls_checks.sql','utf8').match(/select set_config\('d1.fixture','(.*?)',true\);/s)[1])
const now='2026-10-11T01:00:00.000Z',uuid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const mutation=(draft,expectedRevision=null,n=1)=>({id:draft.id,draft,expectedRevision,requestId:uuid(n)})
function fake(user='A'){
 const rows={trips:new Map(),country_records:new Map()},calls=[]
 const state={error:null,dropReply:false,badOwner:false,arrayReply:false,badRevision:false,badRequest:false}
 const key=id=>JSON.stringify([user,id])
 const client={
  from(table){let selectedUser=null,offset=0,end=199;return {
   select(fields){calls.push(['select',table,fields]);return this},
   eq(column,value){assert.equal(column,'user_id');selectedUser=value;calls.push(['owner-filter',value]);return this},
   is(column,value){assert.equal(column,'deleted_at');assert.equal(value,null);return this},
   order(column){assert.equal(column,table==='trips'?'id':'geo_id');return this},
   async range(from,to){offset=from;end=to;if(state.error)return {data:null,error:state.error}
    return {data:[...rows[table].values()].filter(r=>r.user_id===selectedUser&&r.deleted_at===null).sort((a,b)=>(a.id??a.geo_id).localeCompare(b.id??b.geo_id)).slice(offset,end+1),error:null}}
  }},
  async rpc(name,p){
   calls.push(['rpc',name,structuredClone(p)]);if(state.error)return {data:null,error:state.error}
   const table=name==='d1_write_trip'?'trips':'country_records',id=p.p_id??p.p_geo_id,previous=rows[table].get(key(id))
   const operation=name==='d1_restore_country'?'restore':name==='d1_write_trip'?(p.p_payload===null?'delete':'save'):(p.p_delete?'delete':'save')
   const fingerprint=JSON.stringify(p)
   if(previous?.last_mutation_id===p.p_mutation_id){if(previous.fingerprint!==fingerprint)return {data:null,error:{code:'40001'}};return {data:structuredClone(previous),error:null}}
   if(previous?(previous.revision!==p.p_expected_revision || (!!previous.deleted_at&&operation!=='restore') || (!previous.deleted_at&&operation==='restore')):(p.p_expected_revision!==null||operation!=='save'))return {data:null,error:{code:'40001'}}
   const row={...previous,user_id:user,revision:(previous?.revision??0)+1,created_at:previous?.created_at??now,updated_at:now,
    deleted_at:operation==='delete'?now:null,last_mutation_id:p.p_mutation_id,last_expected_revision:p.p_expected_revision,last_operation:operation,fingerprint}
   if(table==='trips'){row.id=id;row.schema_version=1;row.payload=structuredClone(p.p_payload??previous.payload)}
   else{row.geo_id=id;if(operation==='save'){row.status=p.p_status;row.notes=p.p_notes;row.review=structuredClone(p.p_review)}}
   rows[table].set(key(id),row)
   if(state.dropReply){state.dropReply=false;throw Error('lost acknowledgement')}
   const reply=structuredClone(row);if(state.badOwner)reply.user_id='B';if(state.badRevision)reply.revision+=5;if(state.badRequest)reply.last_mutation_id=uuid(99)
   return {data:state.arrayReply?[reply]:reply,error:null}
  }
 }
 return {rows,calls,state,client,repos:supabaseRepositories(client,user)}
}
const country={geoId:'158',status:'visited',notes:'台灣筆記',review:{rating:5,visits:['2026-10']}}
const saved={draft:fixture,createdAt:now,updatedAt:now,revision:1}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}

test('SDK trip create/read/update/soft-delete use existing payload and versioned RPCs',async()=>{
 const f=fake();let r=await f.repos.trips.save(mutation(fixture));assert.equal(r.ok,true);assert.equal(r.value.revision,1)
 assert.equal((await f.repos.trips.list()).value.length,1)
 const changed={...fixture,title:'edited'};r=await f.repos.trips.save(mutation(changed,1,2));assert.equal(r.value.revision,2)
 assert.equal((await f.repos.trips.remove({id:fixture.id,expectedRevision:2,requestId:uuid(3)})).ok,true)
 assert.equal((await f.repos.trips.list()).value.length,0)
 assert.equal(f.rows.trips.size,1);assert.ok([...f.rows.trips.values()][0].deleted_at)
})
test('SDK rejects stale revisions and cannot restore a deleted trip',async()=>{
 const f=fake();await f.repos.trips.save(mutation(fixture));assert.equal((await f.repos.trips.save(mutation(fixture,9,2))).error,'conflict')
 await f.repos.trips.remove({id:fixture.id,expectedRevision:1,requestId:uuid(3)})
 assert.equal((await f.repos.trips.save(mutation(fixture,null,4))).error,'conflict')
})
test('same request replay does not add trips or flight counts',async()=>{
 const f=fake();await f.repos.trips.save(mutation(fixture));await f.repos.trips.save(mutation(fixture));assert.equal(f.rows.trips.size,1)
 const map=savedTripMap((await f.repos.trips.list()).value,{});assert.equal(map.tripCount,1);assert.equal(map.flightCount,2)
})
test('country CRUD, explicit restore, notes and review remain intact',async()=>{
 const f=fake();let r=await f.repos.countries.save({...mutation({id:'158'}),record:country});assert.equal(r.value.revision,1)
 await f.repos.countries.remove({id:'158',expectedRevision:1,requestId:uuid(2)})
 assert.deepEqual((await f.repos.countries.list()).value,[])
 assert.equal((await f.repos.countries.save({...mutation({id:'158'},null,3),record:country})).error,'conflict')
 r=await f.repos.countries.restore({id:'158',expectedRevision:2,requestId:uuid(4)});assert.equal(r.value.notes,country.notes);assert.deepEqual(r.value.review,country.review)
 assert.equal((await f.repos.countries.save({...mutation({id:'158'},3,5),record:{...country,status:'wishlist'}})).value.status,'wishlist')
})
test('SDK denies malformed commands before issuing RPCs',async()=>{
 const f=fake();assert.equal((await f.repos.trips.save({...mutation(fixture),requestId:'not-a-uuid'})).error,'invalid')
 assert.equal((await f.repos.trips.save(mutation({...fixture,status:'planned'}))).error,'invalid');assert.equal(f.calls.length,0)
})
test('missing schema and RPC errors explicitly require SQL enablement',async()=>{
 for(const code of ['42P01','42883','PGRST202','PGRST205']){const f=fake();f.state.error={code};assert.equal((await f.repos.trips.list()).error,'setup');assert.equal((await f.repos.trips.save(mutation(fixture))).error,'setup')}
})
test('SDK checks returned owner and expected acknowledgement revision',async()=>{
 for(const mode of ['badOwner','badRevision','badRequest']){const f=fake();f.state[mode]=true;assert.equal((await f.repos.trips.save(mutation(fixture))).error,'uncertain')}
})
test('SDK handles singleton composite rows and JSONB key ordering',async()=>{
 const f=fake();f.state.arrayReply=true;assert.equal((await f.repos.trips.save(mutation(fixture))).ok,true)
 assert.equal(sameJSON({b:[1,{x:2}],a:3},{a:3,b:[1,{x:2}]}),true)
 assert.equal(sameJSON({a:3},{a:4}),false)
})
test('active rows are explicitly owner-filtered, including countries',async()=>{
 const f=fake();await f.repos.trips.save(mutation(fixture));await f.repos.countries.save({...mutation({id:'158'}),record:country})
 f.rows.trips.set('other',{...f.rows.trips.values().next().value,user_id:'B'})
 assert.equal((await f.repos.trips.list()).value.length,1);assert.equal((await f.repos.countries.list()).value.length,1)
 assert.equal(f.calls.filter(c=>c[0]==='owner-filter').every(c=>c[1]==='A'),true)
})
test('catalog-independent cloud list pagination keeps all rows',async()=>{
 const f=fake();for(let i=0;i<205;i++)f.rows.country_records.set(String(i),{user_id:'A',geo_id:String(i).padStart(3,'0'),status:'visited',notes:'',review:{},revision:1,deleted_at:null})
 assert.equal((await f.repos.countries.list()).value.length,205)
})
test('invalid cloud row fails the whole load rather than losing part of an account',async()=>{
 const f=fake();f.rows.country_records.set('bad',{user_id:'A',geo_id:'158',status:'visited',notes:{unexpected:1},review:{},revision:1,deleted_at:null})
 assert.equal((await f.repos.countries.list()).error,'invalid')
})
test('lost write response leaves footprint unchanged; retry reuses exact request UUID',async()=>{
 const f=fake(),s=new AccountSession(f.repos,()=>uuid(1));await s.load('A');f.state.dropReply=true
 assert.equal((await s.saveTrip(fixture,null)).error,'uncertain');assert.equal(s.getSnapshot().trips.length,0)
 assert.equal((await s.saveTrip(fixture,null)).ok,true);assert.equal(s.getSnapshot().trips.length,1)
 const calls=f.calls.filter(c=>c[0]==='rpc');assert.equal(calls[0][2].p_mutation_id,calls[1][2].p_mutation_id);assert.equal(f.rows.trips.size,1)
})
test('ambiguous write cannot be blindly retried with different contents',async()=>{
 const f=fake(),s=new AccountSession(f.repos,()=>uuid(1));await s.load('A');f.state.dropReply=true;await s.saveTrip(fixture,null)
 assert.equal((await s.saveTrip({...fixture,title:'changed during uncertainty'},null)).error,'uncertain')
 assert.equal(f.calls.filter(c=>c[0]==='rpc').length,1)
})
test('unsaved/failed trip does not change colors; acknowledged save updates both map datasets',async()=>{
 const f=fake(),s=new AccountSession(f.repos,()=>uuid(1));await s.load('A')
 assert.equal(savedTripMap(s.getSnapshot().trips,{}).countryCount,0)
 f.state.error={code:'40001'};assert.equal((await s.saveTrip(fixture,null)).error,'conflict');assert.equal(s.getSnapshot().trips.length,0)
 f.state.error=null;await s.saveTrip(fixture,null)
 const map=savedTripMap(s.getSnapshot().trips,{});assert.equal(map.countryCount,3);assert.equal(map.colors['158'],'#6F9E91');assert.equal(map.flatColors['784'],'#8BB6CE');assert.equal(map.flightCount,2)
})
test('session refresh and a second device reconstruct saved maps and stats',async()=>{
 const f=fake();let n=0;const one=new AccountSession(f.repos,()=>uuid(++n)),two=new AccountSession(f.repos)
 await one.load('A');await one.saveTrip(fixture,null);await two.load('A')
 assert.equal(savedTripMap(two.getSnapshot().trips,{}).flightCount,2)
 await one.removeTrip(fixture.id,1);await two.load('A');assert.equal(two.getSnapshot().trips.length,0)
})
test('logout invalidates pending read responses and clears all private snapshots',async()=>{
 const d=deferred(),s=new AccountSession({trips:{list:()=>d.promise},countries:{list:async()=>({ok:true,value:[{...country,revision:1}]})}})
 const pending=s.load('A');s.clear();d.resolve({ok:true,value:[saved]});await pending
 assert.deepEqual(s.getSnapshot().trips,[]);assert.deepEqual(s.getSnapshot().countries,[]);assert.equal(s.getSnapshot().userId,null)
})
test('logout invalidates pending write acknowledgements',async()=>{
 const d=deferred(),f=fake();f.repos.trips.save=()=>d.promise
 const s=new AccountSession(f.repos,()=>uuid(1));await s.load('A');const pending=s.saveTrip(fixture,null);s.clear();d.resolve({ok:true,value:saved})
 assert.equal((await pending).error,'unauthenticated');assert.equal(s.getSnapshot().trips.length,0)
})
test('account switch drops both country records and trips before loading B',async()=>{
 let account='A';const s=new AccountSession({trips:{list:async()=>({ok:true,value:account==='A'?[saved]:[]})},countries:{list:async()=>({ok:true,value:account==='A'?[{...country,revision:1}]:[]})}})
 await s.load('A');account='B';await s.load('B');assert.equal(s.getSnapshot().userId,'B');assert.deepEqual(s.getSnapshot().countries,[]);assert.deepEqual(s.getSnapshot().trips,[])
})
test('cloud load failures preserve known data and are not an empty successful account',async()=>{
 const f=fake(),s=new AccountSession(f.repos,()=>uuid(1));await s.load('A');await s.saveTrip(fixture,null);f.state.error={code:'fetch_error'};await s.load('A')
 assert.equal(s.getSnapshot().error,'network');assert.equal(s.getSnapshot().trips.length,1)
})
test('duplicate submission is busy until the first acknowledgement',async()=>{
 const f=fake(),d=deferred();f.repos.trips.save=()=>d.promise
 const s=new AccountSession(f.repos,()=>uuid(1));await s.load('A');const first=s.saveTrip(fixture,null);assert.equal((await s.saveTrip(fixture,null)).error,'busy')
 d.resolve({ok:true,value:saved});assert.equal((await first).ok,true)
})
test('country acknowledgement updates manual map record without mutating inputs',async()=>{
 const f=fake(),s=new AccountSession(f.repos,()=>uuid(1));await s.load('A');const original=structuredClone(country)
 assert.equal((await s.saveCountry(country,null)).ok,true);assert.deepEqual(country,original)
 assert.equal(savedTripMap([],{'158':s.getSnapshot().countries[0].status}).countryCount,1)
 assert.throws(()=>s.getSnapshot().countries.push(country))
})
test('shared flight/stop IDs across trips are rejected before a cloud write',async()=>{
 const f=fake(),s=new AccountSession(f.repos,()=>uuid(1));await s.load('A');await s.saveTrip(fixture,null)
 assert.equal((await s.saveTrip({...fixture,id:'copy'},null)).error,'invalid')
})
test('same-origin HTTP results reject mismatched identities and never expose raw errors',async()=>{
 const repos=httpRepositories('B',async()=>new Response(JSON.stringify({userId:'A',result:{ok:true,value:[saved]}})))
 assert.equal((await repos.trips.list()).error,'account-changed')
 const failed=httpRepositories('A',async()=>new Response(JSON.stringify({result:{ok:false,error:'setup'},userId:null}),{status:503}))
 assert.equal((await failed.trips.list()).error,'setup')
})
test('HTTP transport is no-store and write uncertainty is distinct from a successful save',async()=>{
 const repos=httpRepositories('A',async(path,options)=>{assert.equal(options.cache,'no-store');assert.equal(options.credentials,'same-origin');throw Error('network')})
 assert.equal((await repos.trips.list()).error,'network');assert.equal((await repos.trips.save(mutation(fixture))).error,'uncertain')
})
test('cloud API verifies Auth, checks write Origin, and never uses elevated secrets/storage',()=>{
 const route=fs.readFileSync('src/app/api/account/route.ts','utf8')
 for(const t of ['auth.getUser()','private, no-store','request.headers.get(\'origin\')','reader.cancel()'])assert.ok(route.includes(t),t)
 for(const name of ['src/lib/cloud-trips/account.ts','src/lib/cloud-trips/supabase.ts','src/app/api/account/route.ts'])assert.doesNotMatch(fs.readFileSync(name,'utf8'),/process\.env\.(?:.*SECRET|.*SERVICE_ROLE)|localStorage\.(getItem|setItem|removeItem)/)
 assert.match(fs.readFileSync('src/components/account-provider.tsx','utf8'),/session.clear\(\)/)
 assert.match(fs.readFileSync('src/components/sidebar.tsx','utf8'),/!account.enabled &&/)
})
test('server errors map validation, conflict and permissions without echoing messages',()=>{
 assert.equal(cloudError({code:'23514',message:'private contents'},true),'invalid')
 assert.equal(cloudError({code:'42501'},false),'unauthenticated');assert.equal(cloudError({code:'40001'},true),'conflict')
})

test('expired cloud session removes private data and shows a re-login error',async()=>{
 const f=fake(),s=new AccountSession(f.repos,()=>uuid(1));await s.load('A');await s.saveTrip(fixture,null)
 f.state.error={code:'42501'};await s.load('A')
 assert.equal(s.getSnapshot().error,'unauthenticated');assert.equal(s.getSnapshot().ready,false)
 assert.equal(s.getSnapshot().trips.length,0);assert.equal(s.getSnapshot().countries.length,0)
 s.clear();assert.equal(s.getSnapshot().userId,null)
})

test('cloud authorization loss invalidates Auth generation and the whole private workspace',()=>{
 const auth=fs.readFileSync('src/components/auth-provider.tsx','utf8'),provider=fs.readFileSync('src/components/account-provider.tsx','utf8')
 assert.match(provider,/session.subscribe\(\(\)=>\{if\(session.getSnapshot\(\).error==='unauthenticated'\)invalidateSession\(\)/)
 const body=auth.match(/const invalidateSession=useCallback\(\(refresh=false\)=>\{([\s\S]*?)\},\[\]\)/)[1]
 assert.match(body,/identity.current=null/);assert.match(body,/setGeneration\(n=>n\+1\)/);assert.match(body,/verifiedState\(null,true\)/)
})

test('country form cannot silently discard edits while loading and pauses passive refresh for pending edits',()=>{
 const panel=fs.readFileSync('src/components/country-panel.tsx','utf8'),provider=fs.readFileSync('src/components/account-provider.tsx','utf8')
 assert.match(panel,/<fieldset disabled=\{account.enabled && \(!account.snapshot.ready \|\| account.snapshot.busy\)\}/)
 assert.match(provider,/!editingCountry.current\)void session.load\(id\)/)
})

// Execute the actual Next route with verified-Auth/repository doubles. No database.
function accountRoute(owner,events){
 const mod={exports:{}}
 const source=ts.transpileModule(fs.readFileSync('src/app/api/account/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const repos={trips:{list:async()=>{events.push('read');return {ok:true,value:[]}},save:async()=>{events.push('write');return {ok:true,value:saved}}}}
 const req=name=>name==='@/lib/auth/server'?{serverAuth:async()=>({auth:{getUser:async()=>({data:{user:owner?{id:owner}:null},error:null})}})}:name==='@/lib/cloud-trips/supabase'?{supabaseRepositories:()=>repos}:name.startsWith('@/')?load('src/'+name.slice(2)+'.ts'):native(name)
 new vm.Script(`(function(exports,require){${source}\n})`).runInThisContext()(mod.exports,req);return mod.exports
}
test('actual API handler rejects stale-account GET/POST before any repository effect',async()=>{
 const {NextRequest}=native('next/server'),events=[],route=accountRoute(uuid(2),events)
 const get=new NextRequest(`https://preview.example/api/account?kind=trips&expectedUserId=${uuid(1)}`)
 const post=new NextRequest('https://preview.example/api/account',{method:'POST',headers:{Origin:'https://preview.example','Content-Type':'application/json'},body:JSON.stringify({expectedUserId:uuid(1),operation:'save-trip',command:mutation(fixture)})})
 for(const request of [get,post]){const r=await route[request.method](request);assert.equal(r.status,409);assert.equal((await r.json()).result.error,'account-changed');assert.equal(r.headers.get('Cache-Control'),'private, no-store, max-age=0')}
 assert.deepEqual(events,[])
 const missing=new NextRequest('https://preview.example/api/account?kind=trips');assert.equal((await route.GET(missing)).status,409)
 assert.deepEqual(events,[])
})
test('actual API handler accepts only matching verified owner and rejects unauthenticated writes',async()=>{
 const {NextRequest}=native('next/server'),events=[],route=accountRoute(uuid(1),events)
 const get=new NextRequest(`https://preview.example/api/account?kind=trips&expectedUserId=${uuid(1)}`)
 assert.equal((await route.GET(get)).status,200)
 const post=new NextRequest('https://preview.example/api/account',{method:'POST',headers:{Origin:'https://preview.example','Content-Type':'application/json'},body:JSON.stringify({expectedUserId:uuid(1),operation:'save-trip',command:mutation(fixture)})})
 assert.equal((await route.POST(post)).status,200);assert.deepEqual(events,['read','write'])
 const anon=accountRoute(null,events);assert.equal((await anon.GET(get)).status,401)
 const anonPost=new NextRequest('https://preview.example/api/account',{method:'POST',headers:{Origin:'https://preview.example','Content-Type':'application/json'},body:'{}'})
 assert.equal((await anon.POST(anonPost)).status,401);assert.deepEqual(events,['read','write'])
})
test('HTTP requests bind the expected owner before server reads and writes',async()=>{
 const calls=[],r=httpRepositories('A',async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({userId:'A',result:{ok:true,value:[]}}))})
 await r.trips.list();await r.trips.save(mutation(fixture))
 assert.equal(new URL(calls[0].url,'https://preview.example').searchParams.get('expectedUserId'),'A')
 assert.equal(JSON.parse(calls[1].init.body).expectedUserId,'A')
})
test('stale-owner responses clear private buffers and request immediate fresh verification',async()=>{
 const f=fake(),s=new AccountSession(f.repos,()=>uuid(1));await s.load('A');await s.saveTrip(fixture,null)
 f.repos.trips.list=async()=>({ok:false,error:'account-changed'});await s.load('A')
 assert.equal(s.getSnapshot().error,'account-changed');assert.equal(s.getSnapshot().ready,false);assert.equal(s.getSnapshot().trips.length,0)
 const provider=fs.readFileSync('src/components/account-provider.tsx','utf8'),auth=fs.readFileSync('src/components/auth-provider.tsx','utf8')
 assert.match(provider,/error==='account-changed'\)invalidateSession\(true\)/);assert.match(auth,/if\(refresh\)queueMicrotask/);assert.match(auth,/reverify.current=verify/)
})
