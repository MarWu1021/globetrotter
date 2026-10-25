/** UI regression in a production build: isolated synthetic account/API, real SVG and WebGL. */
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {attachRenderer,savedCountryFrame} from './browser-globe-render.mjs'
const require=createRequire(import.meta.url),{chromium}=require('playwright'),sharp=require('sharp')
const origin=process.env.TEST_URL||'http://127.0.0.1:3080'
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
let groups=0
try{for(const [width,height] of [[1440,900],[390,844],[320,740]]){
 const context=await browser.newContext({viewport:{width,height},locale:'zh-TW',reducedMotion:'reduce',isMobile:width<768,hasTouch:width<768,deviceScaleFactor:width<768?2:1,serviceWorkers:'block'})
 const page=await context.newPage(),errors=[],rows=new Map(),user={id:'00000000-0000-0000-0000-000000000001',email:'browser-test@example.invalid'}
 page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message))
 await context.addInitScript(()=>{
  navigator.geolocation.getCurrentPosition=()=>{}
  localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{locale:'zh-TW',localePinned:true,view:'map',autoSpin:false,statuses:{'250':'wishlist'},notes:{'250':'UNTOUCHED TEST FIXTURE'}}}))
  localStorage.setItem('globetrotter:trips:v1','DO NOT IMPORT TEST FIXTURE')
 })
 await context.route('**/auth/session',r=>r.fulfill({json:{user},headers:{'Cache-Control':'private, no-store'}}))
 await context.route('**/api/account**',r=>{
  const request=r.request(),reply=result=>r.fulfill({json:{userId:user.id,result},headers:{'Cache-Control':'private, no-store'}})
  if(request.method()==='GET')return reply({ok:true,value:new URL(request.url()).searchParams.get('kind')==='trips'?[...rows.values()]:[]})
  const body=request.postDataJSON(),c=body.command,old=rows.get(c.id)
  if(body.operation!=='save-trip')return reply({ok:false,error:'invalid'})
  if((old?.revision??null)!==c.expectedRevision)return reply({ok:false,error:'conflict'})
  const now=new Date().toISOString(),record={draft:c.draft,revision:(old?.revision??0)+1,createdAt:old?.createdAt??now,updatedAt:now}
  rows.set(c.id,record);return reply({ok:true,value:record})
 })
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('[data-world-ui]').waitFor()
 if(width<768)await page.getByRole('button',{name:'新增一趟旅行',exact:true}).click()
 else await page.getByRole('button',{name:'建立旅行',exact:true}).click()
 const editor=page.getByRole('dialog',{name:'旅行編輯',exact:true});await editor.waitFor()
 await editor.getByLabel('旅行名稱（選填）',{exact:true}).fill('隔離瀏覽器測試旅行')
 for(const code of ['TPE','DXB','ATH']){
  if(!await editor.getByRole('searchbox').isVisible())await editor.locator('summary#trip-search-title').click();await editor.getByRole('searchbox').fill(code)
  await editor.locator('li').filter({has:page.getByRole('button',{name:'加入路線',exact:true})}).filter({hasText:code}).first().getByRole('button',{name:'加入路線',exact:true}).click()
 }
 await editor.getByLabel('國家停留性質 DXB',{exact:true}).selectOption('transit')
 const save=editor.getByRole('button',{name:'儲存旅行',exact:true}),saveBox=await save.boundingBox()
 assert.ok(saveBox.y+saveBox.height<=height,'Save button remains clear of mobile navigation')
 await save.click();await editor.waitFor({state:'hidden'})
 await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-trip-statistics]')?.dataset.tripStatistics||'{}').trips===1)
 assert.deepEqual(JSON.parse(await page.locator('[data-trip-statistics]').getAttribute('data-trip-statistics')),{countries:3,trips:1,flights:2})
 // The successful-save notice dismisses itself. Capture the settled page
 // instead of racing its unmount with a decorative screenshot-only click.
 await page.locator('[data-journey-notice]').waitFor({state:'hidden'})
 groups++
 await page.getByRole('button',{name:'地球',exact:true}).click();await attachRenderer(page);await savedCountryFrame(page,[26,78])
 assert.deepEqual(JSON.parse(await page.locator('[data-globe-points]').getAttribute('data-saved-colors')),{'158':'#6F9E91','784':'#8BB6CE','300':'#6F9E91'})
 const canvas=page.locator('[data-globe-points] canvas'),rect=await canvas.boundingBox()
 assert.ok(rect.height>=height*.55,'Map keeps most of the screen')
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('[data-travel-decoration]')].every(e=>getComputedStyle(e).pointerEvents==='none'&&e.getAttribute('aria-hidden')==='true')),true)
 await page.screenshot({path:`/tmp/globetrotter-isometric-home-globe-${width}.png`,timeout:60000})
 // Actual pointer input, not only calling pointOfView().
 await page.evaluate(()=>window.checkedGlobe.resumeAnimation())
 const initial=await page.evaluate(()=>window.checkedGlobe.pointOfView())
 const center={x:rect.x+rect.width/2,y:rect.y+rect.height/2}
 assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName==='CANVAS',center),true)
 await page.mouse.move(center.x,center.y);await page.mouse.down();await page.mouse.move(center.x+42,center.y+18,{steps:6});await page.mouse.up()
 await page.waitForFunction(lng=>Math.abs(window.checkedGlobe.pointOfView().lng-lng)>2,initial.lng)
 const altitude=await page.evaluate(()=>window.checkedGlobe.pointOfView().altitude)
 if(width>=768){await page.mouse.wheel(0,-180)}else{
  const cdp=await context.newCDPSession(page)
  const points=distance=>[{x:center.x-distance,y:center.y,id:1},{x:center.x+distance,y:center.y,id:2}]
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(22)})
  for(const d of [28,35,42,50])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(d)})
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach()
 }
 await page.waitForFunction(alt=>window.checkedGlobe.pointOfView().altitude<alt,altitude)
 groups++
 await page.getByRole('button',{name:'平面地圖',exact:true}).click()
 // The SVG stays mounted beneath the globe. Its colour data alone does not
 // prove the user can see it: wait for the visible map and active mode too.
 await page.locator('[data-flat-preview-colors] > svg').waitFor({state:'visible'})
 await page.locator('[data-globe-points]').waitFor({state:'detached'})
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='平面地圖')?.classList.contains('font-semibold'))
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('path[data-country-id="158"]')).fill==='rgb(111, 158, 145)'&&getComputedStyle(document.querySelector('path[data-country-id="784"]')).fill==='rgb(139, 182, 206)')
 assert.equal(await page.locator('[data-saved-routes] path').count()>0,true)
 const visibleRoutes=await page.locator('[data-saved-routes] path').evaluateAll(paths=>paths.filter(path=>{
  const box=path.getBoundingClientRect(),style=getComputedStyle(path)
  return path.getTotalLength()>1&&style.stroke!=='none'&&Number(style.strokeOpacity)>0&&box.right>0&&box.left<innerWidth&&box.bottom>0&&box.top<innerHeight
 }).length)
 assert.ok(visibleRoutes>=2,'Both saved flight legs have visible SVG strokes and geometry')
 // On a software GPU, the compositor may still hold the previous SVG surface
 // after its DOM becomes visible. Confirm actual pixels on both route strokes
 // before saving the design screenshot, rather than using an arbitrary delay.
 const deadline=Date.now()+20000
 let painted=false
 while(Date.now()<deadline){
  const points=await page.locator('[data-saved-routes] path').evaluateAll(paths=>paths.map(p=>{
   const q=p.getPointAtLength(p.getTotalLength()*.5),point=new DOMPoint(q.x,q.y).matrixTransform(p.getScreenCTM())
   return {x:point.x,y:point.y}
  }).filter(p=>p.x>3&&p.x<innerWidth-3&&p.y>3&&p.y<innerHeight-3))
  const screenshot=await page.screenshot({timeout:60000}),{data,info}=await sharp(screenshot).removeAlpha().raw().toBuffer({resolveWithObject:true}),scale=info.width/width
  if(points.length>=2&&points.every(p=>{
   const x=Math.round(p.x*scale),y=Math.round(p.y*scale);let hits=0
   for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
    const index=((y+dy)*info.width+x+dx)*info.channels
    if(Math.hypot(data[index]-94,data[index+1]-125,data[index+2]-143)<28)hits++
   }
   return hits>=3
  })){
   await writeFile(`/tmp/globetrotter-isometric-home-map-${width}.png`,screenshot);painted=true;break
  }
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)))
 }
 assert.ok(painted,'Both route strokes are present in the actual 2D screenshot pixels')
 for(const control of await page.locator('[data-map-zoom] button, [data-layer-control] button').all()){
  const b=await control.boundingBox();assert.ok(b.height>=44&&b.x>=0&&b.x+b.width<=width)
  assert.equal(await control.evaluate(el=>{
   const b=el.getBoundingClientRect()
   return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('button')===el
  }),true,'Every zoom and layer control has an unobstructed touch target')
 }
 if(width<768){
  for(const button of await page.locator('[data-mobile-navigation] button').all()){
   const b=await button.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width&&b.y+b.height<=height&&b.height>=44)
  }
  assert.equal(await page.locator('.travel-sidebar [data-travel-decoration="village"]').isVisible(),false)
  await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click()
  await page.screenshot({path:`/tmp/globetrotter-isometric-mobile-menu-${width}.png`})
  await page.getByRole('dialog',{name:'搜尋與我的旅行',exact:true}).getByRole('button',{name:'關閉',exact:true}).click()
 }
 groups++
 await page.locator('path[data-country-id="158"]').first().dispatchEvent('click')
 await page.locator('[data-country-panel]').waitFor();await page.locator('[data-country-panel]').getByRole('button',{name:'關閉',exact:true}).click()
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 const legacy=await page.evaluate(()=>JSON.parse(localStorage.getItem('globetrotter:v1')).state)
 assert.deepEqual(legacy.statuses,{'250':'wishlist'});assert.equal(legacy.notes['250'],'UNTOUCHED TEST FIXTURE')
 assert.equal(await page.evaluate(()=>localStorage.getItem('globetrotter:trips:v1')),'DO NOT IMPORT TEST FIXTURE')
 assert.deepEqual(errors,[]);groups++
 console.log(`PASS ${width}px: save/footprints, real globe drag/zoom, 2D colours/routes, safe controls/navigation, country panel/legacy isolation`)
 await context.close()
}
console.log(`PASS ${groups} isometric main UI groups; simulated cloud, real browser/SVG/WebGL`)
}finally{await browser.close()}
