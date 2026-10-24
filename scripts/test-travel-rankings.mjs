import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import {createRequire} from 'node:module'
const native=createRequire(import.meta.url),cache=new Map()
function load(file){const p=path.resolve(file);if(cache.has(p))return cache.get(p)
 if(p.endsWith('.json')){const o=JSON.parse(fs.readFileSync(p,'utf8'));cache.set(p,o);return o}
 const exports={};cache.set(p,exports)
 const code=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 new vm.Script(`(function(exports,require){${code}\n})`).runInThisContext()(exports,n=>{if(!n.startsWith('.')&&!n.startsWith('@/'))return native(n);const f=n.startsWith('@/')?path.resolve('src',n.slice(2)):path.resolve(path.dirname(p),n);return load(path.extname(f)?f:f+'.ts')});return exports}
const {calculateFlightMileage}=load('src/lib/trip-mileage.ts')
const {createTripDraft,addDraftStop}=load('src/lib/trip-draft/core.ts')
const {AccountSession}=load('src/lib/cloud-trips/account.ts')
const catalog=load('src/lib/airport-data/catalog.ts').AIRPORT_CATALOG
const airport=code=>catalog.find(a=>a.iata===code)
const now='2026-10-12T00:00:00.000Z'
function record(id='one',codes=['TPE','NRT']){
 const draft=codes.reduce((d,c,i)=>addDraftStop(d,airport(c),id+':s'+i),{...createTripDraft(id),status:'completed'})
 return {draft,createdAt:now,updatedAt:now,revision:1}
}
const freeze=o=>{if(o&&typeof o==='object'){Object.freeze(o);Object.values(o).forEach(freeze)}return o}

