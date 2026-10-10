// Static contract and TypeScript fixture tests ONLY. Never opens a database connection.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'

const sql = fs.readFileSync('sql/review/001_stage_d1.sql', 'utf8')
const checks = fs.readFileSync('sql/review/002_stage_d1_rls_checks.sql', 'utf8')
const doc = fs.readFileSync('docs/stage-d3/sql-review.md', 'utf8')
const functions = new Map([...sql.matchAll(/create function public\.(\w+)\(([\s\S]*?)\$\$([\s\S]*?)\$\$;/g)]
  .map(m => [m[1], { declaration: m[2], body: m[3] }]))
const fn = name => { assert.ok(functions.has(name), `missing ${name}`); return functions.get(name) }
const table = name => sql.match(new RegExp(`create table public\\.${name} \\(([\\s\\S]*?)\\n\\);`))[1]
const fixture = JSON.parse(checks.match(/select set_config\('d1.fixture','(.*?)',true\);/s)[1].replaceAll("''", "'"))
const nativeRequire = createRequire(import.meta.url), cache = new Map()
function load(file) {
  const absolute = path.resolve(file)
  if (cache.has(absolute)) return cache.get(absolute)
  if (absolute.endsWith('.json')) { const v = JSON.parse(fs.readFileSync(absolute, 'utf8')); cache.set(absolute, v); return v }
  const loaded = { exports: {} }; cache.set(absolute, loaded.exports)
  const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const requireModule = name => {
    if (!name.startsWith('.') && !name.startsWith('@/')) return nativeRequire(name)
    const resolved = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(absolute), name)
    return load(path.extname(resolved) ? resolved : resolved + '.ts')
  }
  new vm.Script(`(function(exports,require){${compiled}\n})`).runInThisContext()(loaded.exports, requireModule)
  return loaded.exports
}
const { validSavedDraft } = load('src/lib/trip-storage/core.ts')
const { previewTripDraft } = load('src/lib/trip-draft/core.ts')

