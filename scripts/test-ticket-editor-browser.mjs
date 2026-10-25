/** Local production UI + mock account transport. Never authenticates to Google or writes Supabase. */
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const {chromium}=createRequire(import.meta.url)('playwright')
const base=process.env.TEST_URL||'http://127.0.0.1:3201'
const out=process.env.SCREENSHOT_DIR||'/tmp/globetrotter-ticket-screenshots'
fs.mkdirSync(out,{recursive:true})
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
let checks=0,activePage=null,activeWidth=null
try{for(const width of [1280,390,320]){
 const context=await browser.newContext({viewport:{width,height:width===1280?1000:844},locale:'zh-TW',reducedMotion:'reduce',isMobile:width<768,hasTouch:width<768,serviceWorkers:'block'})
 const page=await context.newPage(),errors=[],user={id:'00000000-0000-0000-0000-000000000001',email:'ticket@example.invalid'}
 let rows=[],fail=false
 activePage=page;activeWidth=width
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(30000)
 await context.addInitScript(()=>{navigator.geolocation.getCurrentPosition=()=>{};Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2});if(!localStorage.getItem('globetrotter:v1'))localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{locale:'zh-TW',localePinned:true,view:'map',autoSpin:false}}));localStorage.setItem('globetrotter:trips:v1','TICKET LEGACY SENTINEL')})
 await context.route('**/auth/session',r=>r.fulfill({json:{user}}))
 await context.route('**/api/flight**',r=>r.fulfill({json:{flight:null}}))
 await context.route('**/api/account**',r=>{
  const req=r.request(),reply=result=>r.fulfill({json:{userId:user.id,result}})
  if(req.method()==='GET')return reply({ok:true,value:new URL(req.url()).searchParams.get('kind')==='countries'?[]:rows})
  const {operation,command}=req.postDataJSON();assert.equal(operation,'save-trip')
  if(fail){fail=false;return reply({ok:false,error:'network'})}
  const old=rows.find(x=>x.draft.id===command.id)
  if((old?.revision??null)!==command.expectedRevision)return reply({ok:false,error:'conflict'})
  const value={draft:command.draft,revision:(old?.revision??0)+1,createdAt:'2026-10-24T00:00:00Z',updatedAt:'2026-10-24T00:00:00Z'};rows=[value];return reply({ok:true,value})
 })
 await page.goto(base,{waitUntil:"domcontentloaded"})
 if(width<768)await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click()
 await page.getByRole('button',{name:'我的旅行紀錄',exact:true}).click()
 await page.getByRole('dialog',{name:'我的旅行紀錄',exact:true}).getByRole('button',{name:'＋ 新增旅行紀錄',exact:true}).click()
 const ed=page.getByRole('dialog',{name:'旅行編輯',exact:true});await ed.waitFor()
 const baseline=await page.evaluate(()=>localStorage.getItem('globetrotter:v1'))
 const add=async(code,button)=>{
  await ed.getByRole('button',{name:button,exact:true}).click()
  await ed.getByRole('searchbox',{name:'搜尋機場',exact:true}).fill(code)
  await ed.locator('li').filter({hasText:code}).filter({has:page.getByRole('button',{name:'加入路線',exact:true})}).first().getByRole('button',{name:'加入路線',exact:true}).click()
 }
 await ed.getByLabel('旅行名稱（選填）',{exact:true}).fill('海岸之旅 · TPE → DXB → ATH')
 await add('TPE','選擇出發機場');await add('DXB','選擇抵達機場');await add('ATH','＋ 新增下一段航班')
 const cards=ed.locator('[data-flight-card]');assert.equal(await cards.count(),2)
 assert.match(await cards.nth(1).locator('[data-airport-endpoint=from]').innerText(),/DXB/)
 await cards.nth(0).getByLabel('飛行日期',{exact:true}).fill('2026-10-24')
 await cards.nth(0).getByLabel('航空公司',{exact:true}).fill('EK')
 await page.getByRole('option').filter({hasText:'Emirates'}).first().getByRole('button').click()
 if(!await cards.nth(0).getByLabel('航班編號',{exact:true}).isVisible())await cards.nth(0).locator('[data-flight-more] > summary').click()
 await cards.nth(0).getByLabel('航班編號',{exact:true}).fill('EK367')
 await ed.getByLabel('國家停留性質 DXB',{exact:true}).selectOption('transit')
 await cards.nth(1).getByLabel('飛行日期',{exact:true}).fill('2026-10-25')
 await ed.locator('[data-flight-calculations] > summary').click()
 const preview=ed.locator('[aria-labelledby="trip-preview-title"]')
 assert.match(await preview.innerText(),/去過 3 國・實際旅遊 2 國・僅轉機 1 國/)
 await cards.first().evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:`${out}/ticket-${width}.png`})
 await ed.getByRole('complementary',{name:'旅行時間軸'}).evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:`${out}/timeline-${width}.png`})
 assert.equal(await ed.evaluate(e=>e.scrollWidth<=e.clientWidth),true)
 assert.equal(await ed.locator('button,input,select,textarea').evaluateAll(els=>els.every(e=>{if(!e.getClientRects().length)return true;const r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1})),true)
 checks+=4
 await ed.getByRole('button',{name:'↩ 新增回程',exact:true}).click();assert.equal(await cards.count(),4)
 assert.equal(await cards.nth(2).getByLabel('飛行日期',{exact:true}).inputValue(),'')
 assert.equal(await cards.nth(3).getByLabel('航空公司',{exact:true}).inputValue(),'')
 assert.equal(await cards.nth(0).getByLabel('航班編號',{exact:true}).inputValue(),'EK367');checks+=3
 await ed.getByRole('button',{name:'航段往前 2',exact:true}).click()
 assert.equal(await cards.nth(0).getByLabel('飛行日期',{exact:true}).inputValue(),'')
 await ed.getByRole('button',{name:'↶ 復原上次航線調整',exact:true}).click()
 assert.equal(await cards.nth(0).getByLabel('航班編號',{exact:true}).inputValue(),'EK367');checks+=2
 await ed.getByRole('button',{name:'刪除此航段 4',exact:true}).click();assert.equal(await cards.count(),3)
 await ed.getByRole('button',{name:'↶ 復原上次航線調整',exact:true}).click();assert.equal(await cards.count(),4);checks+=3
 fail=true;await ed.getByRole('button',{name:'儲存旅行',exact:true}).click();await ed.getByRole('alert').waitFor();assert.equal(rows.length,0)
 assert.equal(await cards.count(),4);checks++
 await ed.getByRole('button',{name:'儲存旅行',exact:true}).click();await ed.waitFor({state:'hidden'})
 assert.equal(rows.length,1);assert.equal(rows[0].draft.legs.length,4);assert.equal(rows[0].draft.stops.length,5)
 assert.equal(rows[0].draft.status,'completed');assert.equal(await page.evaluate(()=>localStorage.getItem('globetrotter:trips:v1')),'TICKET LEGACY SENTINEL')
 assert.equal(await page.evaluate(()=>localStorage.getItem('globetrotter:v1')),baseline);checks+=3
 await page.reload({waitUntil:"domcontentloaded"});await page.waitForFunction(()=>[...document.querySelectorAll('[data-saved-arcs]')].some(e=>Number(e.dataset.savedArcs)===4));assert.deepEqual(errors,[]);checks++
 console.log(`${width}px: ticket, timeline, return, undo, failure and acknowledged save passed`)
 await context.close()
}console.log(`${checks} browser acceptance checks passed`)}catch(error){if(activePage&&!activePage.isClosed()){
 await activePage.screenshot({path:`${out}/failure-${activeWidth}.png`}).catch(()=>{})
 console.error('Active control:',await activePage.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')})).catch(()=>null))
}throw error}finally{await browser.close()}
