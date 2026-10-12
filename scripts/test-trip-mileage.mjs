import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import {createRequire} from 'node:module'
import {geoDistance} from 'd3-geo'
const native=createRequire(import.meta.url),cache=new Map()
function load(file){const p=path.resolve(file);if(cache.has(p))return cache.get(p)
 if(p.endsWith('.json')){const o=JSON.parse(fs.readFileSync(p,'utf8'));cache.set(p,o);return o}
 const exports={};cache.set(p,exports)
 const code=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 new vm.Script(`(function(exports,require){${code}\n})`).runInThisContext()(exports,n=>{if(!n.startsWith('.')&&!n.startsWith('@/'))return native(n);const f=n.startsWith('@/')?path.resolve('src',n.slice(2)):path.resolve(path.dirname(p),n);return load(path.extname(f)?f:f+'.ts')});return exports}
const {calculateFlightMileage,EARTH_CIRCUMFERENCE_KM}=load('src/lib/trip-mileage.ts')
const {greatCircleDistanceKm,buildArcDescriptors}=load('src/lib/travel-core/core.ts')
const {createTripDraft,addDraftStop,buildDraftTrip}=load('src/lib/trip-draft/core.ts')
const {toCoreAirports}=load('src/lib/airport-data/integration.ts')
const {AccountSession}=load('src/lib/cloud-trips/account.ts')
const catalog=load('src/lib/airport-data/catalog.ts').AIRPORT_CATALOG
const airport=code=>catalog.find(a=>a.iata===code)
const now='2026-10-12T00:00:00.000Z'
function record(id='one',codes=['TPE','NRT']){
 const draft=codes.reduce((d,c,i)=>addDraftStop(d,airport(c),id+':s'+i),{...createTripDraft(id),status:'completed'})
 return {draft,createdAt:now,updatedAt:now,revision:1}
}
const oracle=(a,b)=>6371*geoDistance([a.longitude,a.latitude],[b.longitude,b.latitude])
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`)
const freeze=o=>{if(o&&typeof o==='object'){Object.freeze(o);Object.values(o).forEach(freeze)}return o}

test('direct flight uses the saved coordinates and a separately implemented great-circle oracle',()=>{
 const s=calculateFlightMileage([record()]);near(s.totalKm,oracle(airport('TPE'),airport('NRT')))
 assert.ok(s.totalKm>2100&&s.totalKm<2300);assert.equal(s.flightLegCount,1)
 near(s.earthLaps,s.totalKm/40075);assert.equal(EARTH_CIRCUMFERENCE_KM,40075);assert.deepEqual(s.issues,[])
})
test('TPE DXB ATH totals two flight legs instead of the direct shortcut',()=>{
 const s=calculateFlightMileage([record('multi',['TPE','DXB','ATH'])])
 near(s.totalKm,oracle(airport('TPE'),airport('DXB'))+oracle(airport('DXB'),airport('ATH')))
 assert.equal(s.flightLegCount,2);assert.notEqual(Math.round(s.totalKm),Math.round(oracle(airport('TPE'),airport('ATH'))))
})
test('return legs within one trip both count',()=>{
 const s=calculateFlightMileage([record('return',['TPE','NRT','TPE'])])
 near(s.totalKm,2*oracle(airport('TPE'),airport('NRT')));assert.equal(s.flightLegCount,2)
})
test('separate return trips and repeated routes retain all independent flights',()=>{
 const records=[record('out'),record('back',['NRT','TPE']),record('again')]
 const s=calculateFlightMileage(records);near(s.totalKm,3*oracle(airport('TPE'),airport('NRT')));assert.equal(s.flightLegCount,3)
})
test('editing a saved airport recalculates rather than adding to an old total',()=>{
 const original=record(),edited=structuredClone(original);edited.draft.stops[1].airport=structuredClone(airport('KCZ'))
 const old=calculateFlightMileage([original]),next=calculateFlightMileage([edited])
 near(next.totalKm,oracle(airport('TPE'),airport('KCZ')));assert.notEqual(next.totalKm,old.totalKm);assert.equal(next.flightLegCount,1)
})
test('deleting trips removes only their own contribution; an empty account legitimately has zero',()=>{
 const a=record('a'),b=record('b',['TPE','DXB','ATH'])
 const all=calculateFlightMileage([a,b]),remaining=calculateFlightMileage([b])
 near(all.totalKm-remaining.totalKm,oracle(airport('TPE'),airport('NRT')))
 assert.equal(remaining.flightLegCount,2);assert.equal(calculateFlightMileage([]).totalKm,0)
})
for(const status of ['draft','planned','in_progress'])test(`${status} and past dates never enter saved-flight totals`,()=>{
 const r=record();r.draft.status=status;r.draft.legs[0].date='2000-01-01'
 assert.equal(calculateFlightMileage([r]).flightLegCount,0);assert.equal(calculateFlightMileage([r]).totalKm,0)
})
test('replayed saved records and repeated copies of the same leg are counted once by stable leg ID',()=>{
 const r=record('replay',['TPE','DXB','ATH']),copy=structuredClone(r)
 const s=calculateFlightMileage([r,copy]);assert.equal(s.flightLegCount,2);assert.equal(s.duplicateLegCount,2)
 near(s.totalKm,calculateFlightMileage([r]).totalKm)
 const direct=record();direct.draft.legs.push(structuredClone(direct.draft.legs[0]))
 assert.equal(calculateFlightMileage([direct]).flightLegCount,1)
})
test('conflicting versions of the same flight are excluded regardless of input order',()=>{
 const r=record(),conflict=structuredClone(r);conflict.draft.stops[1].airport=structuredClone(airport('KCZ'))
 for(const input of [[r,conflict],[conflict,r]]){
  const s=calculateFlightMileage(input);assert.equal(s.totalKm,null);assert.equal(s.earthLaps,null)
  assert.equal(s.flightLegCount,0);assert.equal(s.excludedLegCount,1);assert.equal(s.issues[0].reason,'duplicate')
 }
})
for(const [field,value] of [['latitude',null],['latitude',undefined],['latitude',NaN],['latitude',Infinity],['latitude','25'],['latitude',91],['longitude',-181]])test(`invalid ${field} (${String(value)}) is excluded rather than converted to zero`,()=>{
 const r=record();r.draft.stops[1].airport[field]=value
 const s=calculateFlightMileage([r]);assert.equal(s.totalKm,null);assert.equal(s.excludedLegCount,1);assert.equal(s.issues[0].reason,'coordinates')
})
test('unknown airport identity or code-only snapshots are excluded without guessing',()=>{
 for(const replacement of [null,{iata:'ZZZ',latitude:25,longitude:121},{...airport('NRT'),source:'unknown'},{...airport('NRT'),id:''}]){
  const r=record();r.draft.stops[1].airport=replacement
  const s=calculateFlightMileage([r]);assert.equal(s.totalKm,null);assert.equal(s.excludedLegCount,1);assert.equal(s.issues[0].reason,'airport')
 }
})
test('an identified historical airport without IATA/ICAO still uses its saved coordinate snapshot',()=>{
 const r=record();r.draft.stops[1].airport={...r.draft.stops[1].airport,iata:null,icao:null,closed:true,retired:true,latitude:36}
 const s=calculateFlightMileage([r]);assert.equal(s.flightLegCount,1)
 near(s.totalKm,oracle(r.draft.stops[0].airport,r.draft.stops[1].airport))
 assert.notEqual(s.totalKm,oracle(airport('TPE'),airport('NRT')),'Never replace historical coordinates with the latest catalog')
})
test('missing stop references, IDs and non-adjacent endpoints explicitly exclude incomplete legs',()=>{
 for(const patch of [{fromStopId:'unknown'},{toStopId:undefined},{id:undefined}]){
  const r=record();Object.assign(r.draft.legs[0],patch)
  const s=calculateFlightMileage([r]);assert.equal(s.totalKm,null);assert.equal(s.excludedLegCount,1);assert.equal(s.issues[0].reason,'incomplete')
 }
 const r=record('multi',['TPE','DXB','ATH']);r.draft.legs[0].toStopId=r.draft.stops[2].id
 const s=calculateFlightMileage([r]);assert.equal(s.excludedLegCount,1);assert.equal(s.flightLegCount,1)
})
test('ambiguous stop IDs and same-airport flights cannot be silently accepted',()=>{
 const r=record();r.draft.stops.push(structuredClone(r.draft.stops[0]))
 assert.equal(calculateFlightMileage([r]).flightLegCount,0)
 const same=record();same.draft.stops[1].airport=structuredClone(same.draft.stops[0].airport)
 assert.equal(calculateFlightMileage([same]).totalKm,null)
})
test('a completed record missing its flight list is flagged as an incomplete trip',()=>{
 const r=record();delete r.draft.legs
 const s=calculateFlightMileage([r]);assert.equal(s.totalKm,null);assert.equal(s.excludedTripCount,1);assert.equal(s.issues.length,1)
})
test('malformed records and unknown completion states are unavailable, not a false empty account',()=>{
 for(const input of [null,{}, {draft:null}, {draft:{status:'unknown'}}]){
  const s=calculateFlightMileage([input]);assert.equal(s.totalKm,null);assert.equal(s.excludedTripCount,1)
 }
})
test('partial data sums only valid legs and reports exclusions separately',()=>{
 const bad=record('bad',['TPE','DXB','ATH']);bad.draft.stops[2].airport.latitude=null
 const s=calculateFlightMileage([bad,record('good')]);assert.equal(s.flightLegCount,2);assert.equal(s.excludedLegCount,1)
 near(s.totalKm,oracle(airport('TPE'),airport('DXB'))+oracle(airport('TPE'),airport('NRT')))
})
test('great-circle calculation handles the date line, antipodes, poles and known zero distance',()=>{
 for(const [a,b] of [[{latitude:0,longitude:179},{latitude:0,longitude:-179}],[{latitude:0,longitude:0},{latitude:0,longitude:180}],[{latitude:90,longitude:10},{latitude:89,longitude:-170}]])near(greatCircleDistanceKm(a,b),oracle(a,b))
 near(greatCircleDistanceKm({latitude:0,longitude:0},{latitude:0,longitude:90}),6371*Math.PI/2)
 assert.equal(greatCircleDistanceKm({latitude:0,longitude:0},{latitude:0,longitude:0}),0)
 assert.equal(greatCircleDistanceKm({latitude:null,longitude:0},{latitude:0,longitude:0}),null)
})
test('arc descriptors and statistics share the same distance utility without reading visual arcs',()=>{
 const r=record('shared',['TPE','DXB','ATH']),trip=buildDraftTrip(r.draft)
 const arcs=buildArcDescriptors([trip],toCoreAirports(r.draft.stops.map(s=>s.airport)))
 near(calculateFlightMileage([r]).totalKm,arcs.reduce((sum,a)=>sum+a.distanceKm,0))
 arcs.push({...arcs[0],distanceKm:999999});assert.equal(calculateFlightMileage([r]).flightLegCount,2)
})
test('full precision is summed before display rounding and inputs remain unchanged',()=>{
 const records=freeze(Array.from({length:50},(_,i)=>record('precision'+i))),before=JSON.stringify(records)
 near(calculateFlightMileage(records).totalKm,50*oracle(airport('TPE'),airport('NRT')))
 assert.equal(JSON.stringify(records),before)
})
function repos(){const rows=new Map(),state={fail:false};return {rows,state,trips:{list:async()=>({ok:true,value:[...rows.values()]}),save:async c=>{
 if(state.fail)return {ok:false,error:'conflict'}
 const old=rows.get(c.id),next={draft:structuredClone(c.draft),createdAt:old?.createdAt??now,updatedAt:now,revision:(old?.revision??0)+1};rows.set(c.id,next);return {ok:true,value:next}
},remove:async c=>{rows.delete(c.id);return {ok:true,value:null}}},countries:{list:async()=>({ok:true,value:[]})}}}
test('acknowledged cloud CRUD drives mileage; failed/conflicting saves keep confirmed totals',async()=>{
 const r=repos(),session=new AccountSession(r,()=>crypto.randomUUID());await session.load('A')
 const a=record('a'),b=record('b',['TPE','DXB','ATH'])
 await session.saveTrip(a.draft,null);const before=calculateFlightMileage(session.getSnapshot().trips)
 r.state.fail=true;assert.equal((await session.saveTrip(b.draft,null)).ok,false)
 assert.deepEqual(calculateFlightMileage(session.getSnapshot().trips),before)
 r.state.fail=false;await session.saveTrip(b.draft,null);assert.equal(calculateFlightMileage(session.getSnapshot().trips).flightLegCount,3)
 const edited=record('a',['TPE','KCZ']);await session.saveTrip(edited.draft,1)
 near(calculateFlightMileage(session.getSnapshot().trips).totalKm,oracle(airport('TPE'),airport('KCZ'))+calculateFlightMileage([b]).totalKm)
 await session.removeTrip('b',1);assert.equal(calculateFlightMileage(session.getSnapshot().trips).flightLegCount,1)
})
test('account A/B snapshots and logout do not leak distance from another account',async()=>{
 const a=repos(),b=repos();a.rows.set('a',record('a',['TPE','DXB','ATH']))
 const sa=new AccountSession(a),sb=new AccountSession(b);await sa.load('A');await sb.load('B')
 assert.equal(calculateFlightMileage(sa.getSnapshot().trips).flightLegCount,2)
 assert.equal(calculateFlightMileage(sb.getSnapshot().trips).totalKm,0)
 sa.clear();assert.equal(calculateFlightMileage(sa.getSnapshot().trips).totalKm,0)
 assert.equal(sa.getSnapshot().userId,null)
})
test('all five mileage dictionaries are explicit, complete and interpolate the same fields',()=>{
 const exports={},source=fs.readFileSync('src/lib/i18n.ts','utf8')+'\nexport {en,fr,es,de,zhTW}'
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 new vm.Script(`(function(exports,require){${code}\n})`).runInThisContext()(exports,()=>({}))
 const keys=Object.keys(exports.en).filter(k=>k.startsWith('mileage.'))
 assert.ok(keys.length>=16)
 for(const dict of [exports.fr,exports.es,exports.de,exports.zhTW])for(const key of keys){
  assert.ok(dict[key]&&dict[key]!==key)
  assert.deepEqual([...dict[key].matchAll(/\{(\w+)\}/g)].map(m=>m[1]),[...exports.en[key].matchAll(/\{(\w+)\}/g)].map(m=>m[1]))
 }
})
