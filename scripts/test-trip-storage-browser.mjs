/* Isolated Chromium contexts only. This never reads the user's browser data. */
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const {chromium,devices}=createRequire(import.meta.url)('playwright')
const url=process.env.TEST_URL||'http://127.0.0.1:3005'
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const key='globetrotter:trips:v1'
async function setup(options,corrupt=false){
 const context=await browser.newContext({...options,locale:'zh-TW'}),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(({key,corrupt})=>{
  if(!localStorage.getItem('globetrotter:v1')){
   localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{statuses:{'158':'blocked','392':'wishlist','784':'visited'},notes:{'158':'保留原筆記'},reviews:{'158':{rating:5,liked:'美食',visits:['2025-10']}},theme:'dark',locale:'zh-TW',localePinned:true,autoSpin:false,layers:{airports:false,stations:false,ports:false}}}))
   localStorage.setItem('globetrotter','legacy-sentinel');if(corrupt)localStorage.setItem(key,'{broken trip data');sessionStorage.setItem('storage-test-seeded','1')
  }
  const original=Storage.prototype.setItem
  Storage.prototype.setItem=function(k,v){if(k===key&&window.failTripWrites)throw new DOMException('test quota','QuotaExceededError');return original.call(this,k,v)}
 },{key,corrupt})
 await page.route(/\/api\/flight\?/,r=>r.fulfill({json:{flight:null}}))
 await page.goto(url,{waitUntil:'domcontentloaded'})
 await page.locator('path[data-country-id="158"]').waitFor({state:'attached'})
 const legacy=await page.evaluate(()=>({old:localStorage.getItem('globetrotter:v1'),older:localStorage.getItem('globetrotter')}))
 async function menu(name){if(options.isMobile&&!await page.getByRole('button',{name,exact:true}).isVisible())await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click();await page.getByRole('button',{name,exact:true}).click()}
 const editor=page.getByRole('dialog',{name:'旅行編輯',exact:true}),records=page.getByRole('dialog',{name:'我的旅行紀錄',exact:true})
 async function add(c){await editor.getByRole('searchbox',{name:'搜尋機場',exact:true}).fill(c);await editor.locator('li').filter({has:page.getByRole('button',{name:'加入路線',exact:true})}).first().getByRole('button',{name:'加入路線',exact:true}).click()}
 async function unchanged(){assert.deepEqual(await page.evaluate(()=>({old:localStorage.getItem('globetrotter:v1'),older:localStorage.getItem('globetrotter')})),legacy)}
 return {context,page,errors,editor,records,menu,add,unchanged}
}
async function run(name,options){
 const {context,page,errors,editor,records,menu,add,unchanged}=await setup(options)
 try{
 const originals={};for(const id of ['158','392','784'])originals[id]=await page.locator(`path[data-country-id="${id}"]`).getAttribute('fill')
 await menu('建立旅行');assert.equal(await editor.getByLabel('整趟旅行狀態',{exact:true}).count(),0)
 await add('TPE');await add('DXB');await add('ATH');await editor.getByLabel('國家停留性質 DXB',{exact:true}).selectOption('transit')
 await editor.getByLabel('旅行名稱（選填）',{exact:true}).fill('台灣杜拜希臘')
 await editor.locator('fieldset').nth(0).getByLabel('航班編號',{exact:true}).fill('EK367')
 await editor.locator('fieldset').nth(1).getByLabel('備註',{exact:true}).fill('第二段獨立備註')
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),null,'Unsaved route never writes storage')
 await page.evaluate(()=>window.failTripWrites=true)
 await editor.getByRole('button',{name:'儲存旅行',exact:true}).click()
 await editor.getByRole('alert').filter({hasText:'尚未儲存'}).waitFor()
 assert.equal(await editor.getByText('已儲存在此瀏覽器',{exact:true}).count(),0,'Failed save never claims success')
 assert.equal(await editor.getByLabel('旅行名稱（選填）',{exact:true}).inputValue(),'台灣杜拜希臘');assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),null)
 await page.evaluate(()=>window.failTripWrites=false)
 const saveButton=editor.getByRole('button',{name:'儲存旅行',exact:true})
 await saveButton.click();await editor.getByText('已儲存在此瀏覽器',{exact:true}).first().waitFor();assert.equal(await saveButton.isDisabled(),true)
 const box=await saveButton.boundingBox(),viewport=page.viewportSize();assert.ok(box.y>=0&&box.y+box.height<=viewport.height+1&&box.x>=0&&box.x+box.width<=viewport.width+1,'Fixed save button remains visible after long content')
 await page.screenshot({path:`/tmp/globetrotter-storage-${name}.png`})
 let file=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(file.trips.length,1);assert.equal(file.trips[0].draft.status,'completed');assert.equal(file.trips[0].draft.legs[0].flightNumber,'EK367');assert.equal(file.trips[0].draft.legs[1].notes,'第二段獨立備註')
 await editor.getByRole('button',{name:'關閉編輯器',exact:true}).click()
 for(const [id,fill]of Object.entries(originals))assert.equal(await page.locator(`path[data-country-id="${id}"]`).getAttribute('fill'),fill,'Saving is not permanent map integration')
 await unchanged();await page.reload({waitUntil:'domcontentloaded'});await menu('我的旅行紀錄')
 const item=()=>records.locator('li').filter({has:page.getByRole('heading',{name:'台灣杜拜希臘',exact:true})})
 await item().waitFor({state:'visible'});assert.equal(await item().count(),1);await item().getByRole('button',{name:'查看',exact:true}).click()
 await records.getByRole('region',{name:'旅行詳細資料',exact:true}).getByText('去過 3 國・實際旅遊 2 國・僅轉機 1 國',{exact:true}).waitFor()
 assert.ok((await records.getByRole('region',{name:'旅行詳細資料',exact:true}).innerText()).includes('EK367'))
 await item().getByRole('button',{name:'編輯',exact:true}).click();await editor.waitFor()
 await editor.getByLabel('國家停留性質 DXB',{exact:true}).selectOption('visited')
 assert.ok((await editor.locator('#trip-preview-title').locator('..').innerText()).includes('實際旅遊 3 國'))
 file=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(file.trips[0].draft.stops[1].countryPresence,'transit','Editing is copy-on-write')
 await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();file=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(file.trips.length,1);assert.equal(file.trips[0].draft.stops[1].countryPresence,'visited')
 // Another tab changes the stored record while this editing copy remains open.
 await editor.getByLabel('旅行名稱（選填）',{exact:true}).fill('尚未儲存修改')
 const tab=await context.newPage();await tab.goto(url,{waitUntil:'domcontentloaded'})
 await tab.evaluate(k=>{const f=JSON.parse(localStorage.getItem(k));f.trips[0].draft.title='另一分頁';localStorage.setItem(k,JSON.stringify(f))},key)
 await page.waitForTimeout(100)
 await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();await editor.getByRole('alert').filter({hasText:'另一個分頁'}).waitFor()
 assert.equal(await editor.getByLabel('旅行名稱（選填）',{exact:true}).inputValue(),'尚未儲存修改');assert.equal(await editor.getByText('已儲存在此瀏覽器',{exact:true}).count(),0)
 assert.equal((await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key)).trips[0].draft.title,'另一分頁');await tab.close()
 await editor.getByRole('button',{name:'關閉編輯器',exact:true}).click();await menu('我的旅行紀錄')
 const current=records.locator('li').filter({has:page.getByRole('heading',{name:'另一分頁',exact:true})})
 page.once('dialog',d=>d.dismiss());await current.getByRole('button',{name:'刪除',exact:true}).click();assert.equal(await current.count(),1,'Cancel deletion keeps trip')
 page.once('dialog',d=>d.accept());await current.getByRole('button',{name:'刪除',exact:true}).click();await records.getByText('目前沒有已儲存的旅行。',{exact:true}).waitFor()
 assert.equal((await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key)).trips.length,0)
 await records.getByRole('button',{name:'關閉旅行紀錄',exact:true}).click();await page.reload({waitUntil:'domcontentloaded'});await menu('我的旅行紀錄');await records.getByText('目前沒有已儲存的旅行。',{exact:true}).waitFor()
 await unchanged();assert.deepEqual(errors,[]);console.log(`PASS ${name}: save/reload/view/edit/delete, quota failure, stale-tab protection, legacy bytes, unchanged map, visible save button`)
 }catch(e){await page.screenshot({path:`/tmp/globetrotter-storage-${name}-failure.png`}).catch(()=>{});throw e}finally{await context.close()}
}
async function damaged(){
 const {context,page,editor,records,menu,add,unchanged,errors}=await setup({viewport:{width:1100,height:720}},true)
 try{
 await menu('我的旅行紀錄');await records.getByRole('alert').filter({hasText:'資料損壞'}).waitFor();await records.getByRole('button',{name:'關閉旅行紀錄',exact:true}).click()
 await menu('建立旅行');await add('TPE');await add('KCZ');assert.equal(await editor.getByRole('button',{name:'儲存旅行',exact:true}).isDisabled(),true)
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),'{broken trip data');await unchanged();assert.deepEqual(errors,[])
 console.log('PASS damaged storage: bytes preserved; writes blocked; no false empty/success state')
 }finally{await context.close()}
}
try{
 await run('desktop',{viewport:{width:1440,height:1000}})
 const phone={...devices['iPhone 13']};delete phone.defaultBrowserType
 await run('iphone',phone);await run('mobile-320',{...phone,viewport:{width:320,height:640}});await damaged()
}finally{await browser.close()}
