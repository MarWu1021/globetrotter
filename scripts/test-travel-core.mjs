import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Compile the actual TypeScript implementation in memory; no emitted files or new dependency.
const source = ts.transpileModule(fs.readFileSync('src/lib/travel-core/core.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const api = {}
new vm.Script(`(function(exports){${source}\n})`).runInThisContext()(api)
const { buildTripFromRoute, validateTrip, deriveFootprint, deriveCountryFootprint,
  deriveAirportUsage, deriveRouteGroups, buildArcDescriptors, splitAirportStop,
  mergeAirportStops, countryRecordsFromLegacy, validateAirports } = api
const master = [
  ['TPE','TW',25.0777,121.233], ['DXB','AE',25.2498,55.371],
  ['ATH','GR',37.9364,23.9445], ['NRT','JP',35.7686,140.3887],
  ['HND','JP',35.55,139.78], ['LAX','US',33.94,-118.4],
  ['EAST','FJ',0,179], ['WEST','WS',0,-179], ['ANTI','US',0,0], ['POD','NZ',0,180],
].map(([id,countryCode,latitude,longitude])=>({id,source:'explicit-test-fixture',sourceId:id,
  name:id,countryCode,latitude,longitude,iata:id.length===3?id:undefined}))
function trip(id='out',status='completed', codes=['TPE','DXB','ATH'], dates=[]) {
  return buildTripFromRoute({id,status}, codes.map((airportId,i)=>({stopId:`${id}-s${i}`,airportId,
    usageKind:i>0&&i<codes.length-1?'connection':'terminal',
    countryPresence:i>0&&i<codes.length-1?'transit':'visited'})),
    codes.slice(1).map((_,i)=>({id:`${id}-f${i}`,...(dates[i]?{date:dates[i]}:{})})),master)
}
const manual = [{id:'m',legacyGeoId:'158',countryCode:'TW',manualPresence:'visited',
  wishlist:true,blocked:true,notes:'台灣筆記',review:{rating:5,visits:['2025-10'],liked:'美食'}}]
const byCountry = (f,code)=>f.countries.find(c=>c.countryCode===code)
const freeze = o=>{ if(o&&typeof o==='object'){Object.freeze(o);Object.values(o).forEach(freeze)}return o }

test('route generates one trip, two flights, three shared events and two arcs',()=>{
  const t=trip();assert.equal(t.flights.length,2);assert.equal(t.stops.length,3)
  assert.equal(t.flights[0].arrivalStopId,t.flights[1].departureStopId)
  assert.equal(buildArcDescriptors([t],master).length,2)
})
test('TPE-DXB-ATH totals, Taiwan identity, colors and transfer deduplication',()=>{
  const f=deriveFootprint([trip()],[],master)
  assert.deepEqual(f.countryTotals,{total:3,visited:2,transit:1})
  assert.equal(byCountry(f,'TW').color,'#22c55e');assert.equal(byCountry(f,'GR').color,'#22c55e')
  assert.equal(byCountry(f,'AE').color,'#3b82f6')
  assert.deepEqual(f.airportTotals,{distinct:3,total:3,connection:1,terminal:2})
  const d=f.airports.find(a=>a.airportId==='DXB');assert.equal(d.total,1);assert.equal(d.connection,1)
  assert.equal(d.events[0].flightIds.length,2)
})
test('origin is visited even when its stop is explicitly transit',()=>{
  const t=trip();t.stops[0].countryPresence='transit'
  assert.equal(byCountry(deriveFootprint([t],[],master),'TW').presence,'visited')
})
test('return journey uses new events and DXB increments once more',()=>{
  const f=deriveFootprint([trip(),trip('back','completed',['ATH','DXB','TPE'])],[],master)
  assert.equal(f.airports.find(a=>a.airportId==='DXB').total,2)
  assert.equal(f.airportTotals.total,6);assert.equal(f.countryTotals.total,3)
  assert.equal(f.routes.length,4)
})
test('return within one trip also uses separate occurrences',()=>{
  const f=deriveFootprint([trip('round','completed',['TPE','DXB','ATH','DXB','TPE'])],[],master)
  assert.equal(f.airports.find(a=>a.airportId==='DXB').connection,2)
  assert.equal(f.countryTotals.total,3);assert.equal(f.airportTotals.total,5)
})
test('transit becomes visited without changing country total or transfer classification',()=>{
  const t=trip();t.stops[1].countryPresence='visited'
  const f=deriveFootprint([t],[],master);assert.deepEqual(f.countryTotals,{total:3,visited:3,transit:0})
  assert.equal(f.airports.find(a=>a.airportId==='DXB').connection,1)
})
test('multiple airports and trips in one country deduplicate; green beats blue',()=>{
  const t=trip('jp','completed',['TPE','NRT','HND']);const other=trip('other','completed',['TPE','NRT'])
  const f=deriveFootprint([t,other],[],master)
  assert.equal(f.countryTotals.total,2);assert.equal(byCountry(f,'JP').presence,'visited')
  assert.equal(f.airports.find(a=>a.airportId==='NRT').total,2)
})
for(const status of ['draft','planned','in_progress']) test(`${status} never contributes even with past dates or preview arcs`,()=>{
  const t=trip(status,status,undefined,['2000-01-01','2000-01-02']);const f=deriveFootprint([t],[],master)
  assert.equal(f.countryTotals.total,0);assert.equal(f.airportTotals.total,0);assert.equal(f.routes.length,0)
  assert.equal(buildArcDescriptors([t],master).length,0)
  assert.equal(buildArcDescriptors([t],master,true).length,2)
})
test('completed state reverted removes all derived footprint',()=>{
  const t=trip();assert.equal(deriveFootprint([t],[],master).countryTotals.total,3)
  assert.equal(deriveFootprint([{...t,status:'in_progress'}],[],master).countryTotals.total,0)
})
test('deleting trip preserves manual visit, wishlist, blocked, notes and review',()=>{
  const before=structuredClone(manual);const f=deriveFootprint([],manual,master)
  assert.equal(byCountry(f,'TW').presence,'visited');assert.deepEqual(f.countryRecords,before)
  assert.deepEqual(manual,before);assert.equal(f.airportTotals.total,0)
})
test('deletion removes only lost evidence; remaining trip still supports country',()=>{
  const remaining=trip('remaining','completed',['TPE','DXB'])
  assert.equal(deriveFootprint([trip(),remaining],[],master).countryTotals.total,3)
  const f=deriveFootprint([remaining],[],master);assert.equal(f.countryTotals.total,2)
  assert.equal(byCountry(f,'AE').presence,'visited')
})
test('optional flight fields can all be absent or blank',()=>{
  const t=trip();assert.equal(t.flights[0].date,undefined)
  for(const f of t.flights)Object.assign(f,{date:'',airline:'',flightNumber:'',notes:''})
  validateTrip(t,master);assert.equal(deriveAirportUsage([t],master).length,3)
})
test('per-leg information preserved independently',()=>{
  const t=trip('details','completed',undefined,['2026-10-09','2026-10-10'])
  t.flights[0].airline='A';t.flights[0].flightNumber='A1';t.flights[1].airline='B'
  const g=deriveRouteGroups([t],master);assert.equal(g.find(g=>g.departureAirportId==='TPE').flights[0].flight.flightNumber,'A1')
  assert.equal(g.find(g=>g.departureAirportId==='DXB').flights[0].flight.airline,'B')
})
test('multiple stops, overnight connection, missing dates and reordering',()=>{
  const a=trip('a','completed',['TPE','DXB','ATH','NRT'],['2026-10-09','2026-10-10'])
  assert.equal(a.flights.length,3);assert.equal(deriveFootprint([a],[],master).airportTotals.total,4)
  const b=trip('b','completed',['TPE','ATH','DXB','NRT'])
  assert.equal(b.flights[0].arrivalStopId,'b-s1');assert.equal(b.stops[1].airportId,'ATH')
  assert.equal(deriveFootprint([b],[],master).countryTotals.total,4)
})
test('inserting/removing a stop and deleting a leg via a rebuilt valid itinerary',()=>{
  const long=trip('long','completed',['TPE','DXB','ATH','NRT']);const short=trip('short','completed',['TPE','NRT'])
  assert.equal(buildArcDescriptors([long],master).length,3)
  assert.equal(deriveFootprint([short],[],master).countryTotals.total,2)
  const trimmed=structuredClone(long);trimmed.flights=trimmed.flights.slice(0,2);trimmed.stops=trimmed.stops.slice(0,3)
  assert.equal(deriveFootprint([trimmed],[],master).countryTotals.total,3)
})
test('split and confirmed merge update event count, retaining flight identities/details',()=>{
  const t=freeze(trip());const split=splitAirportStop(t,'out-s1',
    {usageKind:'terminal',countryPresence:'transit'},
    {id:'new-dxb',usageKind:'terminal',countryPresence:'transit'},master)
  assert.equal(split.flights.length,2);assert.equal(split.stops.length,4)
  assert.equal(deriveAirportUsage([split],master).find(a=>a.airportId==='DXB').total,2)
  const merged=mergeAirportStops(split,'out-s1','new-dxb',{usageKind:'connection',countryPresence:'visited'},master)
  assert.equal(merged.stops.length,3);assert.deepEqual(merged.flights.map(f=>f.id),t.flights.map(f=>f.id))
  assert.equal(deriveAirportUsage([merged],master).find(a=>a.airportId==='DXB').connection,1)
  assert.equal(byCountry(deriveFootprint([merged],[],master),'AE').presence,'visited')
})
test('merging nonconsecutive/different airport events or splitting terminal is rejected',()=>{
  const t=trip();const resolve={usageKind:'connection',countryPresence:'transit'}
  assert.throws(()=>mergeAirportStops(t,'out-s0','out-s2',resolve,master))
  assert.throws(()=>splitAirportStop(t,'out-s0',resolve,{...resolve,id:'new'},master))
  const round=trip('r','completed',['TPE','DXB','ATH','DXB','TPE'])
  assert.throws(()=>mergeAirportStops(round,'r-s1','r-s3',resolve,master))
})
test('repeated routes preserve all records, direction and date order',()=>{
  const a=trip('a','completed',undefined,['2026-10-09']),b=trip('b','completed',undefined,['2020-01-01'])
  const c=trip('c'),back=trip('back','completed',['ATH','DXB','TPE'])
  const g=deriveRouteGroups([a,c,back,b],master).find(g=>g.departureAirportId==='TPE')
  assert.equal(g.count,3);assert.deepEqual(g.flights.map(x=>x.tripId),['b','a','c'])
  assert.equal(deriveRouteGroups([a,back],master).length,4)
})
test('arc coordinates use masters and handle date line, long and antipodal routes',()=>{
  const crossing=buildArcDescriptors([trip('cross','completed',['EAST','WEST'])],master)[0]
  assert(crossing.distanceKm>220&&crossing.distanceKm<225)
  const anti=buildArcDescriptors([trip('anti','completed',['ANTI','POD'])],master)[0]
  assert(anti.distanceKm>20000&&Number.isFinite(anti.altitude));assert(anti.altitude<=0.5)
  const long=buildArcDescriptors([trip('long','completed',['TPE','LAX'])],master)[0]
  assert(long.distanceKm>10000);assert.equal(long.endLng,-118.4);assert.equal(long.schematic,true)
})
test('legacy adapter preserves note/review-only entries and does not invent flights',()=>{
  const legacy=freeze({statuses:{'158':'visited','392':'wishlist','276':'blocked'},notes:{note:'only note'},
    reviews:{rating:{rating:5,visits:['2025-03'],wouldReturn:'yes'}}})
  const records=countryRecordsFromLegacy(legacy,{'158':'TW','392':'JP','276':'DE'},
    {'158':'a','392':'b','276':'c',note:'d',rating:'e'})
  assert.equal(records.length,5);assert.equal(records.find(r=>r.legacyGeoId==='rating').review.rating,5)
  assert.equal(records.find(r=>r.legacyGeoId==='392').wishlist,true)
  assert.equal(records.find(r=>r.legacyGeoId==='276').blocked,true)
  assert.equal(deriveFootprint([],records,master).countryTotals.total,1)
})
test('unresolved manual mapping stays intact but blocks misleading totals',()=>{
  const records=countryRecordsFromLegacy({statuses:{x:'visited'},notes:{},reviews:{}},{},{x:'id'})
  assert.equal(records[0].countryCode,null)
  assert.throws(()=>deriveCountryFootprint([],records,master),/Unresolved/)
})
test('validation rejects missing references, foreign trips, orphan and reused events',()=>{
  for(const change of [
    t=>{t.flights[0].arrivalStopId='missing'},t=>{t.stops[0].tripId='foreign'},
    t=>{t.flights[0].tripId='foreign'},t=>{t.stops.push({...t.stops[0],id:'orphan'})},
    t=>{t.flights.push({...t.flights[0],id:'extra'})},t=>{t.stops[0].airportId='unknown'},
  ]){const t=trip();change(t);assert.throws(()=>validateTrip(t,master))}
})
test('validation rejects duplicated identities, status/nature, invalid dates and disconnected legs',()=>{
  for(const change of [t=>{t.stops[1].id=t.stops[0].id},t=>{t.flights[1].id=t.flights[0].id},
    t=>{t.status='automatic'},t=>{t.stops[1].countryPresence='unknown'},t=>{t.stops[1].usageKind='invalid'},
    t=>{t.flights[0].date='2026-02-30'},
    t=>{t.flights[1].departureStopId='out-s0'},
  ]){const t=trip();change(t);assert.throws(()=>validateTrip(t,master))}
  assert.throws(()=>deriveFootprint([trip(),trip()],[],master),/duplicate/)
})
test('airport master validation never guesses country from name or treats IATA as identity',()=>{
  for(const patch of [{countryCode:''},{countryCode:'Taiwan'},{latitude:91},{longitude:181},{sourceId:''}])
    assert.throws(()=>validateAirports([{...master[0],...patch}]))
  validateAirports([{...master[0],iata:undefined},{...master[1],iata:'TPE'}])
  assert.throws(()=>validateAirports([master[0],{...master[0],id:'other'}]),/duplicate/)
})
test('pure functions tolerate frozen inputs and return independent deterministic outputs',()=>{
  const t=freeze(trip()),records=freeze(structuredClone(manual)),airports=freeze(structuredClone(master))
  const before=JSON.stringify([t,records,airports]);const f=deriveFootprint([t],records,airports)
  assert.deepEqual(f,deriveFootprint([t],records,airports));buildArcDescriptors([t],airports)
  f.countryRecords[0].review.visits.push('2099-01');f.routes[0].flights[0].flight.notes='changed'
  assert.equal(JSON.stringify([t,records,airports]),before)
})
test('merge requires explicit resolution of differing notes and preserves both inputs',()=>{
  const t=trip();t.stops[1].notes='arrival note'
  const split=splitAirportStop(t,'out-s1',{usageKind:'terminal',countryPresence:'transit'},
    {id:'depart',usageKind:'terminal',countryPresence:'transit',notes:'departure note'},master)
  const before=structuredClone(split),resolve={usageKind:'connection',countryPresence:'transit'}
  assert.throws(()=>mergeAirportStops(split,'out-s1','depart',resolve,master),/notes/)
  const merged=mergeAirportStops(split,'out-s1','depart',{...resolve,notes:'arrival note; departure note'},master)
  assert.equal(merged.stops.find(s=>s.id==='out-s1').notes,'arrival note; departure note')
  assert.deepEqual(split,before)
})
test('global reused stop or flight identities cannot silently undercount independent trips',()=>{
  const a=trip(),b=trip('b');b.flights[0].id=a.flights[0].id
  assert.throws(()=>deriveFootprint([a,b],[],master),/global flights/)
  const c=trip('c');c.stops[0].id=a.stops[0].id;c.flights[0].departureStopId=a.stops[0].id
  assert.throws(()=>deriveFootprint([a,c],[],master),/global stops/)
})
test('flight deleting without repairing its graph fails instead of returning partial totals',()=>{
  const t=trip();t.flights=t.flights.slice(1)
  assert.throws(()=>deriveFootprint([t],[],master),/Orphan/)
})
test('builder rejects ID/count mismatch and does not mutate frozen route or leg details',()=>{
  const route=freeze([{stopId:'s1',airportId:'TPE',usageKind:'terminal',countryPresence:'transit'},
    {stopId:'s2',airportId:'ATH',usageKind:'terminal',countryPresence:'visited'}])
  const details=freeze([{id:'f1',date:'2026-10-09',airline:'CI',flightNumber:'CI100',notes:'筆記'}])
  const header=freeze({id:'t',status:'completed'});const t=buildTripFromRoute(header,route,details,master)
  t.flights[0].notes='changed';assert.equal(details[0].notes,'筆記')
  assert.throws(()=>buildTripFromRoute(header,route,[],master),/count/)
  assert.throws(()=>buildTripFromRoute(header,[route[0],route[0]],details,master),/duplicate/)
})
test('airport leaderboard and directional route keys are stable and cannot collide',()=>{
  const a=trip('a'),b=trip('b');const f=deriveFootprint([a,b],[],master)
  assert.deepEqual(f.airports.map(a=>a.airportId),['ATH','DXB','TPE'])
  for(const a of f.airports)assert.equal(a.total,a.connection+a.terminal)
  assert.deepEqual(deriveRouteGroups([a,b],master),deriveRouteGroups([b,a],master))
})

test('local calendar dates may go backwards across the date line without invalidating the route',()=>{
  const t=trip('calendar','completed',['TPE','LAX','ATH'],['2026-10-10','2026-10-09'])
  validateTrip(t,master);assert.equal(deriveFootprint([t],[],master).airportTotals.total,3)
  assert.equal(t.flights[0].date,'2026-10-10');assert.equal(t.flights[1].date,'2026-10-09')
})