const {selectTripRecords,tripDepartureDate}=load('src/lib/trip-records-order.ts')
const {calculateTravelRankings,resolveRecordedAirline}=load('src/lib/travel-rankings.ts')
const {collectSavedFlightLegs}=load('src/lib/saved-flight-legs.ts')
const dated=(id,date,updated='2026-10-13T00:00:00.000Z')=>{const r=record(id);r.updatedAt=updated;if(date)r.draft.legs[0].date=date;return r}
const ids=rows=>rows.map(r=>r.draft.id)
const airportCounts=rows=>Object.fromEntries(calculateTravelRankings(rows).airports.map(r=>[r.airport.iata,r.count]))
const airlineCounts=rows=>Object.fromEntries(calculateTravelRankings(rows).airlines.map(r=>[r.id,r.count]))
test('default sorting uses departure rather than creation/update time',()=>{
 const old=dated('old','2024-12-01'),newer=dated('new','2026-01-01','2020-01-01T00:00:00Z')
 assert.deepEqual(ids(selectTripRecords([old,newer])),['new','old'])
 assert.deepEqual(ids(selectTripRecords([old,newer],'date-asc')),['old','new'])
 assert.deepEqual(ids(selectTripRecords([old,newer],'updated-desc')),['old','new'])
})
test('same-date sorting is stable even if updated dates differ',()=>{
 const a=dated('a','2026-01-01'),b=dated('b','2026-01-01','2000-01-01T00:00:00Z')
 for(const order of ['date-asc','date-desc'])assert.deepEqual(ids(selectTripRecords([b,a],order)),['b','a'])
})
test('undated trips appear last in either date direction and retain their order',()=>{
 const r=[dated('none1'),dated('a','2026-01-02'),dated('none2'),dated('b','2026-01-01')]
 assert.deepEqual(ids(selectTripRecords(r)),['a','b','none1','none2'])
 assert.deepEqual(ids(selectTripRecords(r,'date-asc')),['b','a','none1','none2'])
})
test('departure is the first route leg, never the earliest timestamp or later dated leg',()=>{
 const r=record('date-line',['TPE','DXB','ATH']);r.draft.legs[0].date='2026-10-09';r.draft.legs[1].date='2026-10-08'
 assert.equal(tripDepartureDate(r),'2026-10-09');delete r.draft.legs[0].date;assert.equal(tripDepartureDate(r),null)
})
test('invalid calendar dates are undated; leap dates are handled without timezone conversion',()=>{
 for(const date of ['2025-02-29','2026-04-31','2026-13-01','2026-1-01','not a date'])assert.equal(tripDepartureDate(dated('d',date)),null)
 assert.equal(tripDepartureDate(dated('leap','2024-02-29')),'2024-02-29')
})
test('search and date sorting compose without removing the old updated sort',()=>{
 const a=dated('a','2026-01-01'),b=dated('b','2026-01-03'),c=dated('c','2026-01-02');a.draft.title='日本';b.draft.title='日本';c.draft.title='法國'
 assert.deepEqual(ids(selectTripRecords([a,b,c],'date-asc','日本')),['a','b'])
 assert.deepEqual(ids(selectTripRecords([a,b,c],'date-desc','日本')),['b','a'])
 assert.equal(selectTripRecords([a,b,c],'date-desc',' tpe ').length,3)
 assert.equal(selectTripRecords([a],'date-desc','華航').length,0)
 a.draft.legs[0].airline='華航';assert.equal(selectTripRecords([a],'date-desc','華航').length,1)
 assert.equal(selectTripRecords([a],'date-desc','unknown').length,0)
})
test('sort and rankings are immutable and do not touch browser storage or map sources',()=>{
 const input=freeze([dated('b','2026-02-01'),dated('a','2026-01-01')]),before=JSON.stringify(input)
 selectTripRecords(input,'date-asc');calculateTravelRankings(input)
 assert.equal(JSON.stringify(input),before)
 for(const file of ['trip-records-order.ts','travel-rankings.ts','saved-flight-legs.ts'])assert.doesNotMatch(fs.readFileSync('src/lib/'+file,'utf8'),/localStorage|supabase|arcsData/)
})
test('direct flight counts one use at each endpoint',()=>assert.deepEqual(airportCounts([record()]),{NRT:1,TPE:1}))
test('connecting flights count DXB twice, while the original stop-event footprint still counts it once',()=>{
 const r=record('connect',['TPE','DXB','ATH']);r.draft.stops[1].countryPresence='transit'
 assert.deepEqual(airportCounts([r]),{DXB:2,ATH:1,TPE:1})
 const fp=load('src/lib/trip-draft/core.ts').previewTripDraft(r.draft)
 assert.equal(fp.kind,'ready')
 const dxb=fp.footprint.airports.find(a=>a.airportId===airport('DXB').id)
 assert.equal(dxb?.total,1)
})
test('return and independent repeated routes count all distinct flight IDs',()=>{
 assert.deepEqual(airportCounts([record('round',['TPE','NRT','TPE']),record('again')]),{TPE:3,NRT:3})
})
test('all ranking counts use the same validated unique leg collection as mileage',()=>{
 const r=record('connect',['TPE','DXB','ATH']),copy=structuredClone(r)
 const rank=calculateTravelRankings([r,copy]),miles=calculateFlightMileage([r,copy])
 assert.equal(rank.validLegCount,miles.flightLegCount);assert.equal(rank.duplicateLegCount,2)
 assert.deepEqual(airportCounts([r,copy]),airportCounts([r]));assert.equal(collectSavedFlightLegs([r,copy]).legs.length,2)
})
test('conflicting leg IDs are excluded from both rankings and mileage in either input order',()=>{
 const r=record(),bad=structuredClone(r);bad.draft.stops[1].airport=structuredClone(airport('KCZ'))
 for(const input of [[r,bad],[bad,r]]){const s=calculateTravelRankings(input);assert.equal(s.validLegCount,0);assert.equal(s.excludedLegCount,1);assert.deepEqual(s.airports,[])}
})
test('source IDs normalize changed airport names/codes without rewriting saved snapshots',()=>{
 const a=record('a'),b=record('b');b.draft.stops[0].airport={...airport('TPE'),name:'Renamed airport',iata:'XXX',updatedAt:'2099-01-01'}
 const rank=calculateTravelRankings([a,b]),tpe=rank.airports.find(r=>r.id==='ourairports:'+airport('TPE').sourceId)
 assert.equal(tpe.count,2);assert.equal(tpe.airport.name,'Renamed airport');assert.equal(tpe.airport.iata,'XXX')
 assert.equal(a.draft.stops[0].airport.iata,'TPE')
})
test('two distinct airports with the same IATA or name are never merged',()=>{
 const a=record('a'),b=record('b');b.draft.stops[0].airport={...airport('TPE'),id:'distinct',sourceId:'999999999'}
 const rows=calculateTravelRankings([a,b]).airports.filter(r=>r.airport.iata==='TPE');assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.count),[1,1])
})
test('an airport ID attached to conflicting source IDs is explicitly excluded',()=>{
 const a=record('a'),b=record('b');b.draft.stops[0].airport={...airport('TPE'),sourceId:'999999999'}
 const rank=calculateTravelRankings([a,b]);assert.equal(rank.airportConflicts,2);assert.equal(rank.airports.length,1);assert.equal(rank.airports[0].airport.iata,'NRT')
})
test('missing coordinates/unknown identities/malformed routes are excluded rather than inferred',()=>{
 for(const edit of [r=>{r.draft.stops[0].airport.latitude=null},r=>{r.draft.stops[0].airport.source='unknown'},r=>{r.draft.legs[0].fromStopId='wrong'}]){
  const r=record();edit(r);const rank=calculateTravelRankings([r]);assert.equal(rank.excludedLegCount,1);assert.deepEqual(rank.airports,[])
 }
})
for(const status of ['draft','planned','in_progress'])test(`${status} does not enter any rankings`,()=>{
 const r=record();r.draft.status=status;r.draft.legs[0].airline='CI';const rank=calculateTravelRankings([r]);assert.equal(rank.validLegCount,0);assert.deepEqual(rank.airlines,[]);assert.deepEqual(rank.airports,[])
})
test('empty accounts have friendly empty data, not example rankings',()=>{
 const s=calculateTravelRankings([]);assert.deepEqual(s.airports,[]);assert.deepEqual(s.airlines,[]);assert.equal(s.validLegCount,0)
})
test('Chinese English IATA and stored autocomplete values normalize exactly to the same carrier',()=>{
 const values=['CI','ci','China Airlines','中華航空','華航','中华航空','CI · China Airlines','ＣＩ · China Airlines','CI · 中華航空']
 assert.ok(values.every(v=>resolveRecordedAirline(v)?.iata==='CI'))
 const input=values.map((v,i)=>{const r=record('airline'+i);r.draft.legs[0].airline=v;return r})
 assert.deepEqual(airlineCounts(input),{CI:values.length})
})
test('substring matches and conflicting code/name do not guess an airline',()=>{
 for(const v of ['China','CI100','BR · China Airlines','unknown airline'])assert.equal(resolveRecordedAirline(v),null)
 const r=record();r.draft.legs[0].airline='BR · China Airlines';const s=calculateTravelRankings([r]);assert.equal(s.unknownAirlines,1);assert.deepEqual(s.airlines,[])
})
test('parent companies and operating subsidiaries remain distinct',()=>{
 const input=['AK','FD','D7','JQ','GK'].map((code,i)=>{const r=record('sub'+i);r.draft.legs[0].airline=code;return r})
 assert.equal(calculateTravelRankings(input).airlines.length,5)
})
test('each leg uses its own airline and leaves blank values out of airline rankings only',()=>{
 const r=record('multi',['TPE','DXB','ATH']);r.draft.legs[0].airline='CI';r.draft.legs[1].airline='Emirates'
 assert.deepEqual(airlineCounts([r]),{CI:1,EK:1});delete r.draft.legs[0].airline
 const rank=calculateTravelRankings([r]);assert.equal(rank.missingAirlines,1);assert.equal(rank.validLegCount,2);assert.deepEqual(airlineCounts([r]),{EK:1})
})
test('replayed airline aliases count once, while contradictory carriers are excluded without affecting distance or airports',()=>{
 const a=record();a.draft.legs[0].airline='CI';const b=structuredClone(a);b.draft.legs[0].airline='China Airlines'
 assert.deepEqual(airlineCounts([a,b]),{CI:1});b.draft.legs[0].airline='BR'
 const s=calculateTravelRankings([a,b]);assert.equal(s.conflictingAirlines,1);assert.deepEqual(s.airlines,[]);assert.equal(s.validLegCount,1);assert.deepEqual(airportCounts([a,b]),airportCounts([a]))
 assert.equal(calculateFlightMileage([a,b]).totalKm,calculateFlightMileage([a]).totalKm)
})
test('a missing airline and a conflicting populated replay are never arbitrarily chosen',()=>{
 const a=record(),b=structuredClone(a);b.draft.legs[0].airline='CI'
 const s=calculateTravelRankings([a,b]);assert.equal(s.conflictingAirlines,1);assert.deepEqual(s.airlines,[])
})
test('descending ranking ties have deterministic order independent of arrival order',()=>{
 const a=record('a');a.draft.legs[0].airline='CI';const b=record('b');b.draft.legs[0].airline='BR'
 assert.deepEqual(calculateTravelRankings([a,b]),calculateTravelRankings([b,a]))
 const c=record('c');c.draft.legs[0].airline='CI';assert.deepEqual(airlineCounts([b,a,c]),{CI:2,BR:1})
})
function repos(){const rows=new Map(),state={fail:false};return {rows,state,trips:{list:async()=>({ok:true,value:[...rows.values()]}),save:async c=>{
 if(state.fail)return {ok:false,error:'conflict'}
 const old=rows.get(c.id),next={draft:structuredClone(c.draft),createdAt:old?.createdAt??now,updatedAt:now,revision:(old?.revision??0)+1};rows.set(c.id,next);return {ok:true,value:next}
},remove:async c=>{rows.delete(c.id);return {ok:true,value:null}}},countries:{list:async()=>({ok:true,value:[]})}}}
test('confirmed cloud CRUD recalculates rankings; save conflicts retain confirmed counts',async()=>{
 const r=repos(),session=new AccountSession(r,()=>crypto.randomUUID());await session.load('A')
 const a=record('a');a.draft.legs[0].airline='CI';await session.saveTrip(a.draft,null)
 const before=calculateTravelRankings(session.getSnapshot().trips)
 r.state.fail=true;const b=record('b',['TPE','DXB','ATH']);assert.equal((await session.saveTrip(b.draft,null)).ok,false)
 assert.deepEqual(calculateTravelRankings(session.getSnapshot().trips),before)
 r.state.fail=false;await session.saveTrip(b.draft,null);assert.equal(calculateTravelRankings(session.getSnapshot().trips).validLegCount,3)
 a.draft.legs[0].airline='BR';await session.saveTrip(a.draft,1);assert.deepEqual(airlineCounts(session.getSnapshot().trips),{BR:1})
 await session.removeTrip('a',2);assert.deepEqual(airlineCounts(session.getSnapshot().trips),{});assert.equal(calculateTravelRankings(session.getSnapshot().trips).validLegCount,2)
})
test('account switching/loading/logout cannot expose another account rankings',async()=>{
 const a=repos(),b=repos();a.rows.set('a',record('a'));const sa=new AccountSession(a),sb=new AccountSession(b)
 await sa.load('A');await sb.load('B');assert.equal(calculateTravelRankings(sa.getSnapshot().trips).airports.length,2)
 assert.equal(calculateTravelRankings(sb.getSnapshot().trips).airports.length,0);sa.clear();assert.equal(calculateTravelRankings(sa.getSnapshot().trips).airports.length,0)
})
test('all five sort/ranking dictionaries exist and interpolate matching parameters',()=>{
 const exports={},source=fs.readFileSync('src/lib/i18n.ts','utf8')+'\nexport {en,fr,es,de,zhTW}'
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 new vm.Script(`(function(exports,require){${code}\n})`).runInThisContext()(exports,()=>({}))
 const keys=Object.keys(exports.en).filter(k=>k.startsWith('tripOrder.')||k.startsWith('rankings.'));assert.equal(keys.length,27)
 for(const dict of [exports.fr,exports.es,exports.de,exports.zhTW])for(const key of keys){assert.ok(dict[key]&&dict[key]!==key);assert.deepEqual([...dict[key].matchAll(/\{(\w+)\}/g)].map(m=>m[1]),[...exports.en[key].matchAll(/\{(\w+)\}/g)].map(m=>m[1]))}
})
test('contradictory airport metadata at the same source version is reported instead of picking a name',()=>{
 const a=record('a'),b=record('b');b.draft.stops[0].airport={...airport('TPE'),name:'Contradiction'}
 for(const input of [[a,b],[b,a]]){const s=calculateTravelRankings(input);assert.equal(s.airportConflicts,2);assert.equal(s.airports.length,1);assert.equal(s.airports[0].airport.iata,'NRT')}
})
