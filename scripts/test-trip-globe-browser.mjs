import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const {chromium,devices}=createRequire(import.meta.url)('playwright')
const url=process.env.TEST_URL||'http://127.0.0.1:3005'
async function run(browser,name,options){
 const context=await browser.newContext({...options,locale:'zh-TW'}),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{statuses:{'158':'visited','392':'wishlist','300':'blocked'},notes:{'158':'原筆記'},reviews:{'158':{rating:5}},theme:'dark',locale:'zh-TW',localePinned:true,autoSpin:true,zoomLocked:false,southUp:false,layers:{airports:true,stations:false,ports:false}}})))
 await page.route(/\/api\/plane-info\?/,route=>route.fulfill({json:{}}))
 await page.route(/\/api\/flight\?/,route=>route.fulfill({json:{flight:{id:'live-fixture',callsign:'LIVE123',country:'AE',lat:25.25,lng:55.37,heading:90,speedKmh:800,altKm:10}}}))
 try{
  await page.goto(url,{waitUntil:'domcontentloaded'})
  if(options.isMobile) await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click()
  else await page.getByRole('button',{name:'地球',exact:true}).click()
  // The original airport layer remains visible with auto-spin enabled.
  if(!options.isMobile) await page.waitForFunction(()=>Number(document.querySelector('[data-globe-points]')?.dataset.globePoints)>1000)
  const baseline=await page.evaluate(()=>localStorage.getItem('globetrotter:v1'))
  await page.getByRole('button',{name:'建立旅行',exact:true}).click()
  const editor=page.getByRole('dialog',{name:'旅行編輯',exact:true})
  await editor.waitFor()
  async function search(q){await editor.getByRole('searchbox',{name:'搜尋機場',exact:true}).fill(q);return editor.locator('li').filter({has:page.getByRole('button',{name:'加入路線',exact:true})}).first()}
  await (await search('TPE')).getByRole('button',{name:'加入路線',exact:true}).click()
  await (await search('DXB')).getByRole('button',{name:'在地球上查看',exact:true}).click()
  await page.locator('[data-airport-code="DXB"]').waitFor({state:'visible'})
  const globe=page.locator('[data-globe-points]')
  await page.waitForFunction(()=>Number(document.querySelector('[data-globe-points]')?.dataset.globePoints)>0)
  assert.ok(Number(await globe.getAttribute('data-globe-points'))<=(options.isMobile?16:48))
  // A real pointer drag changes the globe but does not append any draft stops.
  const canvas=page.locator('canvas').first(),box=await canvas.boundingBox()
  await page.mouse.move(box.x+box.width*.3,box.y+box.height*.25);await page.mouse.down();await page.mouse.move(box.x+box.width*.45,box.y+box.height*.3,{steps:6});await page.mouse.up()
  assert.equal(await page.locator('[data-testid="airport-confirmation"]').count(),0)
  await page.waitForFunction(()=>Number(document.querySelector('[data-globe-points]')?.dataset.globePoints)>0)
  await page.getByRole('button',{name:'返回編輯器',exact:true}).click()
  assert.equal(await editor.locator('fieldset').count(),0,'Dragging did not add a stop')
  await editor.locator('li').filter({hasText:'DXB'}).getByRole('button',{name:'在地球上查看',exact:true}).click()
  const marker=page.locator('[data-airport-code="DXB"]')
  await marker.waitFor({state:'visible'});
  if(options.isMobile){await marker.click({trial:true});const b=await marker.boundingBox();await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2)}else await marker.click()
  await page.locator('[data-testid="airport-confirmation"]').waitFor()
  assert.match(await page.locator('[data-testid="airport-confirmation"]').innerText(),/^DXB/)
  await page.getByRole('button',{name:'確認加入機場',exact:true}).click()
  await page.getByRole('button',{name:'返回編輯器',exact:true}).click()
  assert.equal(await editor.locator('fieldset').count(),1)
  await (await search('ATH')).getByRole('button',{name:'加入路線',exact:true}).click()
  await editor.getByLabel('國家停留性質 DXB',{exact:true}).selectOption('transit')
  await editor.getByRole('button',{name:'在地球上選取機場',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('[data-preview-arcs]')?.dataset.previewArcs==='2')
  assert.deepEqual(JSON.parse(await globe.getAttribute('data-preview-colors')),{'158':'#22c55e','300':'#22c55e','784':'#3b82f6'},'New trips preview completed travel by default')
  assert.equal(await page.evaluate(()=>localStorage.getItem('globetrotter:trips:v1')),null,'Airport picking and color preview do not save a trip')
  await page.getByRole('button',{name:'返回編輯器',exact:true}).click()
  assert.equal(await editor.getByLabel('整趟旅行狀態',{exact:true}).count(),0,'Completed trips need no status selector')
  // Locate Dubai so both route segments are near the visible hemisphere.
  await (await search('DXB')).getByRole('button',{name:'在地球上查看',exact:true}).click()
  await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-preview-colors]')?.dataset.previewColors||'{}')['158']==='#22c55e')
  assert.deepEqual(JSON.parse(await globe.getAttribute('data-preview-colors')),{'158':'#22c55e','300':'#22c55e','784':'#3b82f6'})
  await page.locator('[data-airport-code="DXB"]').waitFor({state:'visible'})
  assert.ok(await page.locator('.plane-hit[title*="LIVE123"]').count()>0,'Visible live plane remains independent of the two draft arcs')
  const elapsed=await page.evaluate(()=>new Promise(resolve=>{const times=[],start=performance.now();function tick(t){times.push(t);if(t-start<1500)requestAnimationFrame(tick);else resolve({frames:times.length,elapsed:t-start})}requestAnimationFrame(tick)}))
  const viewport=page.viewportSize(),panel=await page.getByRole('region',{name:'在地球上選取機場',exact:true}).boundingBox()
  assert.ok(panel.width<=viewport.width&&panel.height<viewport.height*.65)
  await page.screenshot({path:`/tmp/globetrotter-3b-${name}.png`})
  assert.equal(await page.evaluate(()=>localStorage.getItem('globetrotter:v1')),baseline)
  await page.getByRole('button',{name:'離開旅行預覽',exact:true}).click()
  if(options.isMobile) await page.getByRole('button',{name:'平面地圖',exact:true}).click()
  else {await page.getByRole('button',{name:'平面地圖',exact:true}).click();assert.ok(await page.locator('svg').count()>0)}
  assert.equal(await page.locator('[data-preview-arcs]').count(),0,'Leaving globe unmounts its preview renderer')
  assert.deepEqual(errors,[])
  console.log(`PASS ${name}: mixed search/globe, confirmed taps, drag guard, auto-spin recovery, two arcs, colors, unchanged storage, flat map; RAF ~${(elapsed.frames/elapsed.elapsed*1000).toFixed(1)} fps`)
 }catch(e){await page.screenshot({path:`/tmp/globetrotter-3b-${name}-failure.png`}).catch(()=>{});throw e}finally{await context.close()}
}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
try{if(process.env.BROWSER_CASE!=='iphone')await run(browser,'desktop',{viewport:{width:1440,height:1000}});const phone={...devices['iPhone 13']};delete phone.defaultBrowserType;await run(browser,'iphone',phone)}finally{await browser.close()}
