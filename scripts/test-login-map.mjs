import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import {createRequire} from 'node:module'
const native=createRequire(import.meta.url),cache=new Map()
function load(file){const p=path.resolve(file);if(cache.has(p))return cache.get(p)
 if(p.endsWith('.json'))return JSON.parse(fs.readFileSync(p,'utf8'))
 const exports={};cache.set(p,exports)
 const code=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 new vm.Script(`(function(exports,require){${code}\n})`).runInThisContext()(exports,n=>{if(!n.startsWith('.')&&!n.startsWith('@/'))return native(n);const f=n.startsWith('@/')?path.resolve('src',n.slice(2)):path.resolve(path.dirname(p),n);return load(path.extname(f)?f:f+'.ts')});return exports}
const {authDestination,canShowWorkspace}=load('src/lib/auth/navigation.ts')
for(const phase of ['loading','signed-out','error','signing-out'])test(`${phase}: no private workspace; guest redirects or verification waits`,()=>{
 const state={phase,user:null};assert.equal(canShowWorkspace(state,true),false)
 assert.equal(authDestination(state,false,true),phase==='loading'?null:'/login')
 assert.equal(authDestination(state,true,true),null)
})
test('verified user bypasses login, remains home; ready without identity is blocked',()=>{
 const ready={phase:'ready',user:{id:'synthetic-account'}}
 assert.equal(canShowWorkspace(ready,true),true);assert.equal(authDestination(ready,true,true),'/');assert.equal(authDestination(ready,false,true),null)
 assert.equal(canShowWorkspace({...ready,user:null},true),false)
})
test('unconfigured deployment never falls back to local private workspace',()=>{
 assert.equal(authDestination({phase:'signed-out',user:null},false,false),'/login')
 assert.equal(canShowWorkspace({phase:'ready',user:{id:'stale'}},false),false)
})
const {countryFeatures,globeCountryFeatures}=load('src/lib/geo.ts')
const {baseFill,MAP_PALETTE}=load('src/lib/colors.ts')
const {geoContains,geoArea,geoMercator,geoPath}=native('d3-geo')
const ukIds=['826-eng','826-sco','826-wal','826-nir']
const points={'826-eng':[-1,52],'826-sco':[-4,57],'826-wal':[-4,52],'826-nir':[-6.5,54.6]}
for(const [renderer,features] of [['SVG',countryFeatures],['WebGL',globeCountryFeatures]]){
 test(`${renderer}: real UK constituent geometry is bounded, correctly wound and non-overlapping at inland samples`,()=>{
  assert.equal(features.some(f=>f.id==='826'),false)
  for(const id of ukIds){const f=features.find(f=>f.id===id);assert.ok(f);assert.ok(geoArea(f)<.01)
   assert.equal(geoContains(f,points[id]),true);assert.equal(geoContains(f,[0,0]),false)
   for(const other of ukIds.filter(k=>k!==id))assert.equal(geoContains(f,points[other]),false)
   const bounds=geoPath(geoMercator().scale(100))(f);assert.ok(bounds?.length>10)
  }
 })
 for(const theme of ['dark','light'])test(`${renderer}/${theme}: every unvisited feature has the identical palette; selected/stale parent cannot alter base fill`,()=>{
  for(const f of features)assert.equal(baseFill(f.id,undefined,MAP_PALETTE[theme]),'#D8E0E3',f.id)
  for(const id of ukIds)assert.equal(baseFill(id,'visited',MAP_PALETTE[theme]),'#6F9E91')
 })
}
const {savedTripMap}=load('src/lib/trip-map/core.ts')
const {createTripDraft,addDraftStop}=load('src/lib/trip-draft/core.ts')
const airports=load('src/lib/airport-data/catalog.ts').AIRPORT_CATALOG
function record(id,codes){return {draft:codes.reduce((d,c,i)=>addDraftStop(d,airports.find(a=>a.iata===c),id+':'+i),{...createTripDraft(id),status:'completed'}),createdAt:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z'}}
test('GB airport paints all real constituent paths, counts UK once and green overrides transit',()=>{
 const r=record('fixture',['TPE','LHR']);r.draft.stops[1].countryPresence='transit'
 const transit=savedTripMap([r],{});assert.equal(transit.countryCount,2)
 for(const id of ukIds){assert.equal(transit.colors[id],'#8BB6CE');assert.equal(transit.flatColors[id],'#8BB6CE')}
 const visited=savedTripMap([r],{'826':'visited'});assert.equal(visited.countryCount,2)
 for(const id of ukIds){assert.equal(visited.colors[id],'#6F9E91');assert.equal(visited.flatColors[id],'#6F9E91')}
 assert.deepEqual(savedTripMap([],{}).colors,{})
})
test('map paths have no selection fill mutation; both map renderers share baseFill',()=>{
 for(const f of ['flat-map','globe-view']){const s=fs.readFileSync(`src/components/${f}.tsx`,'utf8');assert.match(s,/baseFill\(f.id/);assert.doesNotMatch(s,/lighten\(/)}
})

// All four source IDs previously fell through to their parent cca2=GB display name.
test('UK constituent Chinese labels match actual geometry IDs without changing ISO statistics',()=>{
 const {countryName}=load('src/lib/localized-country.ts')
 const names={'826-eng':'英格蘭','826-sco':'蘇格蘭','826-wal':'威爾斯','826-nir':'北愛爾蘭'}
 for(const [id,name] of Object.entries(names))assert.equal(countryName(id,'zh-TW'),name)
 assert.equal(countryName('826','zh-TW'),'英國')
})
test('pagehide synchronously removes private UI before browser Back/Forward restoration',()=>{
 const s=fs.readFileSync('src/components/auth-provider.tsx','utf8')
 assert.match(s,/addEventListener\('pagehide',onPageHide\)/);assert.match(s,/flushSync\(\(\)=>\{setGeneration/);assert.match(s,/removeEventListener\('pagehide',onPageHide\)/)
})

test('country search keeps a stable translated accessible label when results appear',()=>{
 assert.match(fs.readFileSync('src/components/sidebar.tsx','utf8'),/aria-label={t\("search.label"\)}/)
})

const {flatFocusDiagnostics}=await import('./browser-flat-diagnostics.mjs')
test('focus failure diagnostics accept null coordinates without masking the original failure',async()=>{
 const page={locator:()=>({evaluate:async()=>({zoom:{k:1.7416}})}),evaluate:()=>{throw new Error('should not sample null coordinates')}}
 const evidence=await flatFocusDiagnostics(page,{id:'826-eng',base:null,target:{x:1,y:2}})
 assert.equal(evidence.actual.zoom.k,1.7416);assert.match(evidence.sample.skipped,/No finite/)
})
test('focus failure diagnostics tolerate a missing SVG or closed page',async()=>{
 const page={locator:()=>({evaluate:async()=>{throw new Error('missing SVG')}}),evaluate:async()=>{throw new Error('closed page')}}
 const evidence=await flatFocusDiagnostics(page,{id:'826-eng',base:[1,2],target:null})
 assert.equal(evidence.actual.diagnosticError,'missing SVG');assert.equal(evidence.sample.diagnosticError,'closed page')
})
