import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
const requireNative=createRequire(import.meta.url),cache=new Map()
function load(file){
 const absolute=path.resolve(file);if(cache.has(absolute))return cache.get(absolute)
 if(absolute.endsWith('.json'))return JSON.parse(fs.readFileSync(absolute,'utf8'))
 const mod={exports:{}};cache.set(absolute,mod.exports)
 const src=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 function req(name){if(name.startsWith('.')||name.startsWith('@/')){const base=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(absolute),name);return load(base+(path.extname(name)?'':'.ts'))}return requireNative(name)}
 new vm.Script(`(function(exports,require){${src}\n})`).runInThisContext()(mod.exports,req)
 return mod.exports
}
const {exchangeCallback,verifiedState,callbackDestination,requestSiteURL,sessionUnavailable}=load('src/lib/auth/flow.ts')
const {TripRepository}=load('src/lib/trip-storage/repository.ts')
test('successful exchange returns exact current preview origin only',async()=>{
 const url=await exchangeCallback('https://preview.example/auth/callback?code=fixture&next=https://production.example',async code=>{assert.equal(code,'fixture');return true})
 assert.equal(url.href,'https://preview.example/')
})
test('cancelled login never exchanges or echoes provider error details',async()=>{
 let calls=0;const url=await exchangeCallback('https://preview.example/auth/callback?error=access_denied&error_description=sensitive-fixture',async()=>{calls++;return true})
 assert.equal(calls,0);assert.equal(url.href,'https://preview.example/?auth_error=failed')
})
test('missing authorization code fails without exchange',async()=>{
 await exchangeCallback('https://preview.example/auth/callback',async()=>assert.fail('must not exchange'))
})
test('failed exchange produces generic same origin error',async()=>{
 const url=await exchangeCallback('https://preview.example/auth/callback?code=fixture',async()=>false)
 assert.equal(url.href,'https://preview.example/?auth_error=failed')
})
test('network failure does not report success',async()=>{
 assert.equal((await exchangeCallback('https://preview.example/auth/callback?code=fixture',async()=>{throw Error('network')})).search,'?auth_error=failed')
})
test('session restoration uses verified identity',()=>{assert.equal(verifiedState({id:'account-a'}).phase,'ready')})
test('expired session clears identity',()=>{assert.deepEqual(verifiedState(null),{phase:'signed-out',user:null})})
test('verification error clears even supplied stale identity',()=>{assert.equal(verifiedState({id:'account-a'},true).user,null)})
test('switching verified accounts replaces old identity',()=>{assert.equal(verifiedState({id:'account-b'}).user.id,'account-b')})
test('callback destination never respects arbitrary return paths',()=>{assert.equal(callbackDestination('https://preview.example/auth/callback?next=//evil.example',true).pathname,'/')})
test('auth mode does not read subscribe/reload browser test storage',()=>{
 let reads=0;const r=new TripRepository(()=>{reads++;throw Error('private old storage must not be touched')},false)
 const off=r.subscribe(()=>{});r.reload();off();assert.equal(reads,0);assert.deepEqual(r.getSnapshot().trips,[])
})
test('auth mode cannot accidentally save/delete to browser test storage',()=>{
 let reads=0;const r=new TripRepository(()=>{reads++;throw Error('must not access')},false)
 r.reload();assert.equal(r.save({id:'fixture'},null).ok,false);assert.equal(r.remove('fixture','token').ok,false);assert.equal(reads,0)
})
test('server session endpoint verifies getUser and returns only identity',()=>{
 const code=fs.readFileSync('src/app/auth/session/route.ts','utf8')
 assert.match(fs.readFileSync('src/lib/auth/client.ts','utf8'),/cache:"no-store"/);
 assert.match(code,/auth\.getUser\(/);assert.match(code,/private, no-store/);assert.match(code,/id:user.id,email:user.email/);assert.doesNotMatch(code,/getSession\(|console\./)
})
test('Next 16 proxy propagates refresh cookies on request and response',()=>{
 const code=fs.readFileSync('src/proxy.ts','utf8');assert.match(code,/request.cookies.set/);assert.match(code,/response.cookies.set/);assert.match(code,/auth.getUser/);assert.match(code,/private, no-store/)
})
test('Google flow uses same origin callback, clears editor on logout and has stale response guard',()=>{
 const code=fs.readFileSync('src/components/auth-provider.tsx','utf8')
 assert.match(code,/addEventListener\('pageshow'/);assert.match(code,/visibilitychange/);
 assert.match(code,/new URL\('\/auth\/callback',window.location.origin\)/);assert.match(code,/ticket===epoch.current/);assert.match(code,/phase:'signing-out',user:null/);assert.match(code,/scope:'local'/)
 assert.match(fs.readFileSync('src/components/travel-workspace.tsx','utf8'),/TripDraftProvider key={generation}/)
})
test('Service Worker upgrade does not precache private root HTML',()=>{
 const code=fs.readFileSync('public/sw.js','utf8');assert.match(code,/globetrotter-v3/);assert.doesNotMatch(code,/const SHELL = \["\/"/)
})

test('callback retains actual website host when Next normalizes an internal URL',()=>{
 assert.equal(callbackDestination(requestSiteURL('https://localhost/auth/callback?code=fixture','preview.example'),true).href,'https://preview.example/')
})
test('invalid host injection cannot become callback target',()=>{
 assert.equal(callbackDestination(requestSiteURL('https://preview.example/auth/callback','evil.example/@production.example'),true).href,'https://preview.example/')
})

test('network/service verification failures cannot masquerade as a clean signed-out response',()=>{
 assert.equal(sessionUnavailable({name:'AuthRetryableFetchError',status:503}),true)
 assert.equal(sessionUnavailable({name:'AuthRetryableFetchError'}),true)
 assert.equal(sessionUnavailable({name:'AuthSessionMissingError'}),false)
 assert.equal(sessionUnavailable({status:401}),false)
 assert.equal(sessionUnavailable(null),false)
})
