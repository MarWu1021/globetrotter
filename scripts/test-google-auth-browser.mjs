/* Fake identities and an isolated Chromium context; no real OAuth or account data. */
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const {chromium}=createRequire(import.meta.url)('playwright')
const url=process.env.TEST_URL||'http://127.0.0.1:3010'
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
let passed=0,currentPage=null
try {
for(const width of (process.env.TEST_WIDTH?[Number(process.env.TEST_WIDTH)]:[1280,390,320])){
 const context=await browser.newContext({viewport:{width,height:850},locale:'zh-TW',serviceWorkers:'block'})
 const page=await context.newPage(),errors=[]
 currentPage=page
 let user=null,failed=false
 page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>{
  const key='globetrotter:trips:v1'
  localStorage.setItem(key,'OLD_TEST_TRIPS_SENTINEL')
  localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{locale:'zh-TW',localePinned:true,autoSpin:false}}))
  const original=Storage.prototype.getItem
  window.oldTripReads=0
  Storage.prototype.getItem=function(k){if(k===key)window.oldTripReads++;return original.call(this,k)}
 })
 await page.route('**/auth/session',route=>route.fulfill({status:failed?503:200,json:{user},headers:{'Cache-Control':'private, no-store'}}))
 await page.goto(url,{waitUntil:'domcontentloaded'})
 async function menu(){if(width<768 && !await page.getByRole('button',{name:'使用 Google 登入',exact:true}).isVisible() && !await page.getByRole('button',{name:'登出',exact:true}).isVisible())await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click()}
 await menu();await page.getByRole('button',{name:'使用 Google 登入',exact:true,includeHidden:true}).waitFor({state:'attached'});await menu();passed++
 assert.equal(await page.evaluate(()=>window.oldTripReads),0);passed++
 user={id:'test-account-a',email:'a@example.invalid'}
 await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')))
 await page.getByText('a@example.invalid',{exact:true}).waitFor({state:'attached'});await menu();passed++
 await page.reload({waitUntil:'domcontentloaded'});await menu()
 await page.getByText('a@example.invalid',{exact:true}).waitFor({state:'attached'});await menu();passed++
 await page.getByRole('button',{name:'建立旅行',exact:true}).click()
 await page.getByLabel('旅行名稱（選填）',{exact:true}).fill('Private draft A')
 user={id:'test-account-b',email:'b@example.invalid'}
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await page.getByText('b@example.invalid',{exact:true}).waitFor({state:'attached'});await menu()
 assert.equal(await page.getByRole('dialog',{name:'旅行編輯',exact:true}).count(),0)
 await page.getByRole('button',{name:'建立旅行',exact:true}).click()
 assert.equal(await page.getByLabel('旅行名稱（選填）',{exact:true}).inputValue(),'');passed++
 await page.keyboard.press('Escape')
 await menu()
 const logout=page.getByRole('button',{name:'登出',exact:true})
 await logout.waitFor()
 user=null
 await logout.evaluate(button=>button.click())
 await page.getByRole('button',{name:'使用 Google 登入',exact:true,includeHidden:true}).waitFor({state:'attached'});await menu()
 assert.equal(await page.getByText('b@example.invalid',{exact:true}).count(),0);passed++
 await page.goto(url+'/?auth_error=failed',{waitUntil:'domcontentloaded'});await menu()
 await page.getByRole('alert',{includeHidden:true}).filter({hasText:'登入失敗或已取消'}).waitFor({state:'attached'});await menu();passed++
 user={id:'test-account-a',email:'a@example.invalid'}
 await page.goto(url,{waitUntil:'domcontentloaded'});await menu()
 await page.getByText('a@example.invalid',{exact:true}).waitFor({state:'attached'});await menu()
 failed=true
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await page.getByRole('alert',{includeHidden:true}).filter({hasText:'登入失敗或已取消'}).waitFor({state:'attached'});await menu()
 assert.equal(await page.getByText('a@example.invalid',{exact:true}).count(),0);passed++
 assert.equal(await page.evaluate(()=>window.oldTripReads),0)
 assert.equal(await page.evaluate(()=>Storage.prototype.getItem.call(localStorage,'globetrotter:trips:v1')),'OLD_TEST_TRIPS_SENTINEL')
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true)
 assert.deepEqual(errors,[]);passed++
 console.log(`PASS ${width}px: guest, verified login, reload, account switch, editor clearing, logout, cancellation, failure, storage isolation`)
 let authorization=null
 await page.route('http://127.0.0.1:39999/auth/v1/authorize**',route=>{
   authorization=new URL(route.request().url())
   return route.fulfill({contentType:'text/html',body:'<p>Mock OAuth provider</p>'})
 })
 await page.getByRole('button',{name:'使用 Google 登入',exact:true}).click()
 await page.waitForURL('http://127.0.0.1:39999/**')
 assert.equal(authorization.searchParams.get('provider'),'google')
 assert.equal(authorization.searchParams.get('redirect_to'),url+'/auth/callback')
 assert.ok(authorization.searchParams.get('code_challenge'))
 assert.equal(authorization.searchParams.get('code_challenge_method').toLowerCase(),'s256')
 passed++
 await context.close()
}
console.log(`PASS ${passed} browser assertions (mocked identity endpoint, not live Google OAuth)`)
} catch(error) { if(currentPage){await currentPage.screenshot({path:'/tmp/d2-auth-failure.png'}).catch(()=>{});fs.writeFileSync('/tmp/d2-auth-failure.html',await currentPage.content().catch(()=>''))}throw error } finally {await browser.close()}
