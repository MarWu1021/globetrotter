import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
function worker() {
 const handlers={},writes=[],waits=[];let reply=null,requests=0
 const response={ok:true,headers:new Headers({'Content-Type':'text/html'}),clone(){return this}}
 const caches={open:async()=>({put:async(key)=>writes.push(key),addAll:async()=>{}}),match:async()=>null}
 const context={URL,console,caches,self:{location:{origin:'https://preview.example'},addEventListener:(n,f)=>handlers[n]=f},fetch:async()=>{requests++;return response}}
 vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),context)
 return {writes,response,get requests(){return requests},async dispatch(path,mode='navigate',headers={},method='GET'){
  handlers.fetch({request:{url:new URL(path,'https://preview.example').href,mode,method,headers:new Headers(headers)},respondWith:p=>reply=p,waitUntil:p=>waits.push(p)})
  if(reply)await reply;await Promise.all(waits);return !!reply
 }}
}
for(const path of ['/auth','/auth/callback?code=fake-test-code','/auth/logout','/api/trips','/api/countries','/account','/?_rsc=1','/?code=fake-test-code'])test(`private path ${path} bypasses SW response/cache`,async()=>{
 const w=worker();assert.equal(await w.dispatch(path),false);assert.equal(w.requests,0);assert.deepEqual(w.writes,[])
})
test('RSC header bypasses even root',async()=>{const w=worker();assert.equal(await w.dispatch('/','navigate',{RSC:'1'}),false)})
for(const directive of ['private, no-store','no-cache','no-store'])test(`root ${directive} response is not cached`,async()=>{
 const w=worker();w.response.headers.set('Cache-Control',directive);assert.equal(await w.dispatch('/'),true);assert.deepEqual(w.writes,[])
})
test('anonymous successful root shell can still support offline cache',async()=>{const w=worker();await w.dispatch('/');assert.deepEqual(w.writes,['/'])})
test('non-HTML and error root responses are not cached',async()=>{
 const a=worker();a.response.ok=false;await a.dispatch('/');assert.deepEqual(a.writes,[])
 const b=worker();b.response.headers.set('Content-Type','application/json');await b.dispatch('/');assert.deepEqual(b.writes,[])
})
test('public static asset can be cached; private-marked asset cannot',async()=>{
 const a=worker();assert.equal(await a.dispatch('/_next/static/test.js','cors'),true);assert.equal(a.writes.length,1)
 const b=worker();b.response.headers.set('Cache-Control','private');await b.dispatch('/_next/static/test.js','cors');assert.equal(b.writes.length,0)
})
test('non-asset GET and foreign origins are left untouched',async()=>{
 const a=worker();assert.equal(await a.dispatch('/personal-data','cors'),false)
 const b=worker();assert.equal(await b.dispatch('https://other.example/file','cors'),false)
})
test('writes are never intercepted by SW',async()=>{const w=worker();assert.equal(await w.dispatch('/','navigate',{},'POST'),false)})
