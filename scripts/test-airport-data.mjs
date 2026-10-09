import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'

// Exercise the actual TypeScript modules, compiling only in memory.
const nativeRequire = createRequire(import.meta.url), cache = new Map()
function load(file) {
  const absolute = path.resolve(file)
  if (cache.has(absolute)) return cache.get(absolute)
  if (absolute.endsWith('.json')) {
    const value = JSON.parse(fs.readFileSync(absolute, 'utf8')); cache.set(absolute, value); return value
  }
  const loadedModule = { exports: {} }; cache.set(absolute, loadedModule.exports)
  const source = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  function localRequire(name) {
    if (!name.startsWith('.') && !name.startsWith('@/')) return nativeRequire(name)
    const target = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(absolute), name)
    return load(path.extname(target) ? target : target + '.ts')
  }
  new vm.Script(`(function(module,exports,require){${source}\n})`, { filename: absolute })
    .runInThisContext()(loadedModule, loadedModule.exports, localRequire)
  cache.set(absolute, loadedModule.exports); return loadedModule.exports
}
const { AIRPORT_CATALOG: catalog, AIRPORT_SOURCE_METADATA: metadata, LEGACY_AIRPORT_AUDIT: audit } = load('src/lib/airport-data/catalog.ts')
const { COUNTRY_MAPPINGS, resolveCountry, requireStatisticalCountry, legacyCountryMappings, countryDisplayName } = load('src/lib/airport-data/countries.ts')
const { createAirportSearchIndex, searchAirports, resolveAirportCode } = load('src/lib/airport-data/search.ts')
const { toCoreAirports, deriveCatalogFootprint } = load('src/lib/airport-data/integration.ts')
const { reconcileAirportCatalog } = load('src/lib/airport-data/updates.ts')
const core = load('src/lib/travel-core/core.ts')
const index = createAirportSearchIndex(catalog)
const airport = (code) => resolveAirportCode(index, code)
const freeze = (o) => { if (o && typeof o === 'object') { Object.freeze(o); Object.values(o).forEach(freeze) } return o }
function trip(id = 'out', status = 'completed', codes = ['TPE', 'DXB', 'ATH']) {
  const selected = codes.map(airport), masters = toCoreAirports([...new Map(selected.map(a => [a.id, a])).values()])
  return core.buildTripFromRoute({ id, status }, selected.map((a, i) => ({ stopId: `${id}-s${i}`, airportId: a.id,
    usageKind: i > 0 && i < codes.length - 1 ? 'connection' : 'terminal',
    countryPresence: i > 0 && i < codes.length - 1 ? 'transit' : 'visited' })),
  selected.slice(1).map((_, i) => ({ id: `${id}-f${i}` })), masters)
}
const footprint = (trips, manual = []) => deriveCatalogFootprint(trips, manual, catalog)

