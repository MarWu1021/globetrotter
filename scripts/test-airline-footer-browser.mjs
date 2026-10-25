/** Local production UI + mock account transport. Never authenticates to Google or writes Supabase. */
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const {chromium}=createRequire(import.meta.url)('playwright')
const base=process.env.TEST_URL||'http://127.0.0.1:3201'
const out=process.env.SCREENSHOT_DIR||'/tmp/globetrotter-airline-final-check'
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
 const input=cards.first().getByLabel('航空公司',{exact:true})

 async function geometry(button){return button.evaluate(e=>{
   const d=e.closest('dialog'),scroller=d.querySelector('[data-editor-scroll]').getBoundingClientRect(),footer=d.querySelector('[data-editor-footer]').getBoundingClientRect(),b=e.getBoundingClientRect(),menu=e.closest('[role=listbox]'),m=menu.getBoundingClientRect()
   return {option:b.toJSON(),scroller:scroller.toJSON(),footer:footer.toJSON(),list:m.toJSON(),side:menu.dataset.side,
    hit:e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),
    fits:b.left>=0&&b.right<=innerWidth&&b.top>=Math.max(scroller.top,m.top)&&b.bottom<=Math.min(scroller.bottom,footer.top,m.bottom)}
 })}
 async function position(where){
  await input.evaluate((e,where)=>{const s=e.closest('dialog').querySelector('[data-editor-scroll]'),b=s.getBoundingClientRect(),r=e.getBoundingClientRect()
   const y=where==='upper'?b.top+16:where==='middle'?b.top+(b.height-r.height)/2:b.bottom-r.height-16
   s.scrollTop+=r.top-y
  },where)
 }
 for(const keyboard of (width<768?[false,true]:[false])){
  if(keyboard){
   await input.focus();await page.evaluate(()=>window.setTestEditorViewport(410,12))
   await page.waitForFunction(()=>Math.abs(document.querySelector('dialog[open][aria-labelledby="trip-editor-title"]').getBoundingClientRect().height-410)<1)
   await ed.locator('[data-editor-footer]').evaluate(e=>e.style.setProperty('--editor-safe-bottom','34px'))
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-editor-footer]')).paddingBottom==='46px')
  }
  for(const where of ['upper','middle','near-footer']){
   await input.fill('Swiss');await position(where)
   const option=ed.getByRole('option').filter({hasText:'Swiss International Air Lines'}).getByRole('button')
   await option.waitFor({state:'visible'})
   await page.waitForFunction(({where})=>{const menu=document.querySelector('[data-airline-menu]'),d=menu?.closest('dialog'),s=d?.querySelector('[data-editor-scroll]'),f=d?.querySelector('[data-editor-footer]');if(!menu||!s||!f)return false;const m=menu.getBoundingClientRect(),b=s.getBoundingClientRect(),input=d.querySelector('input[role=combobox]').getBoundingClientRect();return m.height>0&&m.top>=b.top&&m.bottom<=Math.min(b.bottom,f.getBoundingClientRect().top)&& (where!=='near-footer'||menu.dataset.side==='up') && (where!=='upper'||menu.dataset.side==='down') && (menu.dataset.side==='up'?m.bottom<=input.top:m.top>=input.bottom)}, {where})
   const actual=await geometry(option)
   fs.writeFileSync(`${out}/airline-${width}-${keyboard?'keyboard-safe':'normal'}-${where}.json`,JSON.stringify(actual,null,2))
   await page.screenshot({path:`${out}/airline-${width}-${keyboard?'keyboard-safe':'normal'}-${where}.png`})
   assert.equal(actual.fits,true);assert.equal(actual.hit,true)
   await (width<768?option.tap():option.click());assert.equal(await input.inputValue(),'LX · Swiss International Air Lines')
   assert.equal(await input.getAttribute('title'),'LX · Swiss International Air Lines')
   assert.equal(await input.evaluate(e=>document.activeElement===e),true,'Selection keeps the combobox focus')
   assert.equal(await ed.evaluate(e=>e.scrollWidth<=e.clientWidth),true);checks++
  }
  // Multiple long options must be reachable by internal scrolling, including
  // when both directions have less room than the full result set.
  await input.fill('Air');await page.waitForFunction(()=>document.querySelectorAll('[data-airline-menu] [role=option]').length>1);await position('middle')
  const list=ed.getByRole('listbox',{name:'符合的航空公司',exact:true})
  await list.waitFor({state:'visible'})
  const options=list.getByRole('option');await page.waitForFunction(input=>{const l=document.getElementById(input.getAttribute('aria-controls'));return input.value==='Air'&&input.getAttribute('aria-expanded')==='true'&&l&&getComputedStyle(l).visibility==='visible'&&l.querySelectorAll('[role=option]').length>1},await input.elementHandle());assert.ok(await options.count()>1)
  const last=options.last().getByRole('button'),expected=(await last.innerText()).trim()
  await last.evaluate(e=>{const l=e.closest('[role=listbox]');l.scrollTop=l.scrollHeight})
  await page.waitForFunction(()=>{const m=document.querySelector('[data-airline-menu]'),b=m?.querySelector('li:last-child button');if(!b)return false;const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})
  assert.equal((await geometry(last)).hit,true,'Last internally scrolled result is clickable')
  await (width<768?last.tap():last.click());assert.ok((await input.inputValue()).startsWith(expected.slice(0,2)));checks++
  if(keyboard){
    await ed.locator('[data-editor-footer]').evaluate(e=>e.style.removeProperty('--editor-safe-bottom'))
    await page.evaluate(()=>window.setTestEditorViewport(innerHeight,0))
    await page.waitForFunction(()=>document.querySelector('dialog[aria-labelledby="trip-editor-title"]').style.getPropertyValue('--editor-viewport-height')===`${innerHeight}px`)
  }
 }
 await input.fill('Air');await page.waitForFunction(()=>document.querySelectorAll('[data-airline-menu] [role=option]').length>1);await input.press('ArrowDown');await input.press('ArrowDown');await input.press('ArrowUp')
 const selectedId=await input.getAttribute('aria-activedescendant');assert.ok(selectedId)
 const selected=ed.locator(`[id="${selectedId}"]`);assert.equal(await selected.getAttribute('aria-selected'),'true')
 const chosen=(await selected.innerText()).slice(0,2);await input.press('Enter');assert.ok((await input.inputValue()).startsWith(chosen))
 await input.fill('Swiss');await input.press('Escape');assert.equal(await ed.getByRole('listbox').count(),0)
 assert.equal(await input.evaluate(e=>document.activeElement===e),true);checks++
 // Open popup follows a real viewport resize, not only our keyboard model.
 await input.fill('Swiss');await input.press('ArrowDown');await page.setViewportSize({width,height:700})
 await page.evaluate(()=>window.setTestEditorViewport(innerHeight,0))
 await position('near-footer')
 const moved=ed.getByRole('option').filter({hasText:'Swiss International Air Lines'}).getByRole('button')
 await moved.waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('[data-airline-menu]')?.dataset.side==='up')
 assert.equal((await geometry(moved)).hit,true);await (width<768?moved.tap():moved.click());checks++
 await page.setViewportSize({width,height:844});await page.evaluate(()=>window.setTestEditorViewport(innerHeight,0))
 const more=cards.last().locator('[data-flight-more]');await more.locator('summary').click()
 const notes=cards.last().getByLabel('備註',{exact:true});await notes.fill('Final-field visibility check')
 await notes.evaluate(e=>{const s=e.closest('dialog').querySelector('[data-editor-scroll]');s.scrollTop=s.scrollHeight})
 const end=await notes.evaluate(e=>{const b=e.getBoundingClientRect(),f=e.closest('dialog').querySelector('[data-editor-footer]').getBoundingClientRect();return {bottom:b.bottom,footerTop:f.top}})
 assert.ok(end.bottom<=end.footerTop);checks++
 await ed.getByRole('button',{name:'儲存旅行',exact:true}).click();await ed.waitFor({state:'hidden'})
 assert.equal(rows[0].draft.legs[0].airline,'LX · Swiss International Air Lines')
 assert.equal(rows[0].draft.legs[1].notes,'Final-field visibility check')
 assert.deepEqual(errors,[]);checks++
 console.log(`PASS ${width}px: upper/middle/footer, Swiss clicks, internal scroll, keyboard/safe-area, resize, focus and saved value`)
 await context.close()
}console.log(`${checks} airline/footer scenario groups passed`)}catch(error){if(activePage&&!activePage.isClosed())console.error('COMBO DIAGNOSTICS',await activePage.evaluate(()=>({fields:[...document.querySelectorAll('input[role=combobox]')].map(e=>({value:e.value,expanded:e.getAttribute('aria-expanded'),controls:e.getAttribute('aria-controls')})),menus:[...document.querySelectorAll('[data-airline-menu]')].map(e=>({id:e.id,options:e.children.length,visible:getComputedStyle(e).visibility,text:e.textContent}))})).catch(()=>null));if(activePage&&!activePage.isClosed())await activePage.screenshot({path:`${out}/failure-${activeWidth}.png`}).catch(()=>{});throw error}finally{await browser.close()}
