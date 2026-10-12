import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import sharp from 'sharp'
function load(file){const exports={};new vm.Script(`(function(exports,require){${ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText}\n})`).runInThisContext()(exports,()=>({}));return exports}
const {isAppleMobile,isStandalone}=load('src/lib/pwa.ts')
test('iPhone and iPadOS desktop user agents receive manual Apple instructions',()=>{
 assert.equal(isAppleMobile('iPhone Safari',5),true);assert.equal(isAppleMobile('Macintosh Safari',5),true)
 assert.equal(isAppleMobile('Macintosh Safari',0),false);assert.equal(isAppleMobile('Android Chrome',5),false)
})
test('both standards-based and Apple standalone detection work',()=>{
 assert.equal(isStandalone(true),true);assert.equal(isStandalone(false,true),true)
 assert.equal(isStandalone(false,false),false)
})
test('manifest has stable identity, root scope, standalone, theme and complete icons without offline promises',()=>{
 const m=load('src/app/manifest.ts').default()
 assert.equal(m.id,'/');assert.equal(m.start_url,'/');assert.equal(m.scope,'/');assert.equal(m.name,'Globetrotter')
 assert.equal(m.display,'standalone');assert.equal(m.theme_color,'#DCE9ED');assert.doesNotMatch(m.description,/works offline/i)
 for(const icon of m.icons)assert.ok(fs.existsSync('public'+icon.src))
 assert.ok(m.icons.some(i=>i.sizes==='192x192'&&i.purpose==='any'))
 assert.ok(m.icons.some(i=>i.sizes==='512x512'&&i.purpose==='any'))
 assert.ok(m.icons.some(i=>i.sizes==='512x512'&&i.purpose==='maskable'))
})
for(const [file,size] of [['icon-192.png',192],['icon-512.png',512],['maskable-512.png',512],['apple-touch-icon.png',180]])test(`${file} is correctly sized and opaque`,async()=>{
 const p='public/icons/'+file,m=await sharp(p).metadata(),stats=await sharp(p).stats()
 assert.equal(m.width,size);assert.equal(m.height,size);assert.equal(m.format,'png');assert.equal(stats.isOpaque,true)
 assert.ok(fs.statSync(p).size<150000)
})
test('all five install dictionaries explicitly include every instruction',()=>{
 const source=fs.readFileSync('src/lib/i18n.ts','utf8')+'\nexport {en,fr,es,de,zhTW}'
 const exports={};new vm.Script(`(function(exports,require){${ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText}\n})`).runInThisContext()(exports,()=>({}))
 const keys=Object.keys(exports.en).filter(k=>k.startsWith('pwa.'));assert.equal(keys.length,18)
 for(const language of ['en','fr','es','de','zhTW'])for(const key of keys)assert.ok(exports[language][key],language+key)
})
function worker({type='image/png',privacy='',redirected=false,url='https://preview.example/icons/icon-192.png',keys=[],storageFails=false}={}){
 const handlers={},writes=[],deleted=[],reads=[]
 const response={ok:true,redirected,url,headers:new Headers({'Content-Type':type,'Cache-Control':privacy}),clone(){return this}}
 const cache={match:async request=>{reads.push(request.url);return null},put:async request=>writes.push(request.url)}
 const sandbox={URL,Set,caches:{open:async name=>{assert.equal(name,'globetrotter-v5');if(storageFails)throw Error('Storage unavailable');return cache},keys:async()=>keys,delete:async key=>deleted.push(key)},fetch:async()=>response,
 self:{location:{origin:'https://preview.example'},skipWaiting:async()=>{},clients:{claim:async()=>{}},addEventListener:(n,f)=>handlers[n]=f}}
 vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),sandbox)
 return {writes,deleted,reads,async get(path,options={}){let promise;handlers.fetch({request:{url:new URL(path,'https://preview.example').href,mode:'cors',method:'GET',headers:new Headers(options.headers),...options},respondWith:p=>promise=p});if(promise)await promise;return !!promise},async activate(){let promise;handlers.activate({waitUntil:p=>promise=p});await promise}}
}
for(const path of ['/auth/callback?code=synthetic','/auth/session','/api/account','/login','/','/?_rsc=1','/icons/icon-192.png?code=synthetic','https://project.supabase.co/rest/v1/trips','/icons/private.json'])test(`no PWA cache for ${path}`,async()=>{
 const w=worker();assert.equal(await w.get(path),false);assert.deepEqual(w.writes,[]);assert.deepEqual(w.reads,[])
})
for(const options of [{mode:'navigate'},{headers:new Headers({Authorization:'synthetic-fixture'})},{headers:new Headers({RSC:'1'})},{method:'POST'}])test('navigation, authorization, RSC and writes bypass even icon cache',async()=>{
 const w=worker();assert.equal(await w.get('/icons/icon-192.png',options),false);assert.deepEqual(w.reads,[])
})
for(const settings of [{type:'text/html'},{type:'application/json'},{type:'text/x-component'},{privacy:'private'},{privacy:'no-store'},{privacy:'no-cache'},{redirected:true},{url:'https://external.example/image.png'}])test(`unsafe asset response is not cached: ${JSON.stringify(settings)}`,async()=>{
 const w=worker(settings);assert.equal(await w.get('/icons/icon-192.png'),true);assert.deepEqual(w.writes,[])
})
test('approved public icon can be cached',async()=>{const w=worker();await w.get('/icons/icon-192.png');assert.equal(w.writes.length,1)})
test('upgrade only removes this app’s old asset caches, not unrelated caches or current version',async()=>{
 const w=worker({keys:['other-app','globetrotter-v4','globetrotter-v1','globetrotter-v5','globetrotter:trips']});await w.activate()
 assert.deepEqual(w.deleted,['globetrotter-v4','globetrotter-v1'])
})

test('cache denied does not break online public asset loading',async()=>{const w=worker({storageFails:true});assert.equal(await w.get('/icons/icon-192.png'),true);assert.deepEqual(w.writes,[])})
for(const readyState of ['complete','loading'])test(`worker registration handles ${readyState} document load`,()=>{
 const calls=[],listeners=new Map(),cleanups=[]
 const sandbox={exports:{},require:()=>({useEffect:fn=>cleanups.push(fn())}),process:{env:{NODE_ENV:'production'}},document:{readyState},
 navigator:{serviceWorker:{register:(...args)=>{calls.push(args);return Promise.resolve()}}},
 window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)}}
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/pwa-register.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,sandbox)
 sandbox.exports.default()
 if(readyState==='loading'){assert.equal(calls.length,0);listeners.get('load')()}
 assert.equal(calls.length,1);assert.equal(calls[0][0],'/sw.js');assert.equal(calls[0][1].updateViaCache,'none')
 cleanups.forEach(fn=>fn());assert.equal(listeners.size,0)
})
