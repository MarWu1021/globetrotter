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
const { GET } = load('src/app/api/airports/route.ts')
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

test('TPE DXB ATH uses existing core: two flights three events and correct completed preview', () => {
  const p = api.previewTripDraft(completedRoute()); assert.equal(p.kind,'ready')
  assert.equal(p.trip.title,'希臘之旅'); assert.equal(p.trip.flights.length,2); assert.equal(p.trip.stops.length,3)
  assert.deepEqual(p.footprint.countryTotals,{ total:3, visited:2, transit:1 })
  assert.equal(p.footprint.countries.find(c => c.countryCode === 'TW').color,'#22c55e')
  assert.equal(p.footprint.countries.find(c => c.countryCode === 'AE').color,'#3b82f6')
  assert.equal(p.footprint.countries.find(c => c.countryCode === 'GR').color,'#22c55e')
  const dxb = p.footprint.airports.find(a => a.airportId === airport('DXB').id)
  assert.equal(dxb.total,1); assert.equal(dxb.connection,1)
})
for (const status of ['draft','planned','in_progress']) test(`${status} retains route but no actual footprint, even with past dates`, () => {
  const d = route(); d.status=status; d.legs.forEach(l => { l.date='2000-01-01' })
  const p = api.previewTripDraft(d); assert.equal(p.kind,'ready'); assert.equal(p.trip.flights.length,2)
  assert.equal(p.footprint.countryTotals.total,0); assert.equal(p.footprint.airportTotals.total,0)
})
test('completion explicit, reversible and independent of input or browser store', () => {
  const d=freeze(completedRoute()), before=structuredClone(d)
  assert.equal(api.previewTripDraft(d).footprint.countryTotals.total,3)
  assert.equal(api.previewTripDraft({ ...d,status:'draft' }).footprint.countryTotals.total,0)
  assert.deepEqual(d,before)
})
test('first departure is visited even if editor stop nature was transit', () => {
  const d=completedRoute(); d.stops[0].countryPresence='transit'
  assert.equal(api.buildDraftTrip(d).stops[0].countryPresence,'visited')
  assert.equal(d.stops[0].countryPresence,'transit')
})
test('independent optional leg details map to exact stop pair, not indexes', () => {
  const d=withDetails(completedRoute()), t=api.buildDraftTrip(d)
  for (let i=0;i<2;i++) {
    assert.equal(t.flights[i].flightNumber,`flight-${i}`); assert.equal(t.flights[i].notes,`notes-${i}`)
    assert.equal(t.flights[i].departureStopId,d.stops[i].id); assert.equal(t.flights[i].arrivalStopId,d.stops[i+1].id)
  }
})
test('empty dates airline number notes are valid', () => {
  const d=completedRoute(); d.legs.forEach(l => Object.assign(l,{ date:'',airline:'',flightNumber:'',notes:'' }))
  assert.equal(api.previewTripDraft(d).kind,'ready')
})
test('insertion preserves unchanged first leg and clears newly connected legs', () => {
  const d=freeze(withDetails(completedRoute())), before=structuredClone(d)
  const edited=api.addDraftStop(d,airport('NRT'),'inserted',2)
  assert.equal(edited.stops.length,4); assert.equal(edited.legs.length,3)
  assert.equal(edited.legs[0].flightNumber,'flight-0')
  assert.equal(edited.legs[1].flightNumber,undefined); assert.equal(edited.legs[2].flightNumber,undefined)
  assert.equal(api.previewTripDraft(edited).kind,'ready'); assert.deepEqual(d,before)
})
test('removing middle airport does not assign either old flight details to new direct flight', () => {
  const d=withDetails(completedRoute()), edited=api.removeDraftStop(d,'stop-1')
  assert.equal(edited.legs.length,1); assert.equal(edited.legs[0].flightNumber,undefined)
  assert.equal(api.buildDraftTrip(edited).flights[0].arrivalStopId,'stop-2')
})
test('reordering clears changed legs, keeps unchanged adjacent pair and updates origin', () => {
  const d=withDetails(route(['TPE','DXB','ATH','NRT']))
  const moved=api.moveDraftStop(d,'stop-3',1)
  assert.deepEqual(moved.stops.map(s => s.airport.iata),['TPE','NRT','DXB','ATH'])
  assert.equal(moved.legs[0].flightNumber,undefined); assert.equal(moved.legs[2].flightNumber,'flight-1')
  assert.equal(api.previewTripDraft(moved).kind,'ready')
  assert.equal(api.buildDraftTrip(api.moveDraftStop(moved,'stop-1',0)).stops[0].countryPresence,'visited')
})
test('return airport occurrence has new ID and increments transfer once per stop', () => {
  const d=route(['TPE','DXB','ATH','DXB','TPE']); d.status='completed'
  d.stops[1].countryPresence='transit'; d.stops[3].countryPresence='transit'
  const p=api.previewTripDraft(d)
  assert.equal(p.footprint.airports.find(a => a.airportId===airport('DXB').id).connection,2)
  assert.equal(p.footprint.countryTotals.total,3)
})
test('transfer changes to visited without country double count', () => {
  const d=completedRoute(); d.stops[1].countryPresence='visited'
  assert.deepEqual(api.previewTripDraft(d).footprint.countryTotals,{ total:3,visited:3,transit:0 })
})
test('invalid date, same-airport adjacency and incomplete route have clear validation states', () => {
  const d=completedRoute(); d.legs[0].date='2026-02-30'; assert.equal(api.previewTripDraft(d).kind,'invalid')
  assert.equal(api.previewTripDraft(route(['TPE','TPE'])).kind,'same-airport')
  assert.equal(api.previewTripDraft(route(['TPE'])).kind,'empty')
  assert.equal(api.previewTripDraft(api.createTripDraft('blank')).kind,'empty')
})
test('special region stays blocked, does not change phase 2B review policy', () => {
  assert.equal(api.previewTripDraft(route(['TPE','HKG'])).kind,'review')
})
test('duplicate events, invalid moves and stale leg references fail instead of miscounting', () => {
  const d=completedRoute()
  assert.throws(() => api.addDraftStop(d,airport('NRT'),'stop-0'),/Duplicate/)
  assert.throws(() => api.moveDraftStop(d,'stop-0',999),/Invalid/)
  assert.throws(() => api.removeDraftStop(d,'unknown'),/Unknown/)
  assert.throws(() => api.buildDraftTrip({ ...d,legs:[...d.legs].reverse() }),/Inconsistent/)
})
test('airport API uses bounded on-demand search with current IDs and Chinese aliases', async () => {
  for (const [q,code] of [['TPE','TPE'],['RCTP','TPE'],['桃園','TPE'],['杜拜','DXB'],['LGAV','ATH']]) {
    const res=await GET(new Request(`http://localhost/api/airports?q=${encodeURIComponent(q)}&locale=zh-TW`))
    assert.equal(res.status,200); const data=await res.json()
    assert.equal(data.results[0].airport.iata,code); assert.ok(data.results.length<=12)
    assert.equal(data.results[0].hit.id,data.results[0].airport.id)
  }
  const limited=await (await GET(new Request('http://localhost/api/airports?q=airport'))).json()
  assert.equal(limited.results.length,12)
})
test('airport API short query, malformed locale and overly long query handled safely', async () => {
  assert.deepEqual(await (await GET(new Request('http://localhost/api/airports?q=a'))).json(),{ results:[] })
  assert.equal((await GET(new Request(`http://localhost/api/airports?q=${'x'.repeat(81)}`))).status,400)
  assert.equal((await GET(new Request('http://localhost/api/airports?q=TPE&locale=invalid'))).status,200)
  const hk=await (await GET(new Request('http://localhost/api/airports?q=HKG'))).json()
  assert.equal(hk.results[0].hit.requiresReview,true)
})
test('all new messages translated in five dictionaries with matching placeholders', () => {
  const source=fs.readFileSync('src/lib/i18n.ts','utf8')+'\nexport { en, fr, es, de, zhTW }'
  const compiled=ts.transpileModule(source,{ compilerOptions:{ module:ts.ModuleKind.CommonJS } }).outputText
  const sandbox={ exports:{},require:()=>({}) };vm.runInNewContext(compiled,sandbox)
  const { en,fr,es,de,zhTW }=sandbox.exports
  const placeholders=s=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort()
  for(const dictionary of [fr,es,de,zhTW]) for(const key of Object.keys(en).filter(k=>k.startsWith('trip.'))) {
    assert.ok(dictionary[key],key);assert.deepEqual(placeholders(dictionary[key]),placeholders(en[key]),key)
    assert.ok(!dictionary[key].includes('\uFFFD'))
  }
})
test('draft core has no persistence side effects and UI never calls a store setter', () => {
  const core=fs.readFileSync('src/lib/trip-draft/core.ts','utf8')
  assert.doesNotMatch(core,/localStorage|sessionStorage|zustand|useTravelStore|supabase/)
  const editor=fs.readFileSync('src/components/trip-editor.tsx','utf8')
  assert.doesNotMatch(editor,/localStorage|sessionStorage|\.setState\(|getState\(|setStatus\(/)
  assert.doesNotMatch(editor,/airport-data\/catalog|airport-catalog\/airports/)
})
