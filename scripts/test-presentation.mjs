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

const {acknowledgedJourney,journeyFrame,animationAllowed,LEG_DURATION}=load('src/lib/presentation/journey.ts')
const {createTripDraft,addDraftStop}=load('src/lib/trip-draft/core.ts')
const airports=load('src/lib/airport-data/catalog.ts').AIRPORT_CATALOG
const draft=['TPE','DXB','ATH'].reduce((d,c,i)=>addDraftStop(d,airports.find(a=>a.iata===c),'stop-'+i),{...createTripDraft('journey-test'),status:'completed'})
draft.stops[1].countryPresence='transit'
for(const [ok,creating] of [[false,true],[false,false],[true,false]])test(`no success journey when ack=${ok}, creating=${creating}`,()=>assert.equal(acknowledgedJourney(draft,ok,creating),null))
test('acknowledged route retains independent ordered legs, correct endpoints and input',()=>{
 const before=JSON.stringify(draft),plan=acknowledgedJourney(draft,true,true)
 assert.equal(plan.arcs.length,2);assert.equal(plan.arcs[0].startLng,draft.stops[0].airport.longitude);assert.equal(plan.arcs[0].endLng,draft.stops[1].airport.longitude)
 assert.equal(plan.arcs[1].startLng,draft.stops[1].airport.longitude);assert.equal(plan.arcs[1].endLng,draft.stops[2].airport.longitude)
 assert.equal(JSON.stringify(draft),before)
})
test('noncompleted and invalid route never animate success',()=>{
 assert.equal(acknowledgedJourney({...draft,status:'planned'},true,true),null)
 assert.equal(acknowledgedJourney({...draft,stops:[],legs:[]},true,true),null)
})
test('timeline reveals legs sequentially then finishes without adding flight counts',()=>{
 const arcs=acknowledgedJourney(draft,true,true).arcs
 assert.deepEqual(journeyFrame(arcs,0),{index:0,progress:0,done:false})
 assert.deepEqual(journeyFrame(arcs,LEG_DURATION/2),{index:0,progress:.5,done:false})
 assert.deepEqual(journeyFrame(arcs,LEG_DURATION),{index:1,progress:0,done:false})
 assert.deepEqual(journeyFrame(arcs,LEG_DURATION*2),{index:1,progress:1,done:true})
 assert.equal(journeyFrame([],0).done,true)
})
for(const [r,h,l] of [[true,false,false],[false,true,false],[false,false,true]])test(`motion fallback reduced=${r}/hidden=${h}/lowPower=${l}`,()=>assert.equal(animationAllowed(r,h,l),false))
test('only foreground capable devices animate',()=>assert.equal(animationAllowed(false,false,false),true))
test('success hook is downstream of server acknowledgement; local path has no celebration',()=>{
 const s=fs.readFileSync('src/components/trip-editor.tsx','utf8')
 assert.ok(s.indexOf('if(!result.ok){setSaveError(result.error);return}')<s.indexOf('celebrate(result.value.draft,expected===null,fromColors)'))
 assert.match(s,/celebrate\(result.value.draft,expected===null,fromColors\)/)
 assert.doesNotMatch(s,/celebrate\(captured/)
})
test('cover is dynamic, noninteractive, no private stores and has static failure handling',()=>{
 const c=fs.readFileSync('src/components/login-cover.tsx','utf8'),g=fs.readFileSync('src/components/login-globe.tsx','utf8')
 assert.match(c,/ssr:false/);assert.match(c,/getDerivedStateFromError/);assert.match(c,/pointer-events-none/)
 assert.doesNotMatch(g,/useTripDraft|useAccount|localStorage|setStatus/)
 assert.match(g,/setPixelRatio\(1\)/);assert.match(g,/webglcontextlost/);assert.match(g,/pauseAnimation/);assert.match(g,/cancelAnimationFrame/)
})
test('mobile navigation has five localized actions and is absent over editor/records',()=>{
 const s=fs.readFileSync('src/components/mobile-navigation.tsx','utf8')
 for(const key of ['globe','records','add','stats','settings'])assert.ok(s.includes("'"+key+"'"))
 assert.match(s,/session.opened\|\|session.recordsOpen\|\|session.previewActive\|\|session.drawerOpen/)
 assert.match(s,/safe-area-inset-bottom/)
 const {translate}=load('src/lib/i18n.ts')
 for(const locale of ['en','fr','es','de','zh-TW'])for(const key of ['journey.saved','journey.skip','nav.label',...['globe','records','add','stats','settings'].flatMap(k=>['nav.'+k,'nav.go.'+k])])assert.notEqual(translate(locale)(key),key)
})
test('presentation cleanup preserves functional map palette and confirmed statistics',()=>{
 const s=fs.readFileSync('src/components/trip-draft-provider.tsx','utf8')
 assert.match(s,/cancelAnimationFrame/);assert.match(s,/savedTripMap\(savedTrips.trips,statuses\)/)
 assert.doesNotMatch(fs.readFileSync('src/lib/presentation/journey.ts','utf8'),/setItem|setStatus|supabase/)
 assert.deepEqual(load('src/lib/travel-core/palette.ts').FOOTPRINT_COLORS,{visited:'#6F9E91',transit:'#8BB6CE',unvisited:'#D8E0E3'})
})

test('flight clock waits for ready WebGL before revealing the first leg',()=>{
 const s=fs.readFileSync('src/components/trip-draft-provider.tsx','utf8'),g=fs.readFileSync('src/components/globe-view.tsx','utf8')
 assert.match(s,/if\(!journeyReady\)return/);assert.match(s,/setJourneyReady\(false\)/)
 assert.match(g,/onGlobeReady=/);assert.match(g,/markJourneyReady\(\)/)
})

const {Group,Mesh,MeshBasicMaterial,BufferGeometry,Color}=native('three')
const {countryFade}=load('src/lib/presentation/country-fade.ts')
function polygon(id,cap){const group=new Group();group.__globeObjType='polygon';group.__data={data:{id}};const mesh=new Mesh(new BufferGeometry(),[new MeshBasicMaterial(),cap]);group.add(mesh);return {group,mesh}}
test('real Three cap fades independently from gray to green; shared materials and data are preserved',()=>{
 const scene=new Group(),shared=new MeshBasicMaterial({color:'#6F9E91'}),a=polygon('158',shared),b=polygon('392',shared);scene.add(a.group,b.group)
 const input=Object.freeze({'158':'#6F9E91'}),fade=countryFade(scene,input,()=> '#D8E0E3')
 assert.equal(fade.count,1);assert.equal(a.mesh.material[1].color.getHexString(),'d8e0e3');assert.equal(b.mesh.material[1],shared)
 fade.apply(.5);assert.notEqual(a.mesh.material[1].color.getHexString(),'d8e0e3');assert.notEqual(a.mesh.material[1].color.getHexString(),'6f9e91');assert.equal(shared.color.getHexString(),'6f9e91')
 fade.apply(1);assert.equal(a.mesh.material[1].color.getHexString(),'6f9e91')
 let disposed=0;a.mesh.material[1].addEventListener('dispose',()=>disposed++);fade.dispose();fade.dispose();assert.equal(disposed,1);assert.equal(a.mesh.material[1],shared);assert.deepEqual(input,{'158':'#6F9E91'})
})
test('interrupted transit fade never restores over a newer renderer material',()=>{
 const scene=new Group(),a=polygon('784',new MeshBasicMaterial({color:'#8BB6CE'}));scene.add(a.group)
 const fade=countryFade(scene,{'784':'#8BB6CE'},()=> '#D8E0E3');fade.apply(1);assert.equal(a.mesh.material[1].color.getHexString(),'8bb6ce')
 const newer=new MeshBasicMaterial({color:'#6F9E91'});a.mesh.material[1]=newer;fade.dispose();assert.equal(a.mesh.material[1],newer)
})
test('already visited caps do not fade back to gray on repeated visits',()=>{
 const scene=new Group(),a=polygon('158',new MeshBasicMaterial({color:'#6F9E91'}));scene.add(a.group)
 const fade=countryFade(scene,{'158':'#6F9E91'},()=> '#6F9E91');assert.equal(fade.count,0);fade.dispose()
 assert.equal(a.mesh.material[1].color.getHexString(),new Color('#6F9E91').getHexString())
})

test('multipart island countries fade every cap but count unique country readiness once',()=>{
 const scene=new Group(),cap=new MeshBasicMaterial({color:'#6F9E91'}),a=polygon('300',cap),b=polygon('300',cap);scene.add(a.group,b.group)
 const fade=countryFade(scene,{'300':'#6F9E91'},()=> '#D8E0E3');assert.equal(fade.count,2);assert.equal(fade.countries,1);fade.apply(.5)
 assert.equal(a.mesh.material[1].color.getHexString(),b.mesh.material[1].color.getHexString());fade.dispose()
})
test('renderer country fade waits for confirmed target material before cloning',()=>{
 const scene=new Group(),cap=new MeshBasicMaterial({color:'#D8E0E3'}),a=polygon('158',cap);scene.add(a.group)
 const pending=countryFade(scene,{'158':'#6F9E91'},()=> '#D8E0E3');assert.equal(pending.count,0);assert.equal(a.mesh.material[1],cap);pending.dispose()
 cap.color.set('#6F9E91');const ready=countryFade(scene,{'158':'#6F9E91'},()=> '#D8E0E3');assert.equal(ready.countries,1);ready.dispose();assert.equal(a.mesh.material[1].color.getHexString(),'6f9e91')
})