test('pinned catalog provenance and complete row quality audit', () => {
  assert.equal(catalog.length, 9940); assert.equal(metadata.selectedRows, catalog.length)
  assert.equal(metadata.rawRows, 86226); assert.equal(metadata.sourceCommit, '56abe495bb3afcf8b5d8f01feec0f46ba4fd753f')
  assert.match(metadata.airportsSha256, /^[a-f0-9]{64}$/); assert.deepEqual(metadata.rejectedRows, [])
  assert.equal(new Set(catalog.map(a => a.id)).size, catalog.length)
  assert.equal(new Set(catalog.map(a => a.sourceId)).size, catalog.length)
  assert.deepEqual(metadata.duplicateCodes, { iata: {}, icao: {} })
  assert.equal(metadata.countryMappingRows, COUNTRY_MAPPINGS.length)
  for (const a of catalog) {
    assert.match(a.id, /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
    assert.match(a.sourceId, /^\d+$/); assert.ok(a.name.trim())
    assert.ok(Number.isFinite(a.latitude) && Math.abs(a.latitude) <= 90)
    assert.ok(Number.isFinite(a.longitude) && Math.abs(a.longitude) <= 180)
    assert.ok(resolveCountry(a.sourceCountryCode))
    assert.equal(a.isoCountryCode, resolveCountry(a.sourceCountryCode).isoCode)
  }
  for (const [field, count] of [['iata', 'missingIata'], ['icao', 'missingIcao'], ['city', 'missingCity']])
    assert.equal(catalog.filter(a => !a[field]).length, metadata[count])
})
test('legacy layer reconciliation is read-only and ambiguous coordinates stay pending', () => {
  assert.equal(audit.length, 1175); assert.equal(audit.filter(a => a.status === 'matched').length, 1172)
  assert.deepEqual(audit.filter(a => a.status !== 'matched').map(a => a.legacyCode).sort(), ['PBI', 'SVO', 'VTZ'])
  for (const a of audit.filter(a => a.status !== 'matched')) assert.equal(a.airportId, null)
})
test('TW AE GR ISO, statistical and actual globe/flat IDs are explicit', () => {
  assert.equal(COUNTRY_MAPPINGS.filter(c => c.isoCode).length, 249)
  for (const [code, geo] of [['TW','158'], ['AE','784'], ['GR','300']]) {
    const c = requireStatisticalCountry(code); assert.equal(c.statisticalId, `iso:${code}`)
    assert.ok(c.flatGeoIds.includes(geo)); assert.ok(c.globeGeoIds.includes(geo)); assert.equal(legacyCountryMappings()[geo], code)
  }
  assert.equal(countryDisplayName('TW'), '台灣')
})
test('overseas areas never fold to parent; missing geometry is explicit', () => {
  assert.throws(() => requireStatisticalCountry('GF'), /approval/)
  const policy = { approvedSpecialAreas: ['GF'] }, c = requireStatisticalCountry('GF', policy)
  assert.equal(c.statisticalId, 'iso:GF'); assert.ok(c.flatGeoIds.includes('fr-guf'))
  assert.equal(legacyCountryMappings(policy)['fr-guf'], 'GF'); assert.equal(legacyCountryMappings()['fr-guf'], undefined)
  assert.equal(legacyCountryMappings()['fr-cor'], 'FR'); assert.equal(legacyCountryMappings()['826-eng'], 'GB')
  assert.ok(COUNTRY_MAPPINGS.some(c => c.isoCode && !c.globeGeoIds.length))
})
test('non-ISO XK XP ZZ and unknown country never silently become ISO', () => {
  for (const code of ['XK','XP','ZZ','XX']) assert.throws(() => requireStatisticalCountry(code, { approvedSpecialAreas: [code] }), /Non-ISO/)
  assert.equal(resolveCountry('XK').isoCode, null); assert.equal(resolveCountry('XX'), null)
  assert.throws(() => toCoreAirports(catalog.filter(a => !a.isoCountryCode)), /Non-ISO/)
})
test('IATA ICAO full-width lowercase name and city search', () => {
  for (const q of ['TPE','tpe','ＴＰＥ','RCTP','Taiwan Taoyuan','Taoyuan'])
    assert.equal(searchAirports(index, q)[0].id, airport('TPE').id)
  assert.equal(searchAirports(index, 'OMDB')[0].id, airport('DXB').id)
  assert.equal(searchAirports(index, 'LGAV')[0].id, airport('ATH').id)
  assert.equal(searchAirports(index, '').length, 0); assert.equal(searchAirports(index, 'no-such-airport-123').length, 0)
})
test('Taiwanese Chinese airport/city/country aliases and five languages', () => {
  for (const q of ['桃園', '臺灣桃園', '台北']) assert.ok(searchAirports(index, q).some(a => a.id === airport('TPE').id))
  assert.equal(searchAirports(index, '杜拜')[0].id, airport('DXB').id)
  assert.equal(searchAirports(index, '雅典')[0].id, airport('ATH').id)
  assert.ok(searchAirports(index, '阿聯酋').some(a => a.id === airport('DXB').id))
  assert.equal(searchAirports(index, 'TPE')[0].name, '台灣桃園國際機場')
  for (const locale of ['en','fr','es','de','zh-TW']) assert.equal(searchAirports(index, 'TPE', { locale })[0].id, airport('TPE').id)
  assert.equal(searchAirports(index, 'TPE', { locale: 'en' })[0].name, airport('TPE').name)
  assert.equal(searchAirports(index, 'a', { limit: 1000 }).length, 50)
})
test('duplicate code/name requires selection, identity is never IATA', () => {
  const a = airport('TPE'), b = { ...structuredClone(a), id: 'another-id', sourceId: 'another-source', ident: 'OTHER' }
  const collision = createAirportSearchIndex([a, b])
  assert.equal(searchAirports(collision, 'TPE').length, 2); assert.throws(() => resolveAirportCode(collision, 'TPE'), /2 candidates/)
  assert.throws(() => createAirportSearchIndex([a, a]), /Duplicate/)
})
test('closed/retired airports hidden by default and missing codes remain searchable', () => {
  const a = { ...airport('TPE'), closed: true }, b = { ...airport('DXB'), retired: true }
  const local = createAirportSearchIndex([a, b]); assert.equal(searchAirports(local, 'TPE').length, 0)
  assert.equal(searchAirports(local, 'TPE', { includeClosed: true }).length, 1)
  assert.equal(searchAirports(local, 'DXB', { includeRetired: true }).length, 1)
  const noCode = { ...airport('ATH'), iata: null, icao: null }
  assert.equal(searchAirports(createAirportSearchIndex([noCode]), 'Athens').length, 1)
})
test('real TPE DXB ATH produces one trip two flights three events two arcs and expected totals', () => {
  const t = trip(), f = footprint([t]); assert.equal(t.flights.length, 2); assert.equal(t.stops.length, 3)
  assert.equal(t.flights[0].arrivalStopId, t.flights[1].departureStopId)
  assert.deepEqual(f.countryTotals, { total: 3, visited: 2, transit: 1 })
  assert.equal(f.countries.find(c => c.countryCode === 'TW').color, '#22c55e')
  assert.equal(f.countries.find(c => c.countryCode === 'GR').color, '#22c55e')
  assert.equal(f.countries.find(c => c.countryCode === 'AE').color, '#3b82f6')
  const dxb = f.airports.find(a => a.airportId === airport('DXB').id)
  assert.equal(dxb.total, 1); assert.equal(dxb.connection, 1); assert.equal(dxb.events[0].flightIds.length, 2)
  assert.equal(f.arcs.length, 2); assert.ok(f.statisticalCountries.some(c => c.mapping.statisticalId === 'iso:TW'))
})
test('return transfers create separate events; directional route repetitions retain flights', () => {
  const f = footprint([trip(), trip('back','completed',['ATH','DXB','TPE']), trip('again')])
  assert.equal(f.airports.find(a => a.airportId === airport('DXB').id).connection, 3)
  assert.equal(f.countryTotals.total, 3); assert.equal(f.routes.length, 4)
  assert.equal(f.routes.find(r => r.departureAirportId === airport('TPE').id).flights.length, 2)
})
test('blue to green preserves total and independent airport transfer property', () => {
  const t = trip(); t.stops[1].countryPresence = 'visited'; const f = footprint([t])
  assert.deepEqual(f.countryTotals, { total: 3, visited: 3, transit: 0 })
  assert.equal(f.airports.find(a => a.airportId === airport('DXB').id).connection, 1)
})
test('different airports in same country do not double count', () => {
  assert.equal(footprint([trip('japan','completed',['TPE','NRT','HND'])]).countryTotals.total, 2)
})
for (const status of ['draft','planned','in_progress']) test(`${status} contributes no actual footprint despite historical dates`, () => {
  const t = trip(status,status); t.flights.forEach(f => { f.date = '2000-01-01' })
  const f = footprint([t]); assert.equal(f.countryTotals.total, 0); assert.equal(f.airportTotals.total, 0); assert.equal(f.arcs.length, 0)
})
test('reverting completion or deleting trip retains manual wishes blocks notes ratings', () => {
  const manual = freeze([{ id: 'manual', legacyGeoId: '158', countryCode: 'TW', manualPresence: 'visited', wishlist: true,
    blocked: true, notes: '保留舊紀錄', review: { rating: 5, liked: '美食', visits: ['2025-10'] } }])
  const t = trip(), before = structuredClone(manual)
  assert.equal(footprint([t],manual).countryTotals.total, 3)
  assert.equal(footprint([{ ...t, status: 'draft' }],manual).countryTotals.total, 1)
  const f = footprint([],manual); assert.deepEqual(f.countryRecords,before); assert.deepEqual(manual,before)
})
test('frozen inputs remain unchanged through search adaptation and statistics', () => {
  const selected = freeze(['TPE','DXB','ATH'].map(airport)), before = structuredClone(selected)
  toCoreAirports(selected); searchAirports(createAirportSearchIndex(selected), 'TPE')
  const t = freeze(trip()); deriveCatalogFootprint([t], [], selected)
  assert.deepEqual(selected, before)
})
test('code/name changes keep stable references historical aliases and old revision', () => {
  const a = freeze(airport('TPE')), incoming = freeze({ ...structuredClone(a), iata: 'NEW', name: 'Changed name', updatedAt: '2026-10-10T01:00:00Z' })
  const result = reconcileAirportCatalog([a], [incoming]), updated = result.airports[0]
  assert.equal(updated.id, a.id); assert.ok(updated.aliases.includes('TPE')); assert.equal(updated.history[0].name, a.name)
  assert.equal(resolveAirportCode(createAirportSearchIndex([updated]), 'TPE').id, a.id)
  assert.equal(reconcileAirportCatalog(result.airports,[incoming]).airports[0].history.length, 1)
  assert.equal(deriveCatalogFootprint([trip()],[],[updated, airport('DXB'), airport('ATH')]).countryTotals.total, 3)
})
test('missing source row is retired without deleting historical references', () => {
  const a = airport('TPE'), r = reconcileAirportCatalog([a],[])
  assert.deepEqual(r.retiredIds, [a.id]); assert.equal(r.airports[0].retired, true)
  assert.equal(deriveCatalogFootprint([trip()],[],[...r.airports,airport('DXB'),airport('ATH')]).countryTotals.total, 3)
})
test('reject stale update identity changes duplicates and country reassignment without review', () => {
  const a = airport('TPE')
  assert.throws(() => reconcileAirportCatalog([a],[{ ...a, updatedAt: '2000-01-01' }]), /stale/)
  assert.throws(() => reconcileAirportCatalog([a],[{ ...a, id: 'replacement' }]), /identity/)
  assert.throws(() => reconcileAirportCatalog([a,a],[]), /Duplicate/)
  const changed = reconcileAirportCatalog([a],[{ ...a, isoCountryCode: 'JP', sourceCountryCode: 'JP', updatedAt: '2026-10-10' }])
  assert.deepEqual(changed.changedCountryIds,[a.id]); assert.throws(() => toCoreAirports(changed.airports), /country changed/)
  assert.equal(toCoreAirports(changed.airports,{ approvedCountryChangeIds: [a.id] })[0].countryCode,'JP')
})
test('adapter rejects inconsistent ISO and unknown/duplicate identities', () => {
  const a = airport('TPE'); assert.throws(() => toCoreAirports([{ ...a, isoCountryCode: 'JP' }]), /Conflicting/)
  assert.throws(() => deriveCatalogFootprint([trip()],[],catalog.filter(x => x.id !== a.id)), /Unknown/)
  assert.throws(() => deriveCatalogFootprint([],[],[a,a]), /Duplicate/)
})
test('Hong Kong preserves HK and requires explicit special-area approval', () => {
  const a = airport('HKG'); assert.throws(() => toCoreAirports([a]), /approval/)
  assert.equal(toCoreAirports([a], { approvedSpecialAreas: ['HK'] })[0].countryCode, 'HK')
  assert.equal(searchAirports(index,'HKG')[0].requiresReview,true)
})
