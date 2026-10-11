/** Actual browser/WebGL; synthetic auth and cloud acknowledgements, no live services. */
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import {attachRenderer,savedCountryFrame} from './browser-globe-render.mjs'
const {chromium}=createRequire(import.meta.url)('playwright')
const origin=process.env.TEST_URL||'http://127.0.0.1:3060'
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
let groups=0,currentPage=null
try{for(const width of [1280,390,320]){
 const context=await browser.newContext({viewport:{width,height:850},locale:'zh-TW',isMobile:width<768,hasTouch:width<768,deviceScaleFactor:width<768?2:1,serviceWorkers:'block'})
 const page=await context.newPage(),errors=[],rows=new Map();let user=null,fail=false,hold=false,release,notifyHeld
 currentPage=page;page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message))
 await context.addInitScript(()=>{
  Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});Object.defineProperty(navigator,'deviceMemory',{get:()=>8})
  navigator.geolocation.getCurrentPosition=()=>{}
  localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{locale:'zh-TW',localePinned:true,statuses:{'158':'blocked'},notes:{'158':'DO NOT UPLOAD'},autoSpin:false}}))
  localStorage.setItem('globetrotter:trips:v1','OLD TEST DATA')
 })
 await context.route('**/auth/session',r=>r.fulfill({json:{user}}))
 await context.route('**/api/account**',async r=>{
  const req=r.request(),reply=result=>r.fulfill({json:{userId:user?.id,result},headers:{'Cache-Control':'private, no-store'}})
  if(req.method()==='GET')return reply({ok:true,value:new URL(req.url()).searchParams.get('kind')==='trips'?[...rows.values()]:[]})
  if(hold){notifyHeld();await new Promise(resolve=>release=resolve)}
  if(fail){fail=false;return reply({ok:false,error:'conflict'})}
  const {command:c,operation}=req.postDataJSON(),old=rows.get(c.id)
  if(operation==='delete-trip'){rows.delete(c.id);return reply({ok:true,value:null})}
  if((old?.revision??null)!==c.expectedRevision)return reply({ok:false,error:'conflict'})
  const now=new Date().toISOString(),record={draft:c.draft,revision:(old?.revision??0)+1,createdAt:old?.createdAt??now,updatedAt:now}
  rows.set(c.id,record);return reply({ok:true,value:record})
 })
 await page.goto(origin+'/login',{waitUntil:'domcontentloaded'});await page.locator('[data-login-page]').waitFor()
 await page.locator('[data-login-island][data-island-motion="animated"]').waitFor()
 const loginButton=page.getByRole('button',{name:'使用 Google 登入',exact:true}),box=await loginButton.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width)
 assert.equal(await page.locator('canvas').count(),0,'Illustrated login has no WebGL runtime')
 assert.equal(await loginButton.isEnabled(),true)
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-island-motion="static"]').waitFor()
 assert.equal(await page.locator('[data-island-plane]').evaluate(el=>getComputedStyle(el).animationName),'none')
 await page.screenshot({path:`/tmp/globetrotter-upgrade-login-${width}.png`});groups++
 await page.emulateMedia({reducedMotion:'no-preference'})
 user={id:'00000000-0000-0000-0000-000000000001',email:'a@example.invalid'}
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('[data-trip-statistics]').waitFor({state:'attached'})
 await page.getByRole('button',{name:'地球',exact:true}).click();await attachRenderer(page)
 await page.evaluate(()=>{const r=window.checkedGlobe.renderer(),render=r.render.bind(r);window.fadeHistory=[];r.render=(scene,camera)=>{render(scene,camera);const c=r.checkedLast?.colors?.['158'];if(c&&window.fadeHistory.at(-1)!==c)window.fadeHistory.push(c)}})
 const editor=page.getByRole('dialog',{name:'旅行編輯',exact:true})
 async function newTrip(){if(width<768)await page.getByRole('button',{name:'新增一趟旅行',exact:true}).click();else await page.getByRole('button',{name:'建立旅行',exact:true}).click();await editor.waitFor()}
 async function add(code){await editor.getByRole('searchbox').fill(code);await editor.locator('li').filter({has:page.getByRole('button',{name:'加入路線',exact:true})}).filter({hasText:code}).first().getByRole('button',{name:'加入路線',exact:true}).click()}
 await newTrip();await add('TPE');await add('DXB');await add('ATH');await editor.getByLabel('旅行名稱（選填）',{exact:true}).fill('旅行動畫');await editor.getByLabel('國家停留性質 DXB',{exact:true}).selectOption('transit')
 assert.equal(await page.locator('[data-mobile-navigation]').count(),0)
 const save=editor.getByRole('button',{name:'儲存旅行',exact:true}),saveBox=await save.boundingBox();assert.ok(saveBox.y+saveBox.height<=850)
 fail=true;await save.click();await editor.getByRole('alert').filter({hasText:'其他裝置已修改'}).waitFor();assert.equal(rows.size,0);assert.equal(await page.locator('[data-journey-notice]').count(),0);groups++
 hold=true;const held=new Promise(resolve=>notifyHeld=resolve);await save.click();await held;await page.waitForFunction(()=>document.querySelector('dialog[open] button:disabled'))
 assert.equal(await page.locator('[data-journey-notice]').count(),0);assert.equal(JSON.parse(await page.locator('[data-trip-statistics]').getAttribute('data-trip-statistics')).trips,0)
 hold=false;release()
 await editor.waitFor({state:'hidden'});await page.locator('[data-skip-journey]').waitFor();await page.locator('[data-globe-points]').waitFor()
 await page.waitForFunction(()=>Number(document.querySelector('[data-journey-leg]')?.dataset.journeyLeg)===0)
 const language=await page.locator('.map-stage').getByRole('button',{name:'語言',exact:true}).boundingBox();assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('button')?.getAttribute('aria-label')==='語言',{x:language.x+language.width/2,y:language.y+language.height/2}),true)
 assert.equal(rows.size,1);assert.deepEqual(JSON.parse(await page.locator('[data-trip-statistics]').getAttribute('data-trip-statistics')),{countries:3,trips:1,flights:2})
 await page.waitForFunction(()=>Number(document.querySelector('[data-journey-leg]')?.dataset.journeyLeg)===1)
 const skip=await page.locator('[data-skip-journey]').boundingBox();const spot={x:skip.x+skip.width/2,y:skip.y+skip.height/2};assert.equal(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('[data-skip-journey]'),spot),true);await page.mouse.click(spot.x,spot.y);await page.waitForFunction(()=>document.querySelector('[data-journey-leg]')?.dataset.journeyLeg==='-1')
 assert.equal(await page.evaluate(()=>window.fadeHistory.some(c=>!['#d8e0e3','#6f9e91'].includes(c.toLowerCase()))),true,'An intermediate Taiwan cap colour was actually drawn')
 const colors=JSON.parse(await page.locator('[data-globe-points]').getAttribute('data-saved-colors'));assert.deepEqual(colors,{'158':'#6F9E91','784':'#8BB6CE','300':'#6F9E91'})
 await attachRenderer(page);await savedCountryFrame(page,[24.2,54.4]);await page.screenshot({path:`/tmp/globetrotter-upgrade-saved-${width}.png`});groups++
 if(width<768){
  const nav=page.locator('[data-mobile-navigation]');assert.equal(await nav.getByRole('button').count(),5)
  for(const b of await nav.getByRole('button').all()){const rect=await b.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width&&rect.height>=44)}
  await page.getByRole('button',{name:'查看旅行統計',exact:true}).click();await page.getByRole('dialog',{name:'統計',exact:true}).waitFor();assert.equal(await page.locator('[data-mobile-statistics]').getByText('3',{exact:true}).count(),1);await page.getByRole('dialog',{name:'統計',exact:true}).getByRole('button',{name:'關閉',exact:true}).click()
  await page.getByRole('button',{name:'開啟設定',exact:true}).click();const settings=page.getByRole('dialog',{name:'設定',exact:true});await settings.waitFor();assert.equal(await settings.getByRole('combobox').count(),1);await settings.getByRole('button',{name:'關閉',exact:true}).click()
  await page.getByRole('button',{name:'查看旅行紀錄',exact:true}).click()
 }else await page.getByRole('button',{name:'我的旅行紀錄',exact:true}).click()
 const records=page.getByRole('dialog',{name:'我的旅行紀錄',exact:true});await records.getByRole('button',{name:'編輯',exact:true}).click();await editor.getByLabel('旅行名稱（選填）',{exact:true}).fill('修改旅行動畫');await save.click();await editor.getByText('已儲存至帳號',{exact:true}).first().waitFor();assert.equal(await page.locator('[data-skip-journey]').count(),0);await editor.getByRole('button',{name:'關閉編輯器',exact:true}).click();groups++
 await attachRenderer(page);await savedCountryFrame(page,[23.7,121]);await page.evaluate(()=>window.checkedGlobe.resumeAnimation())
 const tap=await page.evaluate(()=>window.checkedGlobe.getScreenCoords(23.7,121)),canvasBox=await page.locator('[data-globe-points] canvas').boundingBox()
 await page.mouse.click(canvasBox.x+tap.x,canvasBox.y+tap.y);await page.locator('[data-country-panel]').waitFor();await page.locator('[data-country-trips]').getByText('修改旅行動畫',{exact:true}).waitFor()
 await page.waitForFunction(()=>{const p=window.checkedGlobe.pointOfView();return Math.abs(p.lat-23.7526268106632)<2&&Math.abs(p.lng-120.9)<2})
 await page.locator('[data-country-panel]').getByRole('button',{name:'關閉',exact:true}).click();groups++;console.log('STEP focus',width,groups)
 await page.getByRole('button',{name:'平面地圖',exact:true}).click();await page.waitForFunction(()=>getComputedStyle(document.querySelector('path[data-country-id="784"]')).fill==='rgb(139, 182, 206)')
 const taiwan=page.locator('path[data-country-id="158"]').first();await taiwan.dispatchEvent('click');await page.locator('[data-country-panel]').waitFor();await page.locator('[data-country-trips]').getByText('修改旅行動畫',{exact:true}).waitFor();assert.equal(await taiwan.getAttribute('data-country-selected'),'true')
 assert.equal(JSON.parse(await page.locator('[data-trip-statistics]').getAttribute('data-trip-statistics')).trips,1)
 await page.keyboard.press('Escape');await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-trip-statistics]')?.dataset.tripStatistics||'{}').trips===1)
 assert.equal(await page.locator('[data-skip-journey]').count(),0);groups++
 // Low motion saves still commit data and report success, without spinning.
 await page.emulateMedia({reducedMotion:'reduce'});await newTrip();await add('TPE');await add('KCZ');await save.click();await editor.waitFor({state:'hidden'});await page.locator('[data-journey-notice]').waitFor();assert.equal(await page.locator('[data-skip-journey]').count(),0);assert.equal(rows.size,2);groups++
 if(width<768)await page.getByRole('button',{name:'開啟設定',exact:true}).click()
 user=null;await page.getByRole('button',{name:'登出',exact:true}).click();await page.waitForURL('**/login');await page.locator('[data-login-page]').waitFor()
 assert.equal(await page.locator('[data-journey-leg]').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('globetrotter:trips:v1')),'OLD TEST DATA');assert.deepEqual(errors,[]);groups++
 console.log(`PASS ${width}px: island/reduced-motion, conflict/pending guard, ordered flight/skip, mobile navigation/edit, 2D selection/reload, reduced save, logout`)
 await context.close()
}
console.log(`PASS ${groups} upgrade browser groups; synthetic Supabase, real UI/WebGL`)
}catch(error){if(currentPage){console.log('FAILED PAGE',currentPage.url(),await currentPage.locator('body').innerText());await currentPage.screenshot({path:'/tmp/ui-upgrade-failure.png'}).catch(()=>{})}throw error}finally{await browser.close()}
