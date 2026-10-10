/** Real user CRUD + rendered pixels in isolated browser contexts, never user data. */
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{chromium,devices}=require('playwright'),sharp=require('sharp')
const url=process.env.TEST_URL||'http://127.0.0.1:3011'
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const key='globetrotter:trips:v1',ids={TW:'158',JP:'392',AE:'784',GR:'300'},samples={TW:[23.7,121],JP:[36.2,138.2],AE:[24.2,54.4],GR:[39,22]}
async function colored(buffer,color,point){
 const {data,info}=await sharp(buffer).removeAlpha().raw().toBuffer({resolveWithObject:true});let n=0
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  if(point&&(Math.abs(x-point.x)>5||Math.abs(y-point.y)>5))continue
  const i=(y*info.width+x)*info.channels,r=data[i],g=data[i+1],b=data[i+2]
  if(color==='green'?g>100&&g>r*1.4&&g>b*1.25:b>160&&b-r>80&&b-g>60)n++
 }return n
}
async function run(name,options){
 const context=await browser.newContext({...options,locale:'zh-TW'}),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(({key})=>{
  if(!localStorage.getItem('globetrotter:v1')){
   localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{statuses:{'158':'blocked','392':'wishlist','250':'visited'},notes:{'158':'保留筆記'},reviews:{'158':{rating:5,liked:'美食'}},theme:'dark',locale:'zh-TW',localePinned:true,autoSpin:false,layers:{airports:false,stations:false,ports:false}}}));localStorage.setItem('globetrotter','legacy-sentinel')
  }
  const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key&&window.failTripWrites)throw new DOMException('quota','QuotaExceededError');return original.call(this,k,v)}
  navigator.geolocation.getCurrentPosition=()=>{}
 },{key})
 await page.route(/\/api\/flight\?/,r=>r.fulfill({json:{flight:null}}))
 const editor=page.getByRole('dialog',{name:'旅行編輯',exact:true}),records=page.getByRole('dialog',{name:'我的旅行紀錄',exact:true})
 async function menu(label){if(options.isMobile&&!await page.getByRole('button',{name:label,exact:true}).isVisible())await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click();await page.getByRole('button',{name:label,exact:true}).click()}
 async function closeDrawer(){if(options.isMobile&&await page.getByRole('dialog',{name:'搜尋與我的旅行',exact:true}).isVisible())await page.getByRole('dialog',{name:'搜尋與我的旅行',exact:true}).getByRole('button',{name:'關閉',exact:true}).click()}
 async function add(code){await editor.getByRole('searchbox').fill(code);await editor.locator('li').first().getByRole('button',{name:'加入路線',exact:true}).click()}
 async function view(label){await closeDrawer();await page.getByRole('button',{name:label,exact:true}).click()}
 async function snapshotColors(){return JSON.parse(await page.locator('[data-flat-preview-colors]').getAttribute('data-saved-colors'))}
 async function check(country,color){assert.equal((await snapshotColors())[ids[country]],color==='green'?'#22c55e':'#3b82f6')}
 async function flat(country,color){
  await view('平面地圖');const path=page.locator(`path[data-country-id="${ids[country]}"]`)
  await page.waitForFunction(({id,color})=>getComputedStyle(document.querySelector(`path[data-country-id="${id}"]`)).fill===color,{id:ids[country],color:color==='green'?'rgb(34, 197, 94)':'rgb(59, 130, 246)'})
  assert.ok(await colored(await path.screenshot(),color)>=1,`${name}: actual flat ${country} ${color} pixels`)
 }
 async function globe(country,color){
  await view('地球')
  await page.waitForFunction(()=>{
   for(const el of document.querySelectorAll('*')){const key=Object.keys(el).find(k=>k.startsWith('__reactFiber$'));if(!key)continue;for(let f=el[key];f;f=f.return)if(f.ref?.current?.pointOfView){window.savedGlobe=f.ref.current;return true}}return false
  })
  await page.evaluate(([lat,lng])=>{savedGlobe.pointOfView({lat,lng,altitude:1.8},0);savedGlobe.resumeAnimation()},samples[country])
  await page.waitForTimeout(1200)
  const point=await page.evaluate(([lat,lng])=>{savedGlobe.pauseAnimation();return savedGlobe.getScreenCoords(lat,lng)},samples[country])
  const box=await page.locator('canvas').boundingBox(),scale=await page.evaluate(()=>devicePixelRatio)
  const n=await colored(await page.screenshot(),color,{x:(box.x+point.x)*scale,y:(box.y+point.y)*scale});console.log('PIXEL',name,country,{point,box,scale,n,pov:await page.evaluate(()=>savedGlobe.pointOfView())});assert.ok(n>=4,`${name}: actual globe ${country} ${color} pixels`)
  await page.evaluate(()=>savedGlobe.resumeAnimation())
 }
 let legacy
 try{
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('[data-flat-preview-colors]').waitFor({state:'attached'})
  legacy=await page.evaluate(()=>({old:localStorage.getItem('globetrotter:v1'),older:localStorage.getItem('globetrotter')}))
  await menu('建立旅行');await add('TPE');await add('KCZ');await editor.getByLabel('旅行名稱（選填）',{exact:true}).fill('日本旅行')
  assert.equal((await snapshotColors())['392'],undefined,'Unsaved route does not change committed colors')
  await page.evaluate(()=>window.failTripWrites=true);await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();await editor.getByRole('alert').waitFor()
  assert.equal((await snapshotColors())['392'],undefined,'Failed save cannot change committed footprint')
  await page.evaluate(()=>window.failTripWrites=false);await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();await editor.getByText('已儲存在此瀏覽器',{exact:true}).first().waitFor()
  await check('TW','green');await check('JP','green')
  await page.screenshot({path:`/tmp/globetrotter-stage-c-${name}-saved.png`})
  await editor.getByRole('button',{name:'關閉編輯器',exact:true}).click();await closeDrawer()
  await flat('TW','green');await flat('JP','green');assert.equal(await page.locator('[data-saved-routes] path').count(),1)
  const route=page.locator('[data-saved-routes] path').first();assert.ok((await route.getAttribute('d')).length>10);assert.equal(await route.evaluate(e=>getComputedStyle(e).pointerEvents),'none')
  await page.screenshot({path:`/tmp/globetrotter-stage-c-${name}-exit-flat.png`})
  await globe('TW','green');await globe('JP','green');assert.equal(await page.locator('[data-globe-points]').getAttribute('data-saved-arcs'),'1')
  await page.screenshot({path:`/tmp/globetrotter-stage-c-${name}-exit-globe.png`})
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-flat-preview-colors]')?.dataset.savedColors||'{}')['392']==='#22c55e')
  await flat('TW','green');await flat('JP','green');await page.screenshot({path:`/tmp/globetrotter-stage-c-${name}-reload-flat.png`})
  await globe('JP','green');await page.screenshot({path:`/tmp/globetrotter-stage-c-${name}-reload-globe.png`})
  const beforeDrag=await page.evaluate(()=>savedGlobe.pointOfView()),canvasBox=await page.locator('canvas').boundingBox()
  await page.mouse.move(canvasBox.x+canvasBox.width*.35,canvasBox.y+canvasBox.height*.4);await page.mouse.down();await page.mouse.move(canvasBox.x+canvasBox.width*.6,canvasBox.y+canvasBox.height*.4,{steps:8});await page.mouse.up();await page.waitForTimeout(300)
  assert.ok(Math.abs((await page.evaluate(()=>savedGlobe.pointOfView())).lng-beforeDrag.lng)>.1,'Saved routes do not capture or reset globe dragging')
  await check('TW','green');await check('JP','green')
  await menu('建立旅行');await add('TPE');await add('DXB');await add('ATH');await editor.getByLabel('國家停留性質 DXB',{exact:true}).selectOption('transit');await editor.getByLabel('旅行名稱（選填）',{exact:true}).fill('希臘旅行')
  await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();await editor.getByRole('button',{name:'關閉編輯器',exact:true}).click();await closeDrawer()
  await check('AE','blue');await check('TW','green');await check('GR','green')
  await flat('AE','blue');await flat('GR','green');assert.equal(await page.locator('[data-saved-routes] path').count(),3)
  await globe('AE','blue');await globe('GR','green');await page.screenshot({path:`/tmp/globetrotter-stage-c-${name}-transit.png`})
  await menu('我的旅行紀錄');const item=()=>records.locator('li').filter({has:page.getByRole('heading',{name:'希臘旅行',exact:true})})
  await item().getByRole('button',{name:'編輯',exact:true}).click();await editor.getByLabel('國家停留性質 DXB',{exact:true}).selectOption('visited')
  await check('AE','blue');await editor.getByRole('button',{name:'關閉編輯器',exact:true}).click();await check('AE','blue')
  await menu('我的旅行紀錄');page.once('dialog',d=>d.accept());await item().getByRole('button',{name:'編輯',exact:true}).click();await editor.getByLabel('國家停留性質 DXB',{exact:true}).selectOption('visited');await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();await check('AE','green');await editor.getByRole('button',{name:'關閉編輯器',exact:true}).click()
  await menu('我的旅行紀錄');page.once('dialog',d=>d.accept());await item().getByRole('button',{name:'刪除',exact:true}).click();await records.getByRole('button',{name:'關閉旅行紀錄',exact:true}).click();await closeDrawer()
  assert.equal((await snapshotColors())['784'],undefined);await check('TW','green');await check('JP','green');assert.equal(await page.locator('[data-saved-routes] path').count(),1)
  const stats=JSON.parse(await page.locator('[data-trip-statistics]').getAttribute('data-trip-statistics'));assert.deepEqual(stats,{countries:3,trips:1,flights:1})
  // Real storage event in a second tab updates committed colors without overwriting edits.
  const tab=await context.newPage();await tab.goto(url,{waitUntil:'domcontentloaded'})
  await tab.evaluate(key=>{const f=JSON.parse(localStorage.getItem(key));f.trips[0].draft.stops[1].countryPresence='transit';localStorage.setItem(key,JSON.stringify(f))},key)
  await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-flat-preview-colors]')?.dataset.savedColors||'{}')['392']==='#3b82f6');await tab.close()
  await flat('JP','blue');await globe('JP','blue')
  await menu('我的旅行紀錄');const japan=records.locator('li').filter({has:page.getByRole('heading',{name:'日本旅行',exact:true})});page.once('dialog',d=>d.accept());await japan.getByRole('button',{name:'刪除',exact:true}).click();await records.getByRole('button',{name:'關閉旅行紀錄',exact:true}).click();await closeDrawer();await view('平面地圖')
  assert.equal(await page.locator('path[data-country-id="158"]').getAttribute('fill'),'#ef4444');assert.equal(await page.locator('path[data-country-id="392"]').getAttribute('fill'),'#a855f7');assert.equal(await page.locator('path[data-country-id="250"]').getAttribute('fill'),'#22c55e');assert.equal(await page.locator('[data-saved-routes] path').count(),0)
  const current=await page.evaluate(()=>({old:localStorage.getItem('globetrotter:v1'),older:localStorage.getItem('globetrotter')}))
  // View choice is an existing persisted preference; substantive legacy records must match exactly.
  const before=JSON.parse(legacy.old).state,after=JSON.parse(current.old).state
  for(const field of ['statuses','notes','reviews'])assert.deepEqual(after[field],before[field]);assert.equal(current.older,legacy.older)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow')
  assert.deepEqual(errors,[]);console.log(`PASS ${name}: CRUD/reload/cross-tab, actual flat and WebGL green/blue pixels, stored routes, legacy preferences, statistics, quota and unsaved safety`)
 }catch(e){console.log('LAYOUT',await page.evaluate(()=>({scrollY,svg:document.querySelector('[data-flat-preview-colors] svg')?.getBoundingClientRect().toJSON(),tw:document.querySelector('path[data-country-id="158"]')?.getBoundingClientRect().toJSON(),group:document.querySelector('[data-saved-routes]')?.parentElement?.getAttribute('transform')})));await page.screenshot({path:`/tmp/globetrotter-stage-c-${name}-failure.png`}).catch(()=>{});throw e}finally{await context.close()}
}
try{
 if(!process.env.MAP_DEVICE||process.env.MAP_DEVICE==='desktop')await run('desktop',{viewport:{width:1440,height:1000}})
 const phone={...devices['iPhone 13']};delete phone.defaultBrowserType
 if(!process.env.MAP_DEVICE||process.env.MAP_DEVICE==='iphone')await run('iphone-390',phone);if(!process.env.MAP_DEVICE||process.env.MAP_DEVICE==='320')await run('mobile-320',{...phone,viewport:{width:320,height:640}})
}finally{await browser.close()}
