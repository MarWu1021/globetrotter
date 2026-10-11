/** Isolated Chromium + synthetic verified identities. No real Google/Supabase. */
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const {chromium}=createRequire(import.meta.url)('playwright')
const origin=process.env.TEST_URL||'http://127.0.0.1:3050'
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
let groups=0
try{
for(const width of [1280,390,320]){
 const context=await browser.newContext({viewport:{width,height:850},locale:'zh-TW',isMobile:width<768,hasTouch:width<768,deviceScaleFactor:width<768?2:1,serviceWorkers:'block'})
 const page=await context.newPage(),errors=[];let user=null,wait=true,failed=false;const waiting=[]
 page.on('pageerror',e=>errors.push(e.message))
 await context.addInitScript(()=>{
  localStorage.setItem('globetrotter:trips:v1','UNTOUCHED_OLD_TEST_DATA')
  localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{locale:'zh-TW',localePinned:true,autoSpin:false,statuses:{'826-eng':'blocked'},notes:{'826-eng':'Old note'}}}))
  const get=Storage.prototype.getItem;window.oldTripReads=0;Storage.prototype.getItem=function(k){if(k==='globetrotter:trips:v1')window.oldTripReads++;return get.call(this,k)}
 })
 await context.route('**/auth/session',async r=>{if(wait)await new Promise(resolve=>waiting.push(resolve));await r.fulfill({status:failed?503:200,json:{user},headers:{'Cache-Control':'private, no-store'}})})
 let calls=0
 await context.route('**/api/account**',r=>{calls++;return r.fulfill({json:{userId:user?.id,result:{ok:true,value:[]}}})})
 await page.goto(origin,{waitUntil:'domcontentloaded'})
 await page.locator('[data-auth-loading]').waitFor()
 assert.equal(await page.locator('.map-stage').count(),0);assert.equal(calls,0)
 wait=false;waiting.splice(0).forEach(r=>r());await page.waitForURL('**/login');await page.locator('[data-login-page]').waitFor()
 assert.equal(await page.locator('.map-stage').count(),0);assert.equal(calls,0);groups++
 const strings={en:'Keep your journeys together.',fr:'Retrouvez tous vos voyages.',es:'Todos tus viajes en un lugar.',de:'Alle deine Reisen an einem Ort.','zh-TW':'把走過的世界，留在一起。'}
 for(const [locale,title] of Object.entries(strings)){
  await page.locator('select').selectOption(locale);await page.getByRole('heading',{name:title,exact:true}).waitFor()
  const button=page.locator('[data-login-page] button');const box=await button.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.height>=44)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 }
 await page.screenshot({path:`/tmp/globetrotter-login-${width}.png`});groups++
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:strings['zh-TW'],exact:true}).waitFor();groups++
 // Browser OAuth request really generates PKCE; provider outcome remains a double.
 let authorization
 await context.route('http://127.0.0.1:39999/auth/v1/authorize**',r=>{
  authorization=new URL(r.request().url());return r.fulfill({contentType:'text/html',body:'Mock Google provider'})
 })
 await page.getByRole('button',{name:'使用 Google 登入',exact:true}).click();await page.waitForURL('http://127.0.0.1:39999/**')
 assert.equal(authorization.searchParams.get('provider'),'google');assert.equal(authorization.searchParams.get('redirect_to'),origin+'/auth/callback');assert.ok(authorization.searchParams.get('code_challenge'));assert.equal(authorization.searchParams.get('code_challenge_method').toLowerCase(),'s256');groups++
 // Actual server callback cancellation goes only to this site's /login, never Production.
 await page.goto(origin+'/auth/callback?error=access_denied&next=https://production.invalid',{waitUntil:'domcontentloaded'})
 await page.waitForURL('**/login**');await page.getByRole('alert').filter({hasText:'登入失敗或已取消'}).waitFor();assert.equal(await page.locator('.map-stage').count(),0);groups++
 user={id:'synthetic-account-a',email:'a@example.invalid'}
 await page.goto(origin+'/login',{waitUntil:'domcontentloaded'});await page.waitForURL(origin+'/');await page.locator('.map-stage').waitFor();groups++
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('.map-stage').waitFor();assert.equal(new URL(page.url()).pathname,'/');groups++
 // Keep an earlier same-site home entry to exercise browser Back after logout.
 await page.goto(origin+'/?history=fixture',{waitUntil:'domcontentloaded'});await page.locator('.map-stage').waitFor()
 if(width<768)await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click()
 await page.getByRole('button',{name:'建立旅行',exact:true}).click();await page.getByLabel('旅行名稱（選填）',{exact:true}).fill('PRIVATE DRAFT')
 await page.getByRole('button',{name:'關閉編輯器',exact:true}).click()
 user=null;await page.getByRole('button',{name:'登出',exact:true}).click();await page.waitForURL('**/login');await page.locator('[data-login-page]').waitFor()
 assert.equal(await page.locator('.map-stage').count(),0);assert.equal(await page.getByText('a@example.invalid',{exact:true}).count(),0);assert.equal(await page.getByRole('dialog',{name:'旅行編輯',exact:true}).count(),0);groups++
 wait=true;await page.goBack({waitUntil:'domcontentloaded'});await page.locator('[data-auth-loading]').waitFor();assert.equal(await page.locator('.map-stage').count(),0)
 wait=false;waiting.splice(0).forEach(r=>r());await page.locator('[data-login-page]').waitFor();assert.equal(await page.locator('.map-stage').count(),0);groups++
 failed=true;await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('alert').filter({hasText:'登入失敗或已取消'}).waitFor();assert.equal(await page.locator('.map-stage').count(),0);groups++
 assert.equal(await page.evaluate(()=>window.oldTripReads),0)
 assert.equal(await page.evaluate(()=>localStorage.getItem('globetrotter:trips:v1')),'UNTOUCHED_OLD_TEST_DATA')
 const legacy=await page.evaluate(()=>JSON.parse(localStorage.getItem('globetrotter:v1')).state);assert.deepEqual(legacy.statuses,{'826-eng':'blocked'});assert.equal(legacy.notes['826-eng'],'Old note');assert.deepEqual(errors,[]);groups++
 console.log(`PASS ${width}px: 11 login groups, five languages, loading gate, PKCE request, cancelled callback, session restore, logout/back, no legacy uploads`)
 await context.close()
}
console.log(`PASS ${groups} login browser groups (mocked identities, actual browser PKCE request and cancelled server callback)`)
}finally{await browser.close()}
