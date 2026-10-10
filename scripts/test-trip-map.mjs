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
const {savedTripMap,mergeMapColors}=load('src/lib/trip-map/core.ts')
const {createTripDraft,addDraftStop}=load('src/lib/trip-draft/core.ts')
const {TripRepository}=load('src/lib/trip-storage/repository.ts')
const {TRIPS_KEY}=load('src/lib/trip-storage/core.ts')
const catalog=load('src/lib/airport-data/catalog.ts').AIRPORT_CATALOG
const airport=c=>catalog.find(a=>a.iata===c)
function record(id,codes=['TPE','DXB','ATH']){
 const d=codes.reduce((d,c,i)=>addDraftStop(d,airport(c),id+':s'+i),{...createTripDraft(id),status:'completed'})
 if(codes.includes('DXB'))d.stops.find(s=>s.airport.iata==='DXB').countryPresence='transit'
 return {draft:d,createdAt:'2026-10-10T00:00:00Z',updatedAt:'2026-10-10T00:00:00Z'}
}
test('TPE KCZ committed colors and routes are identical on both maps',()=>{
 const m=savedTripMap([record('one',['TPE','KCZ'])],{})
 assert.equal(m.colors['158'],'#22c55e');assert.equal(m.colors['392'],'#22c55e')
 assert.deepEqual(m.colors,m.flatColors);assert.equal(m.arcs.length,1)
 assert.equal(m.arcs[0].endLng,airport('KCZ').longitude);assert.equal(m.countryCount,2)
})
test('multi-stop completed trip has green TW GR, blue AE and two independent legs',()=>{
 const m=savedTripMap([record('one')],{})
 assert.deepEqual(m.colors,{'158':'#22c55e','784':'#3b82f6','300':'#22c55e'})
 assert.deepEqual(m.colors,m.flatColors);assert.equal(m.arcs.length,2)
 assert.equal(m.visitedCount,2);assert.equal(m.transitCount,1);assert.equal(m.tripCount,1)
})
test('repeat routes retain each flight and group only directed endpoints',()=>{
 const a=record('a'),b=record('b'),c=record('c',['ATH','DXB','TPE'])
 const m=savedTripMap([a,b,c],{})
 assert.equal(m.countryCount,3);assert.equal(m.flightCount,6);assert.equal(m.tripCount,3)
 assert.equal(m.renderedArcs.length,4);assert.equal(m.renderedArcs[0].count,2)
 assert.deepEqual(m.renderedArcs[0].flightRefs.map(f=>f.tripId),['a','b'])
})
test('manual visited outranks transit; all legacy preferences are immutable',()=>{
 const statuses={'784':'visited','392':'wishlist','158':'blocked'},original=structuredClone(statuses)
 const records=[record('a')],saved=structuredClone(records)
 const m=savedTripMap(records,statuses)
 assert.equal(m.colors['784'],'#22c55e');assert.equal(m.countryCount,3)
 assert.deepEqual(statuses,original);assert.deepEqual(records,saved)
 const deleted=savedTripMap([],statuses);assert.equal(deleted.countryCount,1)
 assert.equal(deleted.colors['784'],'#22c55e');assert.equal(deleted.colors['392'],undefined)
})
test('manual and trip countries deduplicate; unresolved manual areas keep original counting',()=>{
 const m=savedTripMap([record('a',['TPE','KCZ'])],{'158':'visited','392':'visited','9999':'visited'})
 assert.equal(m.countryCount,3);assert.equal(m.colors['9999'],'#22c55e')
})
test('edit/delete recomputes blue to green and preserves contributions from other trips',()=>{
 const a=record('a'),b=record('b');b.draft.stops[1].countryPresence='visited'
 assert.equal(savedTripMap([a,b],{}).colors['784'],'#22c55e')
 assert.equal(savedTripMap([a],{}).colors['784'],'#3b82f6')
 assert.equal(savedTripMap([],{}).countryCount,0)
 assert.equal(savedTripMap([b],{}).flightCount,2)
})
test('incomplete and invalid drafts produce no committed footprint or routes',()=>{
 for(const status of ['draft','planned','in_progress']){
 const r=record(status);r.draft.status=status
 assert.equal(savedTripMap([r],{}).flightCount,0);assert.equal(savedTripMap([r],{}).countryCount,0)
 }
 const r=record('bad');r.draft.legs=[];assert.equal(savedTripMap([r],{}).tripCount,0)
})
test('preview composition is separate and visited wins; exiting restores saved-only values',()=>{
 const saved=savedTripMap([record('a')],{}),original=structuredClone(saved)
 const display=mergeMapColors(saved.colors,{'392':'#22c55e','784':'#22c55e','158':'#3b82f6'})
 assert.equal(display['158'],'#22c55e');assert.equal(display['784'],'#22c55e')
 assert.deepEqual(saved,original);assert.equal(saved.colors['392'],undefined)
})
test('repository quota failure never publishes unsaved footprint; refresh restores success',()=>{
 const data=new Map([['globetrotter:v1','legacy'],['globetrotter','old']]);let fail=false
 const port={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('quota');data.set(k,v)}}
 const repo=new TripRepository(()=>port);repo.subscribe(()=>{})
 const a=record('a',['TPE','KCZ']);assert.equal(repo.save(a.draft,null).ok,true)
 const before=savedTripMap(repo.getSnapshot().trips,{});fail=true
 assert.equal(repo.save(record('b').draft,null).ok,false)
 assert.deepEqual(savedTripMap(repo.getSnapshot().trips,{}),before)
 const fresh=new TripRepository(()=>port);fresh.subscribe(()=>{})
 assert.deepEqual(savedTripMap(fresh.getSnapshot().trips,{}),before)
 assert.equal(data.get('globetrotter:v1'),'legacy');assert.equal(data.get('globetrotter'),'old');assert.ok(data.has(TRIPS_KEY))
})
