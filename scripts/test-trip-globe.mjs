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
const {draftGlobePreview,markerSubset,isAirportTap,markerMotionController}=load('src/lib/trip-draft/globe.ts')
const {createTripDraft,addDraftStop}=load('src/lib/trip-draft/core.ts')
const catalog=load('src/lib/airport-data/catalog.ts').AIRPORT_CATALOG
const airport=c=>catalog.find(a=>a.iata===c)
const draft=()=>['TPE','DXB','ATH'].reduce((d,c,i)=>addDraftStop(d,airport(c),'s'+i),createTripDraft('test'))
test('same draft supports mixed selections and two correct independent arc coordinates',()=>{
 const d=draft(),p=draftGlobePreview(d);assert.equal(p.arcs.length,2)
 assert.equal(p.arcs[0].startLat,airport('TPE').latitude);assert.equal(p.arcs[0].endLng,airport('DXB').longitude)
 assert.equal(p.arcs[1].startLng,airport('DXB').longitude);assert.equal(p.arcs[1].endLat,airport('ATH').latitude)
 assert.notEqual(p.arcs[0].flightId,p.arcs[1].flightId);assert.ok(p.arcs.every(a=>a.altitude>0));assert.deepEqual(p.colors,{})
})
for(const status of ['draft','planned','in_progress'])test(`${status} arcs are preview only and have no country colors`,()=>{const d=draft();d.status=status;const p=draftGlobePreview(d);assert.equal(p.arcs.length,2);assert.deepEqual(p.colors,{})})
test('completed uses 2A colors via confirmed ISO geometry; no store mutation',()=>{const d=draft();d.status='completed';d.stops[1].countryPresence='transit';const before=structuredClone(d),p=draftGlobePreview(d);assert.equal(p.colors['158'],'#22c55e');assert.equal(p.colors['784'],'#3b82f6');assert.equal(p.colors['300'],'#22c55e');assert.deepEqual(d,before)})
test('date-line and long routes have positive schematic altitude',()=>{for(const codes of [['NRT','LAX'],['TPE','JFK']]){const d=codes.reduce((s,c,i)=>addDraftStop(s,airport(c),'s'+i),createTripDraft('long'));const a=draftGlobePreview(d).arcs[0];assert.ok(a.distanceKm>5000);assert.ok(a.altitude>=0.05&&a.altitude<=0.5)}})
test('repeated directional flights retained individually',()=>{const d=['TPE','DXB','TPE','DXB'].reduce((s,c,i)=>addDraftStop(s,airport(c),'s'+i),createTripDraft('repeat'));const arcs=draftGlobePreview(d).arcs;assert.equal(arcs.length,3);assert.notEqual(arcs[0].flightId,arcs[2].flightId)})
test('marker budget bounds 9940 records and gives selected airports priority',()=>{const a=airport('TPE');const subset=markerSubset([[a],catalog]);assert.equal(subset.length,48);assert.equal(subset[0].id,a.id);assert.equal(new Set(subset.map(a=>a.id)).size,48)})
test('drag and multitouch are not airport taps',()=>{assert.equal(isAirportTap({x:0,y:0},{x:30,y:0},false),false);assert.equal(isAirportTap({x:0,y:0},{x:0,y:0},true),false);assert.equal(isAirportTap({x:0,y:0},{x:2,y:2},false),true)})
test('gesture end restores markers even while auto-spin continues; change is not a hiding event',async()=>{const events=[],controller=markerMotionController(x=>events.push(x),5);controller.start();controller.end();await new Promise(r=>setTimeout(r,20));assert.deepEqual(events,[true,false]);assert.equal(controller.change,undefined);controller.dispose()})
test('regional API limits data and rejects unreliable regions / invalid coordinates',async()=>{const {GET}=load('src/app/api/airports/nearby/route.ts');const response=await GET(new Request('http://localhost/api/airports/nearby?lat=25&lng=121'));const {airports}=await response.json();assert.ok(airports.length<=32);assert.ok(airports.every(a=>a.isoCountryCode&&!a.closed));assert.equal((await GET(new Request('http://localhost/api/airports/nearby?lat=999&lng=0'))).status,400)})

test('actual Three.js cubic construction clears the sphere for short, date-line, long and near-antipodal arcs',async()=>{
 const {CubicBezierCurve3,Vector3}=await import('three'),{geoInterpolate}=await import('d3-geo')
 const {renderedArcAltitude}=load('src/lib/trip-draft/globe.ts')
 const vec=([lng,lat,alt])=>{const r=100*(1+alt),a=lat*Math.PI/180,b=lng*Math.PI/180;return new Vector3(r*Math.cos(a)*Math.sin(b),r*Math.sin(a),r*Math.cos(a)*Math.cos(b))}
 for(const [start,end,angle] of [[[0,0],[1,0],1],[[179,0],[-179,0],2],[[0,0],[150,0],150],[[0,0],[179.999,0],179.999]]){
   const descriptor={distanceKm:angle*Math.PI/180*6371,altitude:Math.max(.05,Math.min(.5,angle*Math.PI/180*6371/40000))}
   const before=structuredClone(descriptor),alt=renderedArcAltitude(descriptor),ends=.015,interpolate=geoInterpolate(start,end)
   // The installed three-globe implementation constructs these cubic control points.
   const cp=alt+(alt-ends)*.5
   const curve=new CubicBezierCurve3(vec([...start,ends]),vec([...interpolate(.25),cp]),vec([...interpolate(.75),cp]),vec([...end,ends]))
   assert.ok(curve.getPoints(256).every(p=>p.length()>=100.2),'Centerline plus tube clearance stays above globe radius')
   assert.deepEqual(descriptor,before)
 }
})
test('pending regions and close-by non-priority markers cannot bypass selection policy',()=>{
 assert.equal(markerSubset([[airport('HKG')]]).length,0)
 const close={...structuredClone(airport('TPE')),id:'other',sourceId:'other',latitude:airport('TPE').latitude+.01}
 assert.equal(markerSubset([[airport('TPE'),close]],48,5).length,1)
})

test('completed TPE KCZ uses the same country footprint for globe and flat map',()=>{
 const d=['TPE','KCZ'].reduce((s,c,i)=>addDraftStop(s,airport(c),'s'+i),createTripDraft('kcz'));d.status='completed'
 const before=structuredClone(d),p=draftGlobePreview(d)
 assert.deepEqual(p.colors,{'158':'#22c55e','392':'#22c55e'})
 assert.deepEqual(p.flatColors,p.colors);assert.equal(p.arcs.length,1)
 assert.equal(p.arcs[0].endLat,airport('KCZ').latitude);assert.deepEqual(d,before)
})
test('completed TPE DXB ATH has identical green and blue previews in both maps',()=>{
 const d=draft();d.status='completed';d.stops[1].countryPresence='transit';const p=draftGlobePreview(d)
 assert.deepEqual(p.flatColors,{'158':'#22c55e','300':'#22c55e','784':'#3b82f6'});assert.deepEqual(p.colors,p.flatColors);assert.equal(p.arcs.length,2)
})
for(const status of ['draft','planned','in_progress'])test(`${status} contributes no flat-map country preview`,()=>{
 const d=draft();d.status=status;const p=draftGlobePreview(d);assert.deepEqual(p.flatColors,{});assert.deepEqual(p.colors,{});assert.equal(p.arcs.length,2)
})