test('static: schema is transactional initial creation; test script only rolls back', () => {
  assert.match(sql, /\nbegin;/); assert.match(sql, /commit;\s*$/)
  assert.match(checks, /\nbegin;/); assert.match(checks, /rollback;\s*$/)
  const withoutComments = checks.replace(/--[^\n]*/g, '')
  assert.doesNotMatch(withoutComments, /\b(commit|truncate|drop)\b/i)
  assert.doesNotMatch(sql, /\b(drop|truncate|security definer)\b/i)
})
test('static: owner-only SELECT INSERT UPDATE; no client hard DELETE', () => {
  for (const name of ['trips', 'country_records']) {
    assert.match(sql, new RegExp(`alter table public\\.${name} enable row level security`))
    assert.match(sql, new RegExp(`alter table public\\.${name} force row level security`))
    const policies = [...sql.matchAll(new RegExp(`create policy \\w+ on public\\.${name} ([^;]+);`, 'g'))].map(m => m[1])
    assert.equal(policies.length, 3)
    for (const operation of ['select', 'insert', 'update']) {
      const policy = policies.find(p => p.startsWith(`for ${operation} `))
      assert.ok(policy); assert.match(policy, /to authenticated/)
      assert.match(policy, /\(select auth\.uid\(\)\) = user_id/)
      if (operation !== 'select') assert.match(policy, /with check/)
    }
  }
  assert.match(sql, /revoke all on public.trips, public.country_records from public, anon, authenticated/)
  assert.match(sql, /grant select,insert,update on public.trips, public.country_records to authenticated/)
  assert.doesNotMatch(sql, /grant[^;]*\bdelete\b/i)
})
test('static: every helper/RPC pins search_path and revokes anonymous/default execute', () => {
  assert.equal(functions.size, 11)
  for (const [name, f] of functions) {
    assert.match(f.declaration, /set search_path = ''/)
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([^;]*\\) from public, anon`))
    if (name !== 'd1_guard_revision') assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\([^;]*\\) to authenticated`))
  }
})
test('static: all three mutation RPCs are invoker and scope locks/rows to verified owner', () => {
  for (const name of ['d1_write_trip', 'd1_write_country', 'd1_restore_country']) {
    const f = fn(name)
    assert.match(f.declaration, /security invoker/); assert.match(f.body, /uid uuid := auth.uid\(\)/)
    assert.match(f.body, /if uid is null then raise exception/)
    assert.match(f.body, /pg_advisory_xact_lock\(hashtextextended\(uid::text/)
    assert.match(f.body, /where user_id=uid and .* for update/)
    assert.match(f.body, /where user_id=uid and .* returning \* into r/)
    assert.match(f.body, /r.last_mutation_id=p_mutation_id/)
    assert.match(f.body, /r.last_expected_revision is distinct from p_expected_revision/)
  }
})
test('static: country restore is explicit, version checked and content preserving', () => {
  assert.match(table('country_records'), /last_operation in \('save','delete','restore'\)/)
  assert.match(table('trips'), /last_operation in \('save','delete'\)/)
  const f = fn('d1_restore_country')
  assert.doesNotMatch(f.declaration, /p_(user_id|status|notes|review)/)
  assert.match(f.body, /r.deleted_at is null or r.revision is distinct from p_expected_revision/)
  assert.match(f.body, /last_operation='restore',deleted_at=null/)
  assert.match(f.body, /r.last_operation<>'restore'/)
  const guard = fn('d1_guard_revision').body
  assert.match(guard, /tg_table_name <> 'country_records' or new.last_operation <> 'restore'/)
  assert.match(guard, /elsif new.last_operation = 'restore' then/)
  for (const key of ['status', 'notes', 'review']) assert.ok(guard.includes(`to_jsonb(new)->'${key}' is distinct from to_jsonb(old)->'${key}'`))
})
test('static: ordinary trip/country writes cannot implicitly restore tombstones', () => {
  for (const name of ['d1_write_trip', 'd1_write_country']) assert.match(fn(name).body, /r.deleted_at is not null or r.revision is distinct from p_expected_revision/)
  assert.ok(!functions.has('d1_restore_trip'))
  assert.match(fn('d1_guard_revision').body, /new.revision <> old.revision\+1/)
  assert.match(fn('d1_guard_revision').body, /new.last_expected_revision is distinct from old.revision/)
  assert.match(fn('d1_guard_revision').body, /new.last_mutation_id = old.last_mutation_id/)
})
test('static: country allowlist exactly matches current approved mapping policy', () => {
  const approved = JSON.parse(fs.readFileSync('src/data/airport-catalog/countries.json', 'utf8'))
    .filter(c => c.isoCode && c.statisticalId && !c.requiresReview).map(c => c.isoCode).sort()
  const codes = [...fn('d1_valid_airport').body.match(/all\(array\[([^\]]+)\]\)/)[1].matchAll(/'([A-Z]{2})'/g)].map(m => m[1])
  assert.deepEqual(codes, approved)
  for (const c of ['TW', 'AE', 'GR', 'JP']) assert.ok(codes.includes(c))
  assert.ok(!codes.includes('AQ'))
  assert.match(fn('d1_valid_airport').body, /upper\(a->>'sourceCountryCode'\) is distinct from a->>'isoCountryCode'/)
  assert.match(fn('d1_valid_airport').body, /h->'isoCountryCode' is distinct from a->'isoCountryCode'/)
})
test('static: full snapshot types, nullable fields and bounded histories are validated', () => {
  const a = fn('d1_valid_airport').body, r = fn('d1_valid_airport_revision').body
  for (const field of ['updatedAt', 'name', 'ident', 'city', 'iata', 'icao', 'isoCountryCode', 'latitude', 'longitude']) assert.ok(r.includes(`a->'${field}'`) || r.includes(`a->>'${field}'`))
  for (const field of ['id', 'sourceId', 'sourceCountryCode', 'type', 'scheduledService', 'closed', 'retired', 'aliases', 'history', 'keywords', 'wikipedia']) assert.ok(a.includes(`a->'${field}'`))
  assert.match(a, /jsonb_array_length\(a->'aliases'\) > 100/); assert.match(a, /jsonb_array_length\(a->'history'\) > 100/)
  assert.match(r, /between -90 and 90/); assert.match(r, /between -180 and 180/)
})
test('static: flight adjacency, string references, optional date and ID uniqueness checks exist', () => {
  const t = fn('d1_valid_trip').body
  assert.match(t, /n not between 2 and 100/); assert.match(t, /jsonb_array_length\(p->'legs'\) <> n-1/)
  for (const key of ['id', 'fromStopId', 'toStopId']) assert.ok(t.includes(`d1_json_text(l->'${key}',250,true)`))
  assert.match(t, /a->>'id' = p->'stops'->\(i-1\)->'airport'->>'id'/)
  assert.match(t, /count\(distinct v->>'id'\)/)
  assert.match(t, /l \? 'date' and not public.d1_valid_date/)
  assert.match(t, /'date','airline','flightNumber','notes'/)
})
test('static: date checks account for leap centuries, blank dates and UTF-16 text', () => {
  assert.match(fn('d1_valid_date').body, /if t = '' then return true/)
  assert.match(fn('d1_valid_date').body, /y%4=0 and \(y%100<>0 or y%400=0\)/)
  assert.match(fn('d1_valid_date').body, /return d between 1 and days/)
  assert.match(fn('d1_utf16_length').body, /ascii\(c\) > 65535/)
  assert.match(fn('d1_json_text').body, /d1_utf16_length/)
  assert.ok(fn('d1_json_text').body.includes('\\FEFF'))
})
test('static: RLS tests require dedicated empty users and random fixture namespace', () => {
  assert.match(checks, /YES_DEDICATED_TEST_ACCOUNTS/)
  assert.match(checks, /test accounts must contain NO application records/)
  assert.match(checks, /gen_random_uuid\(\)/)
  assert.match(checks, /set local row_security = on/)
  for (const role of ['authenticated', 'anon']) {
    assert.match(checks, new RegExp(`set local role ${role}`)); assert.match(checks, new RegExp(`current_user <> '${role}'`))
  }
  assert.match(checks, /rolsuper or rolbypassrls/)
  assert.match(checks, /request.jwt.claim.sub/); assert.match(checks, /request.jwt.claims/)
})
test('static: prepared test matrix covers both tables, ownership and all anonymous operations', () => {
  for (const table of ['trips', 'country_records']) {
    for (const verb of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) assert.ok(checks.includes(`anon ${verb} ${table}`))
    for (const marker of ['foreign INSERT', 'foreign UPDATE', 'foreign hard DELETE', 'owner hard DELETE']) assert.ok(checks.includes(`${marker} ${table}`))
  }
  assert.match(checks, /last_expected_revision=2/)
  assert.match(checks, /last_operation='restore',deleted_at=null\n\s+where user_id=current_setting\('d1.user_a'\)/)
  assert.match(checks, /same-ID owner isolation failed/)
})
test('static: prepared lifecycle assertions include restore, replay, stale and trip deletion protections', () => {
  for (const marker of ['trip create replay', 'trip edit replay', 'trip stale version', 'country stale version', 'country soft delete/replay',
    'foreign RPC country restore', 'restore reused UUID different request', 'restore active country', 'restore overwrote retained content',
    'country re-mark failed', 'delayed restore after newer edit', 'delayed delete after restore', 'direct trip resurrection', 'missing sub restore RPC']) assert.ok(checks.includes(marker), marker)
})
test('TypeScript: unchanged SQL fixture yields TW/GR green, AE blue and two flights', () => {
  assert.equal(validSavedDraft(fixture), true)
  const p = previewTripDraft(fixture)
  assert.equal(p.kind, 'ready'); assert.equal(p.trip.flights.length, 2); assert.equal(p.trip.stops.length, 3)
  assert.deepEqual(p.footprint.countryTotals, { total: 3, visited: 2, transit: 1 })
  assert.equal(p.footprint.countries.find(c => c.countryCode === 'TW').color, '#22c55e')
  assert.equal(p.footprint.countries.find(c => c.countryCode === 'AE').color, '#3b82f6')
})
test('TypeScript: optional blank/leap dates and nullable airport fields preserve existing format', () => {
  for (const date of [undefined, '', '2024-02-29', '2000-02-29', '0000-02-29']) {
    const p = structuredClone(fixture); if (date !== undefined) p.legs[0].date = date
    p.stops[0].airport.iata = null; p.stops[0].airport.city = null
    assert.equal(validSavedDraft(p), true)
  }
})
test('TypeScript: malformed cases prepared in SQL are invalid under the existing model', () => {
  const mutations = [
    p => { delete p.stops[0].airport.name }, p => { delete p.stops[0].airport.sourceCountryCode },
    p => { p.stops[0].airport.sourceId = 5528 }, p => { p.stops[0].airport.iata = 'TP' },
    p => { p.stops[0].airport.icao = 'RCT' }, p => { p.stops[0].airport.latitude = 91 },
    p => { p.stops[0].airport.updatedAt = '2026-02-30T01:53:12Z' }, p => { p.stops[0].airport.sourceCountryCode = 'CN' },
    p => { p.stops[0].airport.sourceCountryCode = 'ZZ'; p.stops[0].airport.isoCountryCode = 'ZZ' },
    p => { p.stops[0].airport.sourceCountryCode = 'AQ'; p.stops[0].airport.isoCountryCode = 'AQ' },
    p => { p.stops[0].airport.aliases = [123] }, p => { p.stops[0].airport.history = [{}] },
    p => { delete p.stops[0].airport.closed }, p => { p.legs[0].date = '2026-02-30' },
    p => { p.legs[0].date = '1900-02-29' }, p => { p.legs[0].airline = null },
    p => { p.legs[0].toStopId = 'unknown-stop' }, p => { p.legs[1].id = p.legs[0].id },
    p => { p.stops[1].airport = structuredClone(p.stops[0].airport) }, p => { p.status = 'planned' }, p => { p.id = '   ' },
  ]
  for (const mutate of mutations) { const p = structuredClone(fixture); mutate(p); assert.equal(validSavedDraft(p), false) }
})
test('static: concurrency limits and frontend account isolation are explicitly documented', () => {
  for (const text of ['TWO independent', 'BEGIN/ROLLBACK', '55P03', 'requires a committed throwaway fixture',
    'NOT currently', 'statuses/notes/reviews', 'reset/replaceData', 'generation/epoch', 'service_role', 'not live RLS']) assert.ok(doc.includes(text), text)
})
test('static: rejected test UPDATE/DELETE statements also target only namespaced fixtures', () => {
  const source = checks.replace(/--[^\n]*/g, '')
  const writes = [...source.matchAll(/(?:update|delete from) public\.(?:trips|country_records)\b[^;]+;/g)].map(m => m[0])
  assert.ok(writes.length >= 10)
  for (const statement of writes) {
    assert.match(statement, /\bwhere\b/)
    assert.match(statement, /(?:id|geo_id)=current_setting\('d1\.(?:test_id|geo_id|direct_id)'\)/)
  }
  assert.match(checks, /foreach privilege_name in array array\['SELECT','INSERT','UPDATE'\]/)
  assert.match(checks, /has_table_privilege\(current_user,tbl,privilege_name\)/)
  assert.match(checks, /anon must have no table CRUD grants/)
  assert.match(checks, /anon RPC grant leaked/)
})
