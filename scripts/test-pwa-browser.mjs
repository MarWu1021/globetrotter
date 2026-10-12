/** Real Chromium + production Next routes/SW; local synthetic OAuth server, never Google/Supabase. */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const {chromium}=createRequire(import.meta.url)('playwright')
const origin=process.env.TEST_URL||'http://127.0.0.1:3095'
const output=process.env.SCREENSHOT_DIR||'/tmp/globetrotter-pwa-shots';fs.mkdirSync(output,{recursive:true})
const dictionary={exports:{},require:()=>({})}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/i18n.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,dictionary)
const {translate,LOCALES}=dictionary.exports
const codes=new Map(),sessions=new Map(),exchanges=[]
let cancelNext=false
const user={id:'00000000-0000-4000-8000-000000000001',email:'pwa-fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'google'},user_metadata:{},created_at:'2026-10-12T00:00:00Z'}
const send=(r,status,data)=>{r.writeHead(status,{'Content-Type':'application/json','Cache-Control':'private, no-store'});r.end(JSON.stringify(data))}
const server=createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin',origin)
 res.setHeader('Access-Control-Allow-Headers','authorization, apikey, content-type, x-client-info, x-supabase-api-version')
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
 const url=new URL(req.url,'http://127.0.0.1:39999')
 if(url.pathname==='/auth/v1/authorize'){
  const redirect=url.searchParams.get('redirect_to')
  if(redirect!==origin+'/auth/callback'||url.searchParams.get('provider')!=='google'||url.searchParams.get('code_challenge_method')?.toLowerCase()!=='s256')return send(res,400,{error:'invalid fixture flow'})
  const next=new URL(redirect)
  if(cancelNext){next.searchParams.set('error','access_denied');cancelNext=false}
  else{const code=randomUUID();codes.set(code,url.searchParams.get('code_challenge'));next.searchParams.set('code',code)}
  res.writeHead(302,{Location:next.href,'Cache-Control':'no-store'});res.end();return
 }
 if(url.pathname==='/auth/v1/token'){
  let body='';for await(const chunk of req)body+=chunk
  const data=JSON.parse(body),challenge=codes.get(data.auth_code)
  if(!challenge||createHash('sha256').update(data.code_verifier||'').digest('base64url')!==challenge)return send(res,400,{error:'invalid_grant',error_description:'Fixture verifier mismatch'})
  codes.delete(data.auth_code);exchanges.push({pkce:true})
  const now=Math.floor(Date.now()/1000),encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
  const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,aud:'authenticated',exp:now+3600,iat:now,role:'authenticated',iss:'http://127.0.0.1:39999/auth/v1'})+'.synthetic-test-signature'
  sessions.set(token,user)
  return send(res,200,{access_token:token,refresh_token:'synthetic-refresh-'+randomUUID(),expires_in:3600,token_type:'bearer',user})
 }
 const token=(req.headers.authorization||'').replace(/^Bearer /,'')
 if(url.pathname==='/auth/v1/user')return sessions.has(token)?send(res,200,user):send(res,401,{msg:'No synthetic session'})
 if(url.pathname==='/auth/v1/logout'){sessions.delete(token);res.writeHead(204);res.end();return}
 if(['/rest/v1/trips','/rest/v1/country_records'].includes(url.pathname))return sessions.has(token)?send(res,200,[]):send(res,401,{message:'Unauthorized'})
 send(res,404,{error:'Fixture endpoint not implemented'})
})
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(39999,'127.0.0.1',resolve)})
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
let groups=0
async function fixture(context,standalone=false){
 await context.addInitScript(({standalone})=>{
  navigator.geolocation.getCurrentPosition=()=>{}
  Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2})
  if(standalone)Object.defineProperty(navigator,'standalone',{get:()=>true})
  if(!localStorage.getItem('globetrotter:v1'))localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{locale:'zh-TW',localePinned:true,view:'map',autoSpin:false,notes:{'158':'UNTOUCHED PWA FIXTURE'}}}))
  if(!localStorage.getItem('globetrotter:trips:v1'))localStorage.setItem('globetrotter:trips:v1','UNTOUCHED PWA TRIPS')
 },{standalone})
}
async function cachesSafe(page){
 const urls=await page.evaluate(async()=>{const all=[];for(const name of await caches.keys()){const c=await caches.open(name);for(const r of await c.keys())all.push(r.url)}return all})
 assert.ok(urls.length>0,'Actual worker caches public icons')
 for(const value of urls){const u=new URL(value);assert.equal(u.origin,origin);assert.equal(u.search,'');assert.ok(u.pathname.startsWith('/_next/static/')||u.pathname.startsWith('/icons/')||u.pathname==='/icon.svg',u.pathname)}
}
try{
 for(const width of [1280,390,320]){
  const ios=width<768
  const context=await browser.newContext({viewport:{width,height:width===320?740:900},locale:'zh-TW',isMobile:ios,hasTouch:ios,reducedMotion:'reduce',userAgent:ios?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1':undefined})
  await fixture(context)
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000)
  await page.goto(origin+'/login');await page.locator('[data-pwa-help]').waitFor()
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller)
  await page.evaluate(()=>navigator.serviceWorker.ready)
  const manifest=await (await page.request.get(origin+'/manifest.webmanifest')).json()
  assert.equal(manifest.name,'Globetrotter');assert.equal(manifest.display,'standalone')
  assert.equal(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'),'/icons/apple-touch-icon.png')
  const sw=await page.request.get(origin+'/sw.js');assert.match(sw.headers()['cache-control'],/no-store/)
  await page.evaluate(()=>fetch('/icons/icon-192.png'))
  await cachesSafe(page);groups++
  await page.screenshot({path:`${output}/pwa-login-${width}.png`})
  for(const locale of LOCALES){
   await page.locator('select').selectOption(locale.id)
   const help=page.locator('[data-pwa-help]');if(!await help.getAttribute('open')){if(!await help.evaluate(e=>e.open))await help.locator('summary').click()}
   const t=translate(locale.id)
   assert.ok((await help.innerText()).includes(t(ios?'pwa.ios.2':'pwa.desktop.2')))
   assert.equal(await help.getByRole('button').count(),0,'Manual instructions do not fake a native prompt')
   await help.scrollIntoViewIfNeeded();const box=await help.boundingBox()
   assert.ok(box.x>=0&&box.x+box.width<=width+.5)
   assert.equal(await help.evaluate(e=>e.scrollWidth<=e.clientWidth),true)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
   groups++
  }
  await page.screenshot({path:`${output}/pwa-help-${width}.png`})
  if(ios){
   await page.evaluate(()=>{window.fakeInstallCalls=0;const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>window.fakeInstallCalls++;e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e)})
   assert.equal(await page.locator('[data-pwa-help] button').count(),0);assert.equal(await page.evaluate(()=>window.fakeInstallCalls),0);groups++
  }
  const before=exchanges.length
  await page.getByRole('button',{name:'使用 Google 登入',exact:true}).click()
  await page.locator('.map-stage').waitFor();await page.getByText(user.email,{exact:true}).waitFor({state:'attached'})
  assert.equal(new URL(page.url()).origin,origin);assert.equal(new URL(page.url()).pathname,'/')
  assert.equal(exchanges.length,before+1,'Real local callback exchanges the correct PKCE verifier')
  const session=await page.request.get(origin+'/auth/session');assert.match(session.headers()['cache-control'],/private.*no-store/)
  await page.reload();await page.locator('.map-stage').waitFor();await page.getByText(user.email,{exact:true}).waitFor({state:'attached'});groups++
  if(width<768){await page.getByRole('button',{name:'開啟設定',exact:true}).click();await page.getByRole('dialog',{name:'設定',exact:true}).locator('[data-pwa-help] summary').click()}
  else await page.locator('.travel-sidebar [data-pwa-help] summary').click()
  await page.screenshot({path:`${output}/pwa-map-${width}.png`})
  if(width<768){
   const sheet=page.getByRole('dialog',{name:'設定',exact:true})
   await sheet.locator('[data-pwa-help] p').last().scrollIntoViewIfNeeded()
   const b=await sheet.locator('[data-pwa-help] p').last().boundingBox()
   assert.ok(b.y>=0&&b.y+b.height<=(width===320?740:900),'All install instructions are reachable by scrolling')
   await page.screenshot({path:`${output}/pwa-map-help-${width}.png`})
   await sheet.getByRole('button',{name:'登出',exact:true}).scrollIntoViewIfNeeded()
  }
  const logout=width<768?page.getByRole('dialog',{name:'設定',exact:true}).getByRole('button',{name:'登出',exact:true}):page.getByRole('button',{name:'登出',exact:true})
  await logout.click();await page.locator('[data-login-page]').waitFor()
  assert.equal(await page.locator('.map-stage').count(),0)
  await page.reload();await page.locator('[data-login-page]').waitFor();groups++
  cancelNext=true;await page.getByRole('button',{name:'使用 Google 登入',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'登入失敗或已取消'}).waitFor()
  assert.equal(exchanges.length,before+1);await cachesSafe(page)
  assert.equal(await page.evaluate(()=>localStorage.getItem('globetrotter:trips:v1')),'UNTOUCHED PWA TRIPS')
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('globetrotter:v1')).state.notes['158']),'UNTOUCHED PWA FIXTURE')
  assert.deepEqual(errors,[]);groups++
  console.log(`PASS ${width}px: five languages, real SW/cache, local PKCE callback, session reload/logout/cancel, map and storage isolation`)
  await context.close()
 }
 // Synthetic Chromium install event verifies lifecycle without pretending to install on an actual phone.
 const android=await browser.newContext({viewport:{width:390,height:844},locale:'zh-TW',userAgent:'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36'})
 await fixture(android);const p=await android.newPage();await p.goto(origin+'/login');await p.locator('[data-pwa-help] summary').click()
 await p.evaluate(()=>{window.calls=0;window.resolveInstall=null;const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{window.calls++};e.userChoice=new Promise(resolve=>window.resolveInstall=resolve);window.dispatchEvent(e)})
 assert.equal(await p.evaluate(()=>window.calls),0)
 await p.getByRole('button',{name:'安裝 Globetrotter',exact:true}).click()
 assert.equal(await p.getByRole('button',{name:'等待你確認安裝…',exact:true}).isDisabled(),true)
 await p.evaluate(()=>window.resolveInstall({outcome:'accepted'}));await p.getByRole('button',{name:'等待你確認安裝…',exact:true}).waitFor({state:'hidden'})
 assert.equal(await p.locator('[data-pwa-installed]').count(),0,'Accepted is not yet installed')
 await p.evaluate(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{throw new Error('Synthetic install denial')};e.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(e)})
 await p.getByRole('button',{name:'安裝 Globetrotter',exact:true}).click();await p.getByRole('status').filter({hasText:'安裝尚未完成'}).waitFor();assert.equal(await p.locator('[data-pwa-installed]').count(),0);groups++
 await p.evaluate(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{};e.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(e)})
 await p.getByRole('button',{name:'安裝 Globetrotter',exact:true}).click();await p.locator('[data-pwa-help] button').waitFor({state:'hidden'});assert.equal(await p.locator('[data-pwa-installed]').count(),0);groups++
 await p.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));await p.locator('[data-pwa-installed]').waitFor();assert.equal(await p.locator('[data-pwa-help]').count(),0);groups++
 // A collapsed help panel must not trap keyboard focus on its hidden native-install button.
 await p.reload();await p.getByRole('button',{name:'使用 Google 登入',exact:true}).click();await p.locator('.map-stage').waitFor()
 await p.getByRole('button',{name:'開啟設定',exact:true}).click()
 const settings=p.getByRole('dialog',{name:'設定',exact:true})
 await p.evaluate(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{};e.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(e)})
 await settings.getByRole('button',{name:'關閉',exact:true}).focus();await p.keyboard.press('Shift+Tab')
 assert.equal(await settings.locator('[data-pwa-help] summary').evaluate(e=>e===document.activeElement),true)
 await settings.locator('[data-pwa-help] summary').click();assert.equal(await settings.getByRole('button',{name:'安裝 Globetrotter',exact:true}).isVisible(),true);groups++
 await android.close()
 const installed=await browser.newContext({viewport:{width:390,height:844},locale:'zh-TW',isMobile:true,hasTouch:true,userAgent:'iPhone Safari',reducedMotion:'reduce'})
 await fixture(installed,true);const s=await installed.newPage();await s.goto(origin+'/login')
 await s.locator('[data-pwa-installed]').waitFor();assert.equal(await s.locator('[data-pwa-help]').count(),0)
 await s.getByRole('button',{name:'使用 Google 登入',exact:true}).click();await s.locator('.map-stage').waitFor();await s.reload();await s.locator('.map-stage').waitFor()
 await s.getByRole('button',{name:'開啟設定',exact:true}).click();await s.getByRole('dialog',{name:'設定',exact:true}).getByRole('button',{name:'登出',exact:true}).click()
 await s.locator('[data-login-page]').waitFor();await s.reload();await s.locator('[data-login-page]').waitFor();groups++
 await installed.close()
 const isolated=await browser.newContext({locale:'zh-TW'});await fixture(isolated,true)
 const isolatedPage=await isolated.newPage();await isolatedPage.goto(origin+'/auth/callback?code=synthetic-missing-verifier')
 await isolatedPage.getByRole('alert').filter({hasText:'登入失敗或已取消'}).waitFor()
 assert.equal(await isolatedPage.locator('.map-stage').count(),0,'Missing verifier in a separate browser container fails closed');groups++
 await isolated.close()
 console.log(`PASS ${groups} PWA browser groups; local synthetic OAuth/standalone and Chromium, not actual iOS/Google/Supabase.`)
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
