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
const { createTripDraft, addDraftStop, previewTripDraft } = load('src/lib/trip-draft/core.ts')
const { TRIPS_KEY, parseTripFile, validSavedDraft, readTripFile, writeTrip, savedTripToken } = load('src/lib/trip-storage/core.ts')
const { TripRepository } = load('src/lib/trip-storage/repository.ts')
const catalog = load('src/lib/airport-data/catalog.ts').AIRPORT_CATALOG
const now='2026-10-10T12:00:00Z',later='2026-10-11T12:00:00Z'
function draft(id='trip-1',codes=['TPE','DXB','ATH']) {
 const d=codes.reduce((d,c,i)=>addDraftStop(d,catalog.find(a=>a.iata===c),id+'-stop-'+i),createTripDraft(id))
 d.status='completed'; if(codes.length===3)d.stops[1].countryPresence='transit';return d
}
function memory(raw=null) {
 const data=new Map([['globetrotter:v1','legacy bytes'],['globetrotter','old bytes']]);if(raw!==null)data.set(TRIPS_KEY,raw)
 const writes=[];return {data,writes,getItem:k=>data.get(k)??null,setItem:(k,v)=>{writes.push(k);data.set(k,v)}}
}
const save=(s,d=draft(),token=null)=>writeTrip(s,s.getItem(TRIPS_KEY),d.id,token,d,now)
function frozen(o){if(o&&typeof o==='object'){Object.freeze(o);Object.values(o).forEach(frozen)}return o}

