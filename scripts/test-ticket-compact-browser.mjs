/** Local production UI + mock account transport. Never authenticates to Google or writes Supabase. */
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const {chromium}=createRequire(import.meta.url)('playwright')
const dictionaries={exports:{},require:()=>({})}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/i18n.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,dictionaries)
const {translate,LOCALES}=dictionaries.exports
const base=process.env.TEST_URL||'http://127.0.0.1:3201'
const out=process.env.SCREENSHOT_DIR||'/tmp/globetrotter-compact-screenshots'
fs.mkdirSync(out,{recursive:true})
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
let checks=0,activePage=null,activeWidth=null
try{for(const width of (process.env.TEST_WIDTH?[Number(process.env.TEST_WIDTH)]:[320,390,430,1280])){
 const context=await browser.newContext({viewport:{width,height:width===1280?1000:844},locale:'zh-TW',reducedMotion:'reduce',isMobile:width<768,hasTouch:width<768,serviceWorkers:'block'})
 const page=await context.newPage(),errors=[],user={id:'00000000-0000-0000-0000-000000000001',email:'ticket@example.invalid'}
 let rows=[],fail=false
 activePage=page;activeWidth=width
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(30000)
 await context.addInitScript(()=>{
  // Explicit keyboard viewport simulation, not a claim of real Safari testing.
  let testHeight=null,testTop=0,testScale=1
  const v=new EventTarget();Object.defineProperties(v,{height:{get:()=>testHeight??innerHeight},offsetTop:{get:()=>testTop},scale:{get:()=>testScale}})
  Object.defineProperty(window,'visualViewport',{get:()=>v,configurable:true})
  window.setTestEditorViewport=(height,offsetTop=0,scale=1)=>{testHeight=height;testTop=offsetTop;testScale=scale;v.dispatchEvent(new Event('resize'))}
navigator.geolocation.getCurrentPosition=()=>{};Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2});if(!localStorage.getItem('globetrotter:v1'))localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{locale:'zh-TW',localePinned:true,view:'map',autoSpin:false}}));localStorage.setItem('globetrotter:trips:v1','TICKET LEGACY SENTINEL')})
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
 assert.ok(await ed.evaluate(e=>e.getBoundingClientRect().height<=innerHeight+1),'Editor fits the current viewport after metadata is parsed')
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
 // Default card must be compact without hiding essential controls.
 await cards.first().evaluate(e=>e.scrollIntoView({block:'start'}))
 const h=await cards.first().evaluate(e=>e.getBoundingClientRect().height)
 const before=({320:960,390:924,430:924,1280:610})[width] // Baseline measurements recorded in docs/features/ticket-trip-editor.md
 assert.ok(h<530,`Default ${width}px card is ${h}px`);assert.ok(h<before*.8,`Card shrank from ${before}px to ${h}px`)
 const from=await cards.first().locator('[data-airport-endpoint=from]').boundingBox(),to=await cards.first().locator('[data-airport-endpoint=to]').boundingBox()
 assert.ok(Math.abs(from.y-to.y)<1 && from.x+from.width<to.x,'Airport choices share a row with a route arrow')
 const date=await cards.first().getByLabel('飛行日期',{exact:true}).boundingBox(),carrier=await cards.first().getByLabel('航空公司',{exact:true}).boundingBox()
 assert.ok(Math.abs(date.y-carrier.y)<1 && date.x+date.width<carrier.x,'Date and airline share a row')
 for(const label of ['航段往後 1','刪除此航段 1']){
  const control=cards.first().getByRole('button',{name:label,exact:true}),b=await control.boundingBox();assert.ok(b.width>=44&&b.height>=44)
 }
 const more=cards.first().locator('[data-flight-more]'),summary=more.locator('summary')
 assert.equal(await more.getAttribute('open'),null)
 await page.screenshot({path:`${out}/compact-${width}.png`})
 fs.writeFileSync(`${out}/metrics-${width}.json`,JSON.stringify({width,before,after:h,reduction:1-h/before},null,2))
 await summary.focus();await summary.press('Enter');await cards.first().getByLabel('備註',{exact:true}).fill('保留備註 · overnight connection')
 await summary.focus();await summary.press('Enter');assert.equal(await cards.first().getByLabel('備註',{exact:true}).isVisible(),false)
 assert.equal(await cards.first().getByLabel('備註',{exact:true}).inputValue(),'保留備註 · overnight connection')
 assert.match(await summary.innerText(),/已填寫/)
 checks+=8
 if(!await cards.nth(0).getByLabel('航班編號',{exact:true}).isVisible())await cards.nth(0).locator('[data-flight-more] > summary').click()
 await cards.nth(0).getByLabel('航班編號',{exact:true}).fill('EK367')
 await ed.getByLabel('國家停留性質 DXB',{exact:true}).selectOption('transit')
 await cards.nth(1).getByLabel('飛行日期',{exact:true}).fill('2026-10-25')
 await ed.locator('[data-flight-calculations] > summary').click()
 const preview=ed.locator('[aria-labelledby="trip-preview-title"]')
 assert.match(await preview.innerText(),/去過 3 國・實際旅遊 2 國・僅轉機 1 國/)
 if(width<768){
   const notes=cards.first().getByLabel('備註',{exact:true})
   await notes.focus();await page.evaluate(()=>window.setTestEditorViewport(410,12))
   await page.waitForFunction(()=>{const d=document.querySelector('dialog[aria-labelledby="trip-editor-title"]');return Math.abs(d.getBoundingClientRect().height-410)<1&&Math.abs(d.getBoundingClientRect().top-12)<1})
   await page.waitForFunction(()=>{const e=document.activeElement,b=e.getBoundingClientRect(),p=document.querySelector('[data-editor-scroll]').getBoundingClientRect();return b.top>=p.top&&b.bottom<=p.bottom})
   const footer=ed.locator('[data-editor-footer]'),fb=await footer.boundingBox();assert.ok(fb.y+fb.height<=422.5)
   const save=ed.getByRole('button',{name:'儲存旅行',exact:true}),sb=await save.boundingBox()
   assert.ok(await save.evaluate((e,b)=>e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),sb))
   assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('[data-editor-footer]')).paddingBottom),'12px')
   await page.screenshot({path:`${out}/keyboard-simulated-${width}.png`})
   await page.evaluate(()=>window.setTestEditorViewport(410,12,1.4))
   await page.waitForFunction(()=>document.querySelector('dialog[aria-labelledby="trip-editor-title"]').style.getPropertyValue('--editor-viewport-height')==='')
   await page.evaluate(()=>window.setTestEditorViewport(innerHeight,0,1))
   await page.waitForFunction(()=>{const d=document.querySelector('dialog[aria-labelledby="trip-editor-title"]');return d.style.getPropertyValue('--editor-viewport-height')===`${innerHeight}px`&&Math.abs(d.getBoundingClientRect().height-innerHeight)<1})
   await footer.evaluate(e=>e.style.setProperty('--editor-safe-bottom','34px'))
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-editor-footer]')).paddingBottom==='46px')
   assert.equal(await footer.evaluate(e=>getComputedStyle(e).paddingBottom),'46px')
   const safeSave=await save.boundingBox(),safeDialog=await ed.boundingBox();assert.ok(safeSave.y+safeSave.height<=safeDialog.y+safeDialog.height-34)
   await footer.evaluate(e=>e.style.removeProperty('--editor-safe-bottom'))
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-editor-footer]')).paddingBottom==='12px')
   checks+=6
 }
 await cards.first().evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:`${out}/ticket-${width}.png`})
 await ed.getByRole('complementary',{name:'旅行時間軸'}).evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:`${out}/timeline-${width}.png`})
 assert.equal(await ed.evaluate(e=>e.scrollWidth<=e.clientWidth),true)
 assert.equal(await ed.locator('button,input,select,textarea').evaluateAll(els=>els.every(e=>{if(!e.getClientRects().length)return true;const r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1})),true)
 checks+=4
 await ed.getByRole('button',{name:'↩ 新增回程',exact:true}).click();assert.equal(await cards.count(),4)
 assert.equal(await cards.nth(2).getByLabel('飛行日期',{exact:true}).inputValue(),'')
 assert.equal(await cards.nth(3).getByLabel('航空公司',{exact:true}).inputValue(),'')
 assert.equal(await cards.nth(0).getByLabel('航班編號',{exact:true}).inputValue(),'EK367');checks+=3
 await ed.getByRole('button',{name:'航段往前 2',exact:true}).focus();await page.keyboard.press('Enter')
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
 if(width<768)await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click()
 await page.getByRole('button',{name:'我的旅行紀錄',exact:true}).click()
 await page.getByRole('dialog',{name:'我的旅行紀錄',exact:true}).getByRole('button',{name:'編輯',exact:true}).click()
 await ed.getByLabel('航班編號',{exact:true}).first().waitFor({state:'visible'})
 assert.equal(await cards.first().getByLabel('航班編號',{exact:true}).inputValue(),'EK367')
 assert.equal(await cards.first().getByLabel('備註',{exact:true}).inputValue(),'保留備註 · overnight connection')
 assert.notEqual(await cards.first().locator('[data-flight-more]').getAttribute('open'),null)
 await cards.first().locator('[data-flight-more] > summary').click()
 await cards.first().getByLabel('飛行日期',{exact:true}).fill('2026-10-26')
 await ed.getByRole('button',{name:'儲存旅行',exact:true}).click();await ed.getByText('已儲存至帳號',{exact:true}).first().waitFor()
 assert.equal(rows[0].draft.legs[0].notes,'保留備註 · overnight connection');assert.equal(rows[0].draft.legs[0].flightNumber,'EK367')
 checks+=4
 await ed.getByRole('button',{name:'關閉編輯器',exact:true}).click()
 await page.waitForFunction(()=>{const d=document.querySelector('dialog[aria-labelledby="trip-editor-title"]');return !d||d.style.getPropertyValue('--editor-viewport-height')===''})
 if(width===320){
   let current='zh-TW'
   const closeDrawer=async()=>{const d=page.getByRole('dialog',{name:translate(current)('mobile.travels'),exact:true});if(await d.isVisible())await d.getByRole('button',{name:translate(current)('close'),exact:true}).click()}
   await closeDrawer()
   for(const lang of LOCALES){
     await page.locator('.map-stage').getByRole('button',{name:translate(current)('language'),exact:true}).click()
     await page.locator('[data-language-menu]').getByRole('button').filter({hasText:lang.label}).click();current=lang.id
     const t=translate(current)
     await page.getByRole('button',{name:t('mobile.travels'),exact:true}).click()
     await page.getByRole('button',{name:t('trip.records'),exact:true}).click()
     await page.getByRole('dialog',{name:t('trip.records'),exact:true}).getByRole('button',{name:t('trip.edit'),exact:true}).click()
     const localEditor=page.getByRole('dialog',{name:t('trip.editor'),exact:true})
     assert.equal(await localEditor.getByLabel(t('trip.notes'),{exact:true}).first().inputValue(),'保留備註 · overnight connection')
     assert.equal(await localEditor.getByLabel(t('trip.notes'),{exact:true}).first().isVisible(),true)
     assert.match(await localEditor.locator('[data-flight-more]').first().innerText(),new RegExp(t('ticket.more')))
     assert.equal(await localEditor.locator('button,input,select,textarea,summary').evaluateAll(els=>els.every(e=>{if(!e.getClientRects().length)return true;const b=e.getBoundingClientRect();return b.left>=-1&&b.right<=innerWidth+1})),true)
     await localEditor.getByRole('button',{name:t('trip.close'),exact:true}).click();await closeDrawer();checks++
   }
 }
 console.log(`${width}px: ${before}px → ${h}px; compact layout, optional details, keyboard model, return, CRUD and saved content passed`)

 await context.close()
}console.log(`${checks} browser acceptance checks passed`)}catch(error){if(activePage&&!activePage.isClosed()){
 await activePage.screenshot({path:`${out}/failure-${activeWidth}.png`}).catch(()=>{})
 console.error('Viewport diagnostics:',await activePage.evaluate(()=>{const d=document.querySelector('dialog[aria-labelledby="trip-editor-title"]'),s=d?.querySelector('[data-editor-scroll]'),e=document.activeElement;return {innerHeight,viewport:{height:visualViewport.height,offsetTop:visualViewport.offsetTop},dialog:d?.getBoundingClientRect().toJSON(),scroll:{top:s?.scrollTop,height:s?.scrollHeight,client:s?.clientHeight,box:s?.getBoundingClientRect().toJSON()},active:e?.getBoundingClientRect().toJSON()}}).catch(()=>null))
 console.error('Active control:',await activePage.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')})).catch(()=>null))
}throw error}finally{await browser.close()}
