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
const api = load('src/lib/trip-draft/core.ts')
const catalog = load('src/lib/airport-data/catalog.ts').AIRPORT_CATALOG
const airport = (code) => catalog.find(a => a.iata === code)
const freeze = o => { if (o && typeof o === 'object') { Object.freeze(o); Object.values(o).forEach(freeze) } return o }
function route(codes = ['TPE','DXB','ATH']) {
  return codes.reduce((d,code,i) => api.addDraftStop(d,airport(code),`stop-${i}`), api.createTripDraft('trip-test'))
}
function completedRoute() {
  const d = route(); d.title = '希臘之旅'; d.status = 'completed'; d.stops[1].countryPresence = 'transit'; return d
}
function withDetails(d) {
  return { ...d, legs: d.legs.map((l,i) => ({ ...l, date: `2026-10-${String(i+9).padStart(2,'0')}`,
    airline: `airline-${i}`, flightNumber: `flight-${i}`, notes: `notes-${i}` })) }
}

const segments=load('src/lib/trip-draft/segments.ts')
let id=0
const fresh=()=>`return-${++id}`
test('ticket return mirrors each segment, creates distinct stops and leaves return details unconfirmed',()=>{
 const original=freeze(withDetails(completedRoute())), next=segments.appendReturnRoute(original,fresh)
 assert.deepEqual(next.stops.map(s=>s.airport.iata),['TPE','DXB','ATH','DXB','TPE'])
 assert.equal(next.legs.length,4);assert.equal(new Set(next.stops.map(s=>s.id)).size,5)
 assert.deepEqual(next.legs.slice(0,2),original.legs)
 for(const l of next.legs.slice(2))for(const k of ['date','airline','flightNumber','notes'])assert.equal(l[k],undefined)
 const p=api.previewTripDraft(next);assert.equal(p.kind,'ready');assert.equal(p.footprint.countryTotals.total,3)
 assert.equal(p.footprint.airports.find(a=>a.airportId===airport('DXB').id).total,2)
 assert.throws(()=>segments.appendReturnRoute(next,fresh))
})
test('changing a shared airport updates both adjacent endpoints without moving flight details',()=>{
 const d=freeze(withDetails(completedRoute())),next=segments.replaceDraftStopAirport(d,d.stops[1].id,airport('NRT'))
 assert.equal(next.stops[1].airport.iata,'NRT');assert.deepEqual(next.legs,d.legs)
 assert.equal(d.stops[1].airport.iata,'DXB');assert.equal(api.previewTripDraft(next).kind,'ready')
})
test('next segment uses prior arrival and starts with blank metadata',()=>{
 const d=freeze(withDetails(completedRoute())),next=segments.appendNextSegment(d,airport('CDG'),fresh)
 assert.deepEqual(next.legs.slice(0,2),d.legs);assert.equal(next.legs[2].fromStopId,d.stops[2].id)
 assert.equal(next.legs[2].date,undefined);assert.throws(()=>segments.appendNextSegment(d,airport('CDG'),()=>d.stops[0].id))
})
test('arrival reorder clears newly connected metadata instead of misassigning dates and airlines',()=>{
 const d=freeze(withDetails(completedRoute())),next=segments.moveDraftSegment(d,d.legs[1].id,0)
 assert.deepEqual(next.stops.map(s=>s.airport.iata),['TPE','ATH','DXB'])
 assert.ok(next.legs.every(l=>l.date===undefined&&l.airline===undefined));assert.deepEqual(d,withDetails(completedRoute()))
})
test('segment deletion retains untouched subsequent edges and rejects bad references',()=>{
 const d=freeze(withDetails(completedRoute())),next=segments.removeDraftSegment(d,d.legs[0].id)
 assert.deepEqual(next.legs,[d.legs[1]]);assert.equal(api.previewTripDraft(next).kind,'ready')
 assert.throws(()=>segments.removeDraftSegment(d,'unknown'));assert.throws(()=>segments.moveDraftSegment(d,d.legs[0].id,9))
})
test('return rejects incomplete routes and source stop/flight references are validated',()=>{
 assert.throws(()=>segments.appendReturnRoute(api.createTripDraft('empty'),fresh))
 const d=completedRoute();d.legs[0].toStopId='missing';assert.throws(()=>segments.appendNextSegment(d,airport('CDG'),fresh))
})
test('ticket return is compatible with existing mileage, endpoint rankings and spherical arc descriptors',()=>{
 const d=withDetails(completedRoute()),next=segments.appendReturnRoute(d,fresh)
 const record=draft=>({draft,createdAt:'2026-10-24T00:00:00Z',updatedAt:'2026-10-24T00:00:00Z'})
 const mileage=load('src/lib/trip-mileage.ts').calculateFlightMileage
 const rankings=load('src/lib/travel-rankings.ts').calculateTravelRankings
 const outbound=mileage([record(d)]),roundtrip=mileage([record(next)])
 assert.equal(roundtrip.flightLegCount,4);assert.ok(Math.abs(roundtrip.totalKm-outbound.totalKm*2)<0.00001)
 assert.equal(rankings([record(next)]).airports.find(a=>a.airport.iata==='DXB')?.count,4)
 assert.equal(load('src/lib/trip-draft/globe.ts').draftGlobePreview(next).arcs.length,4)
})
test('delete and reorder leave no dangling flight references and sole-flight removal clears both stops',()=>{
 const d=completedRoute(),one=segments.removeDraftSegment(d,d.legs[1].id)
 assert.equal(one.legs.length,1);assert.equal(api.previewTripDraft(one).kind,'ready')
 const empty=segments.removeDraftSegment(one,one.legs[0].id)
 assert.deepEqual(empty.stops,[]);assert.deepEqual(empty.legs,[]);assert.equal(api.previewTripDraft(empty).kind,'empty')
})