test('completed multi-stop snapshot roundtrips: two legs three events with stable airport IDs and Taiwan',()=>{
 const s=memory(),d=draft(),r=save(s,d);assert.equal(r.ok,true)
 const loaded=readTripFile(s);assert.equal(loaded.ok,true);assert.deepEqual(loaded.file.trips[0].draft,d)
 const p=previewTripDraft(loaded.file.trips[0].draft);assert.equal(p.kind,'ready');assert.deepEqual(p.footprint.countryTotals,{total:3,visited:2,transit:1})
 assert.equal(p.footprint.airports.find(a=>a.airportId===d.stops[1].airport.id).total,1)
})
test('only the independent key is written; original country bytes never read/written by operations',()=>{
 const s=memory();save(s);assert.deepEqual(s.writes,[TRIPS_KEY]);assert.equal(s.data.get('globetrotter:v1'),'legacy bytes');assert.equal(s.data.get('globetrotter'),'old bytes')
 const r=readTripFile(s).file.trips[0];writeTrip(s,s.getItem(TRIPS_KEY),r.draft.id,savedTripToken(r),null,now)
 assert.ok(s.writes.every(k=>k===TRIPS_KEY));assert.equal(s.data.get('globetrotter:v1'),'legacy bytes')
})
test('save/edit/delete do not mutate frozen drafts or snapshots',()=>{
 const s=memory(),d=frozen(draft()),before=JSON.stringify(d);const r=save(s,d);assert.equal(r.ok,true);assert.equal(JSON.stringify(d),before)
 const edit=structuredClone(d);edit.title='updated';const changed=writeTrip(s,r.raw,d.id,savedTripToken(r.record),frozen(edit),later)
 assert.equal(changed.ok,true);assert.equal(changed.file.trips.length,1);assert.equal(changed.record.createdAt,now);assert.equal(changed.record.updatedAt,later)
 assert.equal(r.record.draft.title,'');assert.equal(writeTrip(s,changed.raw,d.id,savedTripToken(changed.record),null,later).file.trips.length,0)
})
test('repeated identical save is idempotent and different trip IDs retain repeated routes',()=>{
 const s=memory(),a=save(s),token=savedTripToken(a.record),b=writeTrip(s,a.raw,'trip-1',token,draft(),later)
 assert.equal(b.ok,true);assert.equal(b.file.trips.length,1);assert.equal(b.record.updatedAt,now)
 assert.equal(writeTrip(s,b.raw,'trip-1',null,draft(),later).error,'conflict')
 assert.equal(save(s,draft('trip-2')).file.trips.length,2)
})
test('optional fields and per-leg details survive browser reload parsing',()=>{
 const s=memory(),d=draft();d.legs[0].airline='中華航空';d.legs[0].date='';d.legs[1].flightNumber='EK209';d.legs[1].notes='second leg';assert.equal(save(s,d).ok,true)
 const loaded=parseTripFile(s.getItem(TRIPS_KEY)).trips[0].draft
 assert.equal(loaded.legs[0].airline,'中華航空');assert.equal(loaded.legs[1].flightNumber,'EK209');assert.equal(loaded.legs[0].flightNumber,undefined)
})
for(const status of ['draft','planned','in_progress'])test(status+' cannot be persisted as an actual saved trip',()=>{
 const s=memory(),d=draft();d.status=status;assert.equal(save(s,d).error,'invalid');assert.equal(s.getItem(TRIPS_KEY),null)
})
test('invalid topology, date, stop/flight IDs, lengths and airport snapshots are rejected',()=>{
 const mutations=[d=>d.legs.reverse(),d=>d.legs[0].date='2026-02-30',d=>d.stops[1].id=d.stops[0].id,d=>d.legs[1].id=d.legs[0].id,d=>d.title='x'.repeat(201),d=>d.legs[0].notes='x'.repeat(2001),d=>d.stops[0].airport.latitude=NaN,d=>d.stops[0].airport.isoCountryCode='CN',d=>d.stops[0].airport.sourceId=null,d=>d.stops[0].airport.history=[{}],d=>d.stops[0].countryPresence='invalid']
 for(const mutate of mutations){const d=draft();mutate(d);assert.equal(validSavedDraft(d),false);const s=memory();assert.equal(save(s,d).error,'invalid');assert.equal(s.writes.length,0)}
})
test('pending special areas remain blocked by the existing country policy',()=>{
 const d=draft('hk',['TPE','HKG']);assert.equal(validSavedDraft(d),false);assert.equal(save(memory(),d).error,'invalid')
})
test('corrupt JSON, unknown versions and one invalid record block all writes without destroying bytes',()=>{
 const good=save(memory()).file
 for(const raw of ['{oops',JSON.stringify({...good,version:2}),JSON.stringify({...good,trips:[...good.trips,{}]}),'x'.repeat(4_000_001)]){
  const s=memory(raw);assert.equal(readTripFile(s).error,'corrupt');assert.equal(save(s).error,'corrupt');assert.equal(s.getItem(TRIPS_KEY),raw);assert.equal(s.writes.length,0)
 }
})
test('duplicate saved IDs and invalid record timestamps are corrupt, not silently deduplicated',()=>{
 const good=save(memory()).record
 for(const trips of [[good,good],[{...good,createdAt:'not a date'}],[{...good,createdAt:'2026-02-30T12:00:00Z'}],[{...good,updatedAt:'2025-01-01T00:00:00Z'}]])assert.equal(readTripFile(memory(JSON.stringify({version:1,trips}))).error,'corrupt')
})
test('quota failure retains previous saved bytes and all unsaved input',()=>{
 const s=memory();const a=save(s),d=draft();d.title='unsaved edits';s.setItem=()=>{throw new Error('quota')}
 assert.equal(writeTrip(s,a.raw,d.id,savedTripToken(a.record),d,later).error,'unavailable');assert.equal(s.getItem(TRIPS_KEY),a.raw);assert.equal(d.title,'unsaved edits')
})
test('denied storage access returns unavailable without claiming success',()=>{
 const s={getItem(){throw new Error('denied')},setItem(){throw new Error('denied')}}
 assert.equal(readTripFile(s).error,'unavailable');assert.equal(writeTrip(s,null,'id',null,draft(),now).error,'unavailable')
})
test('stale file or same-record token refuses cross-tab overwrite and stale deletion',()=>{
 const s=memory(),a=save(s),token=savedTripToken(a.record),d=draft();d.title='other tab'
 const b=writeTrip(s,a.raw,d.id,token,d,later);assert.equal(b.ok,true)
 assert.equal(writeTrip(s,a.raw,'trip-2',null,draft('trip-2'),later).error,'conflict')
 assert.equal(writeTrip(s,b.raw,d.id,token,draft(),later).error,'conflict')
 assert.equal(writeTrip(s,b.raw,d.id,token,null,later).error,'conflict');assert.equal(s.getItem(TRIPS_KEY),b.raw)
})
test('repository server snapshot is storage-free and hydration is read-only',()=>{
 const s=memory(),repo=new TripRepository(()=>s);assert.equal(repo.getServerSnapshot().ready,false);assert.equal(repo.getSnapshot().ready,false)
 const unsub=repo.subscribe(()=>{});assert.equal(repo.getSnapshot().ready,true);assert.equal(s.writes.length,0);unsub()
})
test('repository publishes successful writes, survives reload and deletes only the selected trip',()=>{
 const s=memory(),repo=new TripRepository(()=>s);repo.subscribe(()=>{})
 const a=repo.save(draft(),null);assert.equal(a.ok,true);assert.equal(repo.save(draft('trip-2'),null).ok,true)
 const other=new TripRepository(()=>s);other.subscribe(()=>{});assert.equal(other.getSnapshot().trips.length,2)
 assert.equal(other.remove('trip-1',savedTripToken(a.record)).ok,true);assert.equal(other.getSnapshot().trips[0].draft.id,'trip-2');assert.equal(s.data.get('globetrotter:v1'),'legacy bytes')
})
test('repository protects damaged storage and never persists on reload or construction',()=>{
 const s=memory('{bad'),repo=new TripRepository(()=>s);repo.subscribe(()=>{})
 assert.equal(repo.getSnapshot().error,'corrupt');assert.equal(repo.save(draft(),null).error,'corrupt');repo.reload();assert.equal(s.getItem(TRIPS_KEY),'{bad');assert.equal(s.writes.length,0)
})

test('shared stop/flight identities across independent saved trips are rejected before later integration',()=>{
 const first=draft(),second=draft('trip-2');second.stops[0].id=first.stops[0].id;second.legs[0].fromStopId=first.stops[0].id
 const records=[first,second].map(d=>({draft:d,createdAt:now,updatedAt:now}))
 assert.equal(readTripFile(memory(JSON.stringify({version:1,trips:records}))).error,'corrupt')
})
