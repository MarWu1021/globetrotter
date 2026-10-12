/** Actual UI/SVG with isolated account endpoint doubles. No live Google or Supabase writes. */
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import {geoDistance} from 'd3-geo'
const native=createRequire(import.meta.url),{chromium}=native('playwright'),cache=new Map()
function load(file){const p=path.resolve(file);if(cache.has(p))return cache.get(p)
 if(p.endsWith('.json')){const o=JSON.parse(fs.readFileSync(p,'utf8'));cache.set(p,o);return o}
 const exports={};cache.set(p,exports)
 const code=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 new vm.Script(`(function(exports,require){${code}\n})`).runInThisContext()(exports,n=>{if(!n.startsWith('.')&&!n.startsWith('@/'))return native(n);const f=n.startsWith('@/')?path.resolve('src',n.slice(2)):path.resolve(path.dirname(p),n);return load(path.extname(f)?f:f+'.ts')});return exports}
const catalog=load('src/lib/airport-data/catalog.ts').AIRPORT_CATALOG
const {createTripDraft,addDraftStop}=load('src/lib/trip-draft/core.ts')
const airport=code=>catalog.find(a=>a.iata===code),now='2026-10-12T00:00:00.000Z'
const initial=codes=>({draft:codes.reduce((d,c,i)=>addDraftStop(d,airport(c),'fixture:s'+i),{...createTripDraft('mileage-fixture'),title:'瀏覽器測試 · 杜拜轉機',status:'completed'}),createdAt:now,updatedAt:now,revision:1})
const sum=codes=>codes.slice(1).reduce((n,c,i)=>n+6371*geoDistance([airport(codes[i]).longitude,airport(codes[i]).latitude],[airport(c).longitude,airport(c).latitude]),0)
const dictionaries={exports:{},require:()=>({})}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/i18n.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,dictionaries)
const {translate,LOCALES}=dictionaries.exports
const origin=process.env.TEST_URL||'http://127.0.0.1:3092',output=process.env.SCREENSHOT_DIR||'/tmp'
fs.mkdirSync(output,{recursive:true})
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
let groups=0
try {for(const width of (process.env.TEST_WIDTH?[Number(process.env.TEST_WIDTH)]:[1280,390,320])){
 const height=width===390?844:width===320?740:1000
 const context=await browser.newContext({viewport:{width,height},locale:'zh-TW',reducedMotion:'reduce',isMobile:width<768,hasTouch:width<768,deviceScaleFactor:width<768?2:1,serviceWorkers:'block'})
 const page=await context.newPage(),errors=[]
 page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message))
 const users={A:{id:'00000000-0000-0000-0000-000000000001',email:'mileage-a@example.invalid'},B:{id:'00000000-0000-0000-0000-000000000002',email:'mileage-b@example.invalid'}}
 let user=users.A,fail=false,badRead=false,holdB=false
 const pendingB=[],rows={A:new Map(),B:new Map()},requests=new Map(),calls=[]
 const seed=initial(['TPE','DXB','ATH']);seed.draft.stops[1].countryPresence='transit';rows.A.set(seed.draft.id,seed)
 await context.addInitScript(()=>{
  navigator.geolocation.getCurrentPosition=()=>{}
  Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2})
  if(!localStorage.getItem('globetrotter:v1'))localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{locale:'zh-TW',localePinned:true,view:'map',autoSpin:false,statuses:{'250':'visited'},notes:{'250':'UNTOUCHED MILEAGE FIXTURE'}}}))
  if(!localStorage.getItem('globetrotter:trips:v1'))localStorage.setItem('globetrotter:trips:v1','DO NOT IMPORT MILEAGE FIXTURE')
  const read=Storage.prototype.getItem;window.oldTripReads=0
  Storage.prototype.getItem=function(key){if(key==='globetrotter:trips:v1')window.oldTripReads++;return read.call(this,key)}
 })
 await context.route('**/auth/session',r=>r.fulfill({json:{user},headers:{'Cache-Control':'private,no-store'}}))
 await context.route('**/api/flight**',r=>r.fulfill({json:{flight:null}}))
 await context.route('**/api/account**',async r=>{
  const request=r.request(),captured=user,owner=captured===users.A?'A':'B'
  const reply=result=>r.fulfill({json:{userId:captured?.id??null,result},headers:{'Cache-Control':'private,no-store'}})
  if(!captured)return reply({ok:false,error:'unauthenticated'})
  const expected=request.method()==='GET'?new URL(request.url()).searchParams.get('expectedUserId'):request.postDataJSON().expectedUserId
  if(expected!==captured.id)return reply({ok:false,error:'account-changed'})
  if(request.method()==='GET'){
   if(owner==='B'&&holdB)await new Promise(resolve=>pendingB.push(resolve))
   if(new URL(request.url()).searchParams.get('kind')==='countries')return reply({ok:true,value:[]})
   const value=[...rows[owner].values()].map(row=>structuredClone(row))
   if(badRead&&value.length)value[0].draft.stops[0].airport.latitude=null
   return reply({ok:true,value})
  }
  const {operation,command}=request.postDataJSON();calls.push({owner,operation,command:structuredClone(command)})
  if(fail){fail=false;return reply({ok:false,error:'network'})}
  const key=owner+':'+command.requestId
  if(requests.has(key))return reply(requests.get(key))
  const old=rows[owner].get(command.id)
  if((old?.revision??null)!==command.expectedRevision)return reply({ok:false,error:'conflict'})
  let value=null
  if(operation==='save-trip'){
   value={draft:structuredClone(command.draft),createdAt:old?.createdAt??now,updatedAt:now,revision:(old?.revision??0)+1};rows[owner].set(command.id,value)
  }else{assert.equal(operation,'remove-trip');rows[owner].delete(command.id)}
  const result={ok:true,value};requests.set(key,result);return reply(result)
 })
 const data=()=>page.evaluate(()=>{const e=document.querySelector('[data-flight-mileage]');return e?.dataset.flightMileage?JSON.parse(e.dataset.flightMileage):null})
 async function totals(km,legs){await page.waitForFunction(({km,legs})=>{const el=document.querySelector('[data-flight-mileage]');const m=el?.dataset.flightMileage?JSON.parse(el.dataset.flightMileage):null;return m&&m.flightLegCount===legs&&Math.abs(m.totalKm-km)<1e-6},{km,legs})}
 async function flat(){await page.getByRole('button',{name:'平面地圖',exact:true}).click();await page.locator('[data-flat-preview-colors] > svg').waitFor({state:'visible'})}
 async function menu(label){if(width<768&&!await page.getByRole('button',{name:label,exact:true}).isVisible())await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click();await page.getByRole('button',{name:label,exact:true}).click()}
 async function closeDrawer(){const d=page.getByRole('dialog',{name:'搜尋與我的旅行',exact:true});if(width<768&&await d.isVisible())await d.getByRole('button',{name:'關閉',exact:true}).click()}
 const editor=page.getByRole('dialog',{name:'旅行編輯',exact:true}),records=page.getByRole('dialog',{name:'我的旅行紀錄',exact:true})
 async function add(code){await editor.getByRole('searchbox').fill(code);await editor.locator('li').filter({has:page.getByRole('button',{name:'加入路線',exact:true})}).filter({hasText:code}).first().getByRole('button',{name:'加入路線',exact:true}).click()}
 await page.goto(origin,{waitUntil:'domcontentloaded'});await totals(sum(['TPE','DXB','ATH']),2);await flat();groups++
 await menu('建立旅行');await editor.getByLabel('旅行名稱（選填）',{exact:true}).fill('瀏覽器測試 · 日本直飛')
 await add('TPE');await add('NRT')
 assert.equal((await data()).flightLegCount,2,'Unsaved editor legs never change totals')
 fail=true;await editor.getByRole('button',{name:'儲存旅行',exact:true}).click()
 await editor.getByRole('alert').filter({hasText:translate('zh-TW')('cloud.error.network')}).waitFor()
 await totals(sum(['TPE','DXB','ATH']),2);assert.equal(rows.A.size,1);groups++
 await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();await editor.waitFor({state:'hidden'})
 const all=sum(['TPE','DXB','ATH'])+sum(['TPE','NRT'])
 await totals(all,3);assert.equal(calls[0].command.requestId,calls[1].command.requestId)
 await closeDrawer();await flat();await page.locator('[data-journey-notice]').waitFor({state:'hidden'});groups++
 // Assert actual visible text and layout, rather than relying only on data attributes.
 let current='zh-TW'
 for(const locale of LOCALES){
  await page.locator('.map-stage').getByRole('button',{name:translate(current)('language'),exact:true}).click()
  const popup=page.locator('[data-language-menu]'),option=popup.getByRole('button').filter({hasText:locale.label})
  await page.waitForFunction(()=>{const m=document.querySelector('[data-language-menu]');return m&&Number(getComputedStyle(m).opacity)>.999&&getComputedStyle(m).transform==='none'})
  const popupBounds=await popup.boundingBox(),optionBounds=await option.boundingBox()
  assert.ok(popupBounds.x>=0&&popupBounds.x+popupBounds.width<=width+.5,'Language menu fits the map viewport')
  assert.equal(await option.evaluate((e,p)=>e.contains(document.elementFromPoint(p.x,p.y)),{x:optionBounds.x+4,y:optionBounds.y+optionBounds.height/2}),true,'Even the left edge of the language option is hit-testable')
  await option.click();current=locale.id
  const t=translate(current)
  let card
  if(width<768){await page.getByRole('button',{name:t('nav.go.stats'),exact:true}).click();card=page.getByRole('dialog',{name:t('nav.stats'),exact:true}).getByRole('region',{name:t('mileage.title'),exact:true})}
  else card=page.getByRole('region',{name:t('mileage.title'),exact:true})
  await card.scrollIntoViewIfNeeded()
  assert.equal(await card.locator('[data-mileage-km]').innerText(),new Intl.NumberFormat(current,{maximumFractionDigits:0}).format(all))
  assert.equal(await card.locator('[data-mileage-legs]').innerText(),'3')
  assert.equal(await card.locator('[data-mileage-laps]').innerText(),new Intl.NumberFormat(current,{minimumFractionDigits:2,maximumFractionDigits:2}).format(all/40075))
  for(const key of ['mileage.title','mileage.legs','mileage.laps','mileage.estimate'])assert.ok((await card.innerText()).includes(t(key)))
  const b=await card.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width+.5&&b.y>=0&&b.y+b.height<=height+.5,'Mileage card is fully visible')
  assert.equal(await card.evaluate(e=>e.scrollWidth<=e.clientWidth),true,'No horizontal clipping')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  if(current==='zh-TW')await page.screenshot({path:path.join(output,`globetrotter-mileage-${width}.png`),animations:'disabled'})
  if(width<768)await page.getByRole('dialog',{name:t('nav.stats'),exact:true}).getByRole('button',{name:t('close'),exact:true}).click()
  console.log(`PASS ${width}px ${current}: visible distance/legs/laps, translated labels and unclipped card`);groups++
 }
 await page.reload({waitUntil:'domcontentloaded'});await totals(all,3);await flat();groups++
 await menu('我的旅行紀錄')
 const japan=records.locator('li').filter({has:page.getByRole('heading',{name:'瀏覽器測試 · 日本直飛',exact:true})})
 await japan.getByRole('button',{name:'編輯',exact:true}).click()
 await editor.getByRole('button',{name:translate('zh-TW')('trip.remove')+' NRT',exact:true}).click();await add('KCZ');await totals(all,3)
 await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();await editor.getByText('已儲存至帳號',{exact:true}).first().waitFor()
 const edited=sum(['TPE','DXB','ATH'])+sum(['TPE','KCZ']);await totals(edited,3)
 await editor.getByRole('button',{name:'關閉編輯器',exact:true}).click();await closeDrawer();await flat();groups++
 await menu('我的旅行紀錄');page.once('dialog',d=>d.accept())
 await records.locator('li').filter({has:page.getByRole('heading',{name:'瀏覽器測試 · 日本直飛',exact:true})}).getByRole('button',{name:'刪除',exact:true}).click()
 await totals(sum(['TPE','DXB','ATH']),2);await records.getByRole('button',{name:'關閉旅行紀錄',exact:true}).click();await closeDrawer();groups++
 // Delayed B reads prove A's distance disappears before B's records finish loading.
 holdB=true;user=users.B;await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')))
 await page.getByText(users.B.email,{exact:true}).waitFor({state:'attached'})
 if(width<768)await page.getByRole('button',{name:translate('zh-TW')('nav.go.stats'),exact:true}).click()
 assert.equal(await data(),null);assert.equal(await page.locator('[data-mileage-km]').first().innerText(),'—')
 holdB=false;pendingB.splice(0).forEach(resolve=>resolve());await totals(0,0);groups++
 if(width<768)await page.getByRole('dialog',{name:translate('zh-TW')('nav.stats'),exact:true}).getByRole('button',{name:'關閉',exact:true}).click()
 user=null;await menu('登出');await page.locator('[data-login-page]').waitFor()
 assert.equal(await page.locator('[data-flight-mileage]').count(),0);groups++
 // Existing cloud validation rejects damaged responses. Never show a false zero-distance account.
 user=users.A;badRead=true;await page.goto(origin,{waitUntil:'domcontentloaded'})
 await page.getByText(users.A.email,{exact:true}).waitFor({state:'attached'})
 if(width<768)await page.getByRole('button',{name:translate('zh-TW')('nav.go.stats'),exact:true}).click()
 const unavailable=page.getByRole('region',{name:translate('zh-TW')('mileage.title'),exact:true})
 await unavailable.getByText(translate('zh-TW')('mileage.unavailable'),{exact:true}).waitFor({state:'visible'})
 assert.equal(await data(),null);assert.equal(await page.locator('[data-mileage-km]').first().innerText(),'—');groups++
 assert.equal(await page.evaluate(()=>window.oldTripReads),0)
 assert.equal(await page.evaluate(()=>Storage.prototype.getItem.call(localStorage,'globetrotter:trips:v1')),'DO NOT IMPORT MILEAGE FIXTURE')
 const legacy=await page.evaluate(()=>JSON.parse(localStorage.getItem('globetrotter:v1')).state)
 assert.deepEqual(legacy.statuses,{'250':'visited'});assert.equal(legacy.notes['250'],'UNTOUCHED MILEAGE FIXTURE')
 assert.deepEqual(errors,[])
 console.log(`PASS ${width}px: saved CRUD, rejected save, reload, isolation/logout, invalid reads and unchanged legacy data`)
 await context.close()
}
console.log(`PASS ${groups} mileage browser groups; mocked accounts/endpoints, real layout and controls, no live Supabase/Google verification`)
}finally{await browser.close()}
