import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'

const nativeRequire = createRequire(import.meta.url), cache = new Map()
function load(file) {
  const absolute = path.resolve(file)
  if (cache.has(absolute)) return cache.get(absolute)
  if (absolute.endsWith('.json')) {
    const value = JSON.parse(fs.readFileSync(absolute, 'utf8')); cache.set(absolute,value); return value
  }
  const loaded = { exports: {} }; cache.set(absolute,loaded.exports)
  const compiled = ts.transpileModule(fs.readFileSync(absolute,'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  function requireModule(name) {
    if (!name.startsWith('.') && !name.startsWith('@/')) return nativeRequire(name)
    const resolved = name.startsWith('@/') ? path.resolve('src',name.slice(2)) : path.resolve(path.dirname(absolute),name)
    return load(path.extname(resolved) ? resolved : resolved + '.ts')
  }
  new vm.Script(`(function(exports,require){${compiled}\n})`).runInThisContext()(loaded.exports,requireModule)
  return loaded.exports
}
const { createTripDraft, addDraftStop } = load('src/lib/trip-draft/core.ts')
const { FakeCloudDatabase } = load('src/lib/cloud-trips/fake.ts')
const { PrivateTripSession } = load('src/lib/cloud-trips/session.ts')
const { savedTripMap } = load('src/lib/trip-map/core.ts')
const catalog = load('src/lib/airport-data/catalog.ts').AIRPORT_CATALOG
const draft=(id='trip-a')=>{const d=['TPE','DXB','ATH'].reduce((d,c,i)=>addDraftStop(d,catalog.find(a=>a.iata===c),id+'-stop-'+i),createTripDraft(id));d.status='completed';d.stops[1].countryPresence='transit';return d}
const rid=label=>{const h=nativeRequire('node:crypto').createHash('md5').update(label).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`}
const command=(d=draft(),revision=null,requestId='request-1')=>({id:d.id,draft:d,expectedRevision:revision,requestId:rid(requestId)})
const db=()=>new FakeCloudDatabase(()=> '2026-10-10T12:00:00.000Z')
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}

test('anonymous repository cannot read or mutate private data',async()=>{
 const r=db().forVerifiedTestUser(null);assert.equal((await r.list()).error,'unauthenticated');assert.equal((await r.save(command())).error,'unauthenticated');assert.equal((await r.remove(command())).error,'unauthenticated')
})
test('two owners can use same trip ID without reading or modifying each other',async()=>{
 const d=db(),a=d.forVerifiedTestUser('A'),b=d.forVerifiedTestUser('B');await a.save(command());assert.deepEqual((await b.list()).value,[])
 assert.equal((await b.remove({id:'trip-a',expectedRevision:1,requestId:rid('b-delete')})).error,'conflict')
 const own=draft();own.title='B';await b.save(command(own));assert.equal((await a.list()).value[0].draft.title,'');assert.equal((await b.list()).value[0].draft.title,'B')
})
test('create edit delete retain stable trip and airport identities and increment versions',async()=>{
 const r=db().forVerifiedTestUser('A');const a=await r.save(command());assert.equal(a.value.revision,1)
 const edit=draft();edit.title='edited';const b=await r.save(command(edit,1,'request-2'));assert.equal(b.value.revision,2);assert.equal(b.value.createdAt,a.value.createdAt)
 assert.equal((await r.remove({id:edit.id,expectedRevision:2,requestId:rid('delete')})).ok,true);assert.deepEqual((await r.list()).value,[])
})
test('same mutation replay is idempotent; changed payload cannot reuse request ID',async()=>{
 const r=db().forVerifiedTestUser('A');const a=await r.save(command());assert.deepEqual(await r.save(command()),a)
 const edited=draft();edited.title='changed';assert.equal((await r.save(command(edited))).error,'conflict');assert.equal((await r.list()).value.length,1)
})
test('parallel duplicate creates preserve a single independent record',async()=>{
 const r=db().forVerifiedTestUser('A');const replies=await Promise.all([r.save(command()),r.save(command())]);assert.ok(replies.every(x=>x.ok));assert.equal((await r.list()).value.length,1)
})
test('stale versions and old request replay after later edits are conflicts',async()=>{
 const r=db().forVerifiedTestUser('A');await r.save(command());const edit=draft();edit.title='new';await r.save(command(edit,1,'new'))
 assert.equal((await r.save(command(draft(),1,'stale'))).error,'conflict');assert.equal((await r.save(command())).error,'conflict');assert.equal((await r.list()).value[0].draft.title,'new')
})
test('delete replay succeeds without resurrecting record; delayed create cannot recreate tombstone',async()=>{
 const r=db().forVerifiedTestUser('A');await r.save(command());const remove={id:'trip-a',expectedRevision:1,requestId:rid('delete')}
 assert.equal((await r.remove(remove)).ok,true);assert.equal((await r.remove(remove)).ok,true);assert.equal((await r.save(command())).error,'conflict');assert.deepEqual((await r.list()).value,[])
})
test('incomplete or invalid trip does not enter cloud footprint',async()=>{
 const r=db().forVerifiedTestUser('A'),d=draft();d.status='draft';assert.equal((await r.save(command(d))).error,'invalid');assert.deepEqual((await r.list()).value,[])
})
test('network failure keeps committed data and unsaved inputs unchanged',async()=>{
 const d=db(),r=d.forVerifiedTestUser('A');await r.save(command());const edit=draft();edit.title='unsaved';const before=JSON.stringify(edit);d.failNext='network'
 assert.equal((await r.save(command(edit,1,'edit'))).error,'network');assert.equal((await r.list()).value[0].draft.title,'');assert.equal(JSON.stringify(edit),before)
})
test('cloud snapshots feed existing colors routes and manual union without new calculation rules',async()=>{
 const r=db().forVerifiedTestUser('A');await r.save(command());const p=savedTripMap((await r.list()).value,{'250':'visited','784':'wishlist'})
 assert.equal(p.colors['158'],'#22c55e');assert.equal(p.colors['784'],'#3b82f6');assert.equal(p.colors['300'],'#22c55e');assert.equal(p.countryCount,4);assert.equal(p.flightCount,2);assert.equal(p.arcs.length,2)
 const upgraded=savedTripMap((await r.list()).value,{'784':'visited'});assert.equal(upgraded.colors['784'],'#22c55e');assert.equal(upgraded.countryCount,3)
})
test('repository reads and writes clone input/output; no shared mutable state',async()=>{
 const r=db().forVerifiedTestUser('A'),d=draft();await r.save(command(d));d.title='mutated';const list=(await r.list()).value;list[0].draft.title='mutated';assert.equal((await r.list()).value[0].draft.title,'')
})
test('logout clears private maps immediately and ignores late loading replies',async()=>{
 const pending=deferred(),s=new PrivateTripSession(()=>({list:()=>pending.promise}));const load=s.acceptVerifiedUser('A');s.beginLogout();assert.deepEqual(s.getSnapshot().trips,[]);s.signedOut()
 pending.resolve({ok:true,value:[{draft:draft(),createdAt:'now',updatedAt:'now',revision:1}]});await load
 assert.equal(s.getSnapshot().userId,null);assert.equal(savedTripMap(s.getSnapshot().trips,{}).countryCount,0)
})
test('account switch rejects stale A response after B has loaded',async()=>{
 const pending=deferred(),s=new PrivateTripSession(u=>({list:()=>u==='A'?pending.promise:Promise.resolve({ok:true,value:[]})}));const a=s.acceptVerifiedUser('A');await s.acceptVerifiedUser('B');pending.resolve({ok:true,value:[{draft:draft()}]});await a
 assert.equal(s.getSnapshot().userId,'B');assert.deepEqual(s.getSnapshot().trips,[])
})
test('sync failure preserves formal map; successful save publishes acknowledged row only',async()=>{
 const d=db(),s=new PrivateTripSession(u=>d.forVerifiedTestUser(u));await s.acceptVerifiedUser('A');d.failNext='network';assert.equal((await s.save(command())).error,'network');assert.equal(s.getSnapshot().trips.length,0)
 assert.equal((await s.save(command())).ok,true);assert.equal(savedTripMap(s.getSnapshot().trips,{}).countryCount,3)
})
test('save completing after logout never repopulates private UI',async()=>{
 const pending=deferred(),s=new PrivateTripSession(()=>({list:async()=>({ok:true,value:[]}),save:()=>pending.promise}));await s.acceptVerifiedUser('A');const write=s.save(command());s.signedOut();pending.resolve({ok:true,value:{draft:draft(),revision:1}});assert.equal((await write).ok,false);assert.deepEqual(s.getSnapshot().trips,[])
})
test('duplicate UI writes are busy until acknowledgement; error thrown after commit is uncertain',async()=>{
 const d=db(),r=d.forVerifiedTestUser('A'),pending=deferred(),s=new PrivateTripSession(()=>({...r,save:()=>pending.promise}));await s.acceptVerifiedUser('A');const write=s.save(command());assert.equal((await s.save(command())).error,'busy');pending.resolve({ok:false,error:'network'});await write
 const uncertain=new PrivateTripSession(()=>({...r,save:async c=>{await r.save(c);throw new Error('response lost')}}));await uncertain.acceptVerifiedUser('A');assert.equal((await uncertain.save(command())).error,'uncertain');assert.deepEqual(uncertain.getSnapshot().trips,[]);assert.equal((await r.list()).value.length,1);assert.equal((await r.save(command())).value.revision,1)
})
test('review SQL scopes both tables and RPCs to owner; no anonymous writes/definer bypass',()=>{
 const sql=fs.readFileSync('sql/review/001_stage_d1.sql','utf8');for(const table of ['trips','country_records'])assert.ok(sql.includes(`alter table public.${table} force row level security`))
 assert.equal((sql.match(/create policy /g)||[]).length,6);assert.ok(sql.includes('with check ((select auth.uid()) = user_id)'));assert.equal((sql.match(/security invoker/g)||[]).length,3);assert.ok(!sql.toLowerCase().includes('security definer'));assert.ok(sql.includes('on delete cascade'));assert.ok(sql.includes('pg_advisory_xact_lock'));assert.ok(sql.includes('last_expected_revision'));assert.ok(sql.includes("p_payload is null then 'delete'"))
})

test('session snapshots have stable immutable references for future React subscriptions',async()=>{
 const d=db(),s=new PrivateTripSession(u=>d.forVerifiedTestUser(u));assert.equal(s.getSnapshot(),s.getSnapshot());await s.acceptVerifiedUser('A');await s.save(command());const snapshot=s.getSnapshot();assert.equal(snapshot,s.getSnapshot());assert.ok(Object.isFrozen(snapshot.trips[0].draft));assert.throws(()=>{snapshot.trips[0].draft.title='tamper'});assert.equal(s.getSnapshot().trips[0].draft.title,'')
})

test('transport rejects malformed mutation UUID before writing',async()=>{const r=db().forVerifiedTestUser('A');assert.equal((await r.save({...command(),requestId:'not-a-uuid'})).error,'invalid');assert.deepEqual((await r.list()).value,[])})

test('expired verified session clears previous private rows instead of retaining them as network error',async()=>{
 const d=db(),r=d.forVerifiedTestUser('A');await r.save(command());const s=new PrivateTripSession(()=>({...r,save:async()=>({ok:false,error:'unauthenticated'})}));await s.acceptVerifiedUser('A');assert.equal(s.getSnapshot().trips.length,1);assert.equal((await s.save(command(draft(),1,'edit'))).error,'unauthenticated');assert.equal(s.getSnapshot().userId,null);assert.deepEqual(s.getSnapshot().trips,[])
})
