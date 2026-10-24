/** Actual UI/SVG with isolated account endpoint doubles. No live Google or Supabase writes. */
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
const native=createRequire(import.meta.url),{chromium}=native('playwright'),cache=new Map()
function load(file){const p=path.resolve(file);if(cache.has(p))return cache.get(p)
 if(p.endsWith('.json')){const o=JSON.parse(fs.readFileSync(p,'utf8'));cache.set(p,o);return o}
 const exports={};cache.set(p,exports)
 const code=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
 new vm.Script(`(function(exports,require){${code}\n})`).runInThisContext()(exports,n=>{if(!n.startsWith('.')&&!n.startsWith('@/'))return native(n);const f=n.startsWith('@/')?path.resolve('src',n.slice(2)):path.resolve(path.dirname(p),n);return load(path.extname(f)?f:f+'.ts')});return exports}
const catalog=load('src/lib/airport-data/catalog.ts').AIRPORT_CATALOG
const {createTripDraft,addDraftStop}=load('src/lib/trip-draft/core.ts')
const airport=code=>catalog.find(a=>a.iata===code),now='2026-10-12T00:00:00.000Z'
const initial=(id,codes,date,airline,title=id)=>{
 const draft=codes.reduce((d,c,i)=>addDraftStop(d,airport(c),id+':s'+i),{...createTripDraft(id),title,status:'completed'})
 draft.legs.forEach(l=>{if(airline)l.airline=airline});if(date)draft.legs[0].date=date
 return {draft,createdAt:now,updatedAt:now,revision:1}
}
const {calculateTravelRankings}=load('src/lib/travel-rankings.ts')
const dictionaries={exports:{},require:()=>({})}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/i18n.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,dictionaries)
const {translate,LOCALES}=dictionaries.exports
const origin=process.env.TEST_URL||'http://127.0.0.1:3098',output=process.env.SCREENSHOT_DIR||'/tmp'
fs.mkdirSync(output,{recursive:true})
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
let groups=0,activePage=null,activeWidth=null
try {for(const width of (process.env.TEST_WIDTH?[Number(process.env.TEST_WIDTH)]:[1280,390,320])){
 const height=width===390?844:width===320?740:1000
 const context=await browser.newContext({viewport:{width,height},locale:'zh-TW',reducedMotion:'reduce',isMobile:width<768,hasTouch:width<768,deviceScaleFactor:width<768?2:1,serviceWorkers:'block'})
 const page=await context.newPage(),errors=[]
 activePage=page;activeWidth=width
 page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message))
 const users={A:{id:'00000000-0000-0000-0000-000000000001',email:'mileage-a@example.invalid'},B:{id:'00000000-0000-0000-0000-000000000002',email:'mileage-b@example.invalid'}}
 let user=users.A,fail=false,holdB=false,badRead=!!process.env.TEST_INVALID_READ
 const pendingB=[],rows={A:new Map(),B:new Map()},requests=new Map(),calls=[]
 const seeds=[
  initial('old',['TPE','NRT'],'2024-10-01','BA','Japan · 2024'),
  initial('connect',['TPE','DXB','ATH'],'2026-10-09','CI','Coastal journey · 杜拜轉機'),
  initial('same',['TPE','HND'],'2026-10-09','EVA Air','Japan · 同日'),
  initial('recent',['TPE','KIX'],'2026-10-12','NH','Japan · 最新旅行'),
  initial('undated',['TPE','ICN'],null,'JL','Korea · 未填日期'),
  initial('singapore',['TPE','SIN'],'2025-01-01','SQ','Singapore'),
  initial('unknown',['TPE','CDG'],null,'Unknown fixture airline','France · 未辨識航空公司')
 ]
 seeds[1].draft.stops[1].countryPresence='transit';seeds[1].draft.legs[1].airline='EK'
 for(const seed of seeds)rows.A.set(seed.draft.id,seed)
 await context.addInitScript(()=>{
  navigator.geolocation.getCurrentPosition=()=>{}
  Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2})
  if(!localStorage.getItem('globetrotter:v1'))localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{locale:'zh-TW',localePinned:true,view:'map',autoSpin:false,statuses:{'250':'visited'},notes:{'250':'UNTOUCHED RANKING FIXTURE'}}}))
  if(!localStorage.getItem('globetrotter:trips:v1'))localStorage.setItem('globetrotter:trips:v1','DO NOT IMPORT RANKING FIXTURE')
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
 let current='zh-TW'
 const editor=page.getByRole('dialog',{name:'旅行編輯',exact:true}),records=page.getByRole('dialog',{name:'我的旅行紀錄',exact:true})
 async function menu(label){if(width<768&&!await page.getByRole('button',{name:label,exact:true}).isVisible())await page.getByRole('button',{name:translate(current)('mobile.travels'),exact:true}).click();await page.getByRole('button',{name:label,exact:true}).click()}
 async function closeDrawer(){const d=page.getByRole('dialog',{name:translate(current)('mobile.travels'),exact:true});if(width<768&&await d.isVisible())await d.getByRole('button',{name:'關閉',exact:true}).click()}
 const ranking=()=>page.getByRole('region',{name:translate(current)('rankings.title'),exact:true}).filter({visible:true})
 async function stats(){if(width<768)await page.getByRole('button',{name:translate(current)('nav.go.stats'),exact:true}).click();await ranking().scrollIntoViewIfNeeded()}
 async function closeStats(){if(width<768)await page.getByRole('dialog',{name:translate(current)('nav.stats'),exact:true}).getByRole('button',{name:translate(current)('close'),exact:true}).click()}
 const expected=()=>calculateTravelRankings([...rows[user===users.A?'A':'B'].values()])
 async function confirmed(){const wanted=expected();await page.waitForFunction(wanted=>[...document.querySelectorAll('[data-travel-rankings]')].some(e=>{
 const actual=JSON.parse(e.dataset.travelRankings);return JSON.stringify(actual)===JSON.stringify(wanted)
 }),wanted)}
 async function visibleRanks(kind){const card=ranking();await card.getByRole('tab',{name:translate(current)(`rankings.${kind}`),exact:true}).click();const panel=card.getByRole('tabpanel');const list=panel.locator('li');const want=expected()[kind].slice(0,5)
 await card.scrollIntoViewIfNeeded();assert.equal(await list.count(),want.length)
 for(let i=0;i<want.length;i++){
  assert.equal(await list.nth(i).getAttribute('data-ranking-id'),want[i].id)
  assert.equal(await list.nth(i).locator('[data-ranking-count]').innerText(),translate(current)('rankings.count',{n:new Intl.NumberFormat(current).format(want[i].count)}))
  await list.nth(i).scrollIntoViewIfNeeded();assert.equal(await list.nth(i).evaluate(e=>e.scrollWidth<=e.clientWidth),true)
 }
 await card.getByRole('tab',{name:translate(current)(`rankings.${kind}`),exact:true}).scrollIntoViewIfNeeded()
 assert.equal(await card.evaluate(e=>e.scrollWidth<=e.clientWidth),true)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 }
 async function screen(label){await page.screenshot({path:path.join(output,`globetrotter-rankings-${width}-${label}.png`),animations:'disabled'})}
 async function recordIds(){await records.waitFor({state:'visible'});await records.locator('[data-trip-records-list] > li').first().waitFor({state:'visible'});return records.locator('[data-trip-records-list] > li').evaluateAll(nodes=>nodes.map(n=>n.dataset.tripRecordId))}
 async function ordered(wanted){await page.waitForFunction(wanted=>JSON.stringify([...document.querySelectorAll('[data-trip-records-list] > li')].map(n=>n.dataset.tripRecordId))===JSON.stringify(wanted),wanted);assert.deepEqual(await recordIds(),wanted)}
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'平面地圖',exact:true}).click();await page.locator('[data-flat-preview-colors] > svg').waitFor({state:'visible'})
 if(process.env.TEST_INVALID_READ){
  await stats();await ranking().getByText(translate(current)('rankings.unavailable'),{exact:true}).waitFor({state:'visible'})
  assert.equal(await ranking().getAttribute('data-travel-rankings'),null);assert.equal(await ranking().locator('li').count(),0);groups++
  await closeStats();badRead=false;await menu(translate(current)('cloud.refresh'));await closeDrawer();await stats();await confirmed();await visibleRanks('airports');groups++
  assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width}px: damaged cloud read is unavailable, corrected reload restores rankings`);continue
 }
 await stats();await confirmed();await visibleRanks('airports')
 assert.equal(expected().airports.find(r=>r.airport.iata==='TPE').count,7)
 assert.equal(expected().airports.find(r=>r.airport.iata==='DXB').count,2)
 await screen('airports');groups++
 const card=ranking()
 await card.getByRole('button',{name:translate(current)('rankings.showAll',{n:expected().airports.length}),exact:true}).click();assert.equal(await card.locator('li').count(),expected().airports.length)
 await card.getByRole('button',{name:translate(current)('rankings.topFive'),exact:true}).click();assert.equal(await card.locator('li').count(),5);groups++
 await visibleRanks('airlines');await screen('airlines');assert.equal(expected().unknownAirlines,1)
 await card.locator('summary').click();await card.getByText(translate(current)('rankings.unknownAirlines',{n:1}),{exact:true}).waitFor();groups++
 // Roving keyboard tabs remain operable and keep the active tab in the accessibility tree.
 const airlineTab=card.getByRole('tab',{name:translate(current)('rankings.airlines'),exact:true});await airlineTab.focus();await page.keyboard.press('ArrowLeft')
 assert.equal(await card.getByRole('tab',{name:translate(current)('rankings.airports'),exact:true}).getAttribute('aria-selected'),'true');groups++
 await closeStats();await menu('我的旅行紀錄')
 await ordered(['recent','connect','same','singapore','old','undated','unknown'])
 await records.getByLabel('旅行排序',{exact:true}).selectOption('date-asc');await ordered(['old','singapore','connect','same','recent','undated','unknown'])
 await records.getByLabel('搜尋旅行',{exact:true}).fill('Japan');await ordered(['old','same','recent'])
 await records.getByLabel('旅行排序',{exact:true}).selectOption('date-desc');await ordered(['recent','same','old'])
 await records.getByLabel('旅行排序',{exact:true}).selectOption('updated-desc');await ordered(['old','same','recent'])
 await records.getByLabel('搜尋旅行',{exact:true}).fill('');await records.getByLabel('旅行排序',{exact:true}).selectOption('date-desc')
 const select=records.getByLabel('旅行排序',{exact:true}),bounds=await select.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width)
 assert.equal(await records.evaluate(e=>e.scrollWidth<=e.clientWidth),true);if(width<768)assert.ok(await select.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16),'Avoid iOS focus zoom on the sort control');await screen('dates');groups++
 await records.getByLabel('搜尋旅行',{exact:true}).fill('no match');await records.getByText(translate(current)('tripOrder.noMatches'),{exact:true}).waitFor();await records.getByLabel('搜尋旅行',{exact:true}).fill('')
 await records.getByRole('button',{name:'關閉旅行紀錄',exact:true}).click();await closeDrawer();groups++
 // Actual language selection controls, then both tabs and the date-sort form in every language.
 for(const locale of LOCALES.filter(l=>!process.env.TEST_LOCALES||process.env.TEST_LOCALES.split(",").includes(l.id))){
  await page.locator('.map-stage').getByRole('button',{name:translate(current)('language'),exact:true}).click()
  const popup=page.locator('[data-language-menu]');await popup.getByRole('button').filter({hasText:locale.label}).click();current=locale.id
  await stats();await confirmed();await visibleRanks('airports');await visibleRanks('airlines');await closeStats()
  const t=translate(current);await menu(t('trip.records'));const localized=page.getByRole('dialog',{name:t('trip.records'),exact:true})
  await localized.getByLabel(t('tripOrder.label'),{exact:true}).selectOption('date-asc')
  assert.equal(await localized.getByRole('option',{name:t('tripOrder.date-asc'),exact:true}).count(),1)
  assert.equal(await localized.evaluate(e=>e.scrollWidth<=e.clientWidth),true)
  await localized.getByRole('button',{name:t('trip.closeRecords'),exact:true}).click()
  if(width<768){const drawer=page.getByRole('dialog',{name:t('mobile.travels'),exact:true});if(await drawer.isVisible())await drawer.getByRole('button',{name:t('close'),exact:true}).click()}
  groups++;console.log(`PASS ${width}px ${current}: date sort and both ranking tabs`)
 }
 // End LOCALES is zh-TW, so reuse the localized CRUD flow.
 assert.equal(current,'zh-TW');await menu('建立旅行');await editor.getByLabel('旅行名稱（選填）',{exact:true}).fill('CRUD 排行測試')
 async function add(code){await editor.getByRole('searchbox').fill(code);await editor.locator('li').filter({has:page.getByRole('button',{name:'加入路線',exact:true})}).filter({hasText:code}).first().getByRole('button',{name:'加入路線',exact:true}).click()}
 await add('TPE');await add('KCZ');await editor.getByRole('combobox',{name:'航空公司',exact:true}).fill('CI');await editor.getByRole('option').filter({hasText:'China Airlines'}).click()
 const before=expected();fail=true;await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();await editor.getByRole('alert').filter({hasText:translate(current)('cloud.error.network')}).waitFor();assert.deepEqual(expected(),before)
 await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();await editor.waitFor({state:'hidden'});await closeDrawer()
 await stats();await confirmed();assert.equal(expected().airlines.find(r=>r.id==='CI').count,2);await visibleRanks('airlines');await closeStats();groups++
 await menu('我的旅行紀錄');const item=records.locator('[data-trip-records-list] > li').filter({has:page.getByRole('heading',{name:'CRUD 排行測試',exact:true})})
 await item.getByRole('button',{name:'編輯',exact:true}).click();await editor.getByRole('combobox',{name:'航空公司',exact:true}).fill('BR');await editor.getByRole('option').filter({hasText:'EVA Air'}).click()
 await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();await editor.getByText('已儲存至帳號',{exact:true}).first().waitFor()
 await editor.getByRole('button',{name:'關閉編輯器',exact:true}).click();await closeDrawer();await stats();await confirmed();assert.equal(expected().airlines.find(r=>r.id==='BR').count,2);assert.equal(expected().airlines.find(r=>r.id==='CI').count,1);await closeStats();groups++
 await page.reload({waitUntil:'domcontentloaded'});await stats();await confirmed();await closeStats();groups++
 await menu('我的旅行紀錄');page.once('dialog',d=>d.accept());await records.locator('[data-trip-records-list] > li').filter({has:page.getByRole('heading',{name:'CRUD 排行測試',exact:true})}).getByRole('button',{name:'刪除',exact:true}).click()
 await records.getByRole('button',{name:'關閉旅行紀錄',exact:true}).click();await closeDrawer();await stats();await confirmed();assert.deepEqual(expected(),before);await closeStats();groups++
 holdB=true;user=users.B;await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await page.getByText(users.B.email,{exact:true}).waitFor({state:'attached'})
 await stats();assert.equal(await ranking().getAttribute('data-travel-rankings'),null)
 assert.equal(await ranking().locator('li').count(),0);holdB=false;pendingB.splice(0).forEach(resolve=>resolve());await confirmed()
 await visibleRanks('airports');await ranking().getByText(translate(current)('rankings.airports.empty'),{exact:true}).waitFor();await visibleRanks('airlines');await ranking().getByText(translate(current)('rankings.airlines.empty'),{exact:true}).waitFor();await closeStats();groups++
 user=null;await menu('登出');await page.locator('[data-login-page]').waitFor();assert.equal(await page.locator('[data-travel-rankings]').count(),0);groups++
 assert.equal(await page.evaluate(()=>window.oldTripReads),0)
 assert.equal(await page.evaluate(()=>Storage.prototype.getItem.call(localStorage,'globetrotter:trips:v1')),'DO NOT IMPORT RANKING FIXTURE')
 const legacy=await page.evaluate(()=>JSON.parse(localStorage.getItem('globetrotter:v1')).state);assert.deepEqual(legacy.statuses,{'250':'visited'});assert.equal(legacy.notes['250'],'UNTOUCHED RANKING FIXTURE')
 assert.deepEqual(errors,[]);groups++;console.log(`PASS ${width}px: sorting/filtering, endpoint counting, top 5/all, cloud CRUD doubles, reload and account isolation`)
 await context.close()
}
console.log(`PASS ${groups} ranking browser groups; real Chromium UI, mocked sessions/cloud responses, no live Supabase/Google validation`)
}catch(error){if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:path.join(output,`globetrotter-rankings-${activeWidth}-failure.png`),animations:'disabled'}).catch(()=>{});console.error('Visible dialogs:',await activePage.locator('[role=dialog],dialog[open]').evaluateAll(nodes=>nodes.map(n=>({label:n.getAttribute('aria-label'),title:n.querySelector('h2')?.textContent}))).catch(()=>[]))}throw error}finally{await browser.close()}
