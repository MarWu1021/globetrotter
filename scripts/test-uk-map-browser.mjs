/** Actual SVG/WebGL render regression. Account and session endpoints are doubles. */
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {attachRenderer,savedCountryFrame} from './browser-globe-render.mjs'
import {flatFocusDiagnostics} from './browser-flat-diagnostics.mjs'
const native=createRequire(import.meta.url),{chromium}=native('playwright'),sharp=native('sharp')
const url=process.env.TEST_URL||'http://127.0.0.1:3050',ids=['826-eng','826-sco','826-wal','826-nir']
const names={'826-eng':'英格蘭','826-sco':'蘇格蘭','826-wal':'威爾斯','826-nir':'北愛爾蘭'}
const points={'826-eng':[52,-1],'826-sco':[57,-4],'826-wal':[52,-4],'826-nir':[54.6,-6.5]}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const {geoMercator,geoCentroid}=native('d3-geo'),subunits=JSON.parse(fs.readFileSync('src/data/subunits.json'))
let groups=0,currentPage=null,currentTarget=null,currentBase=null,currentId=null
try{for(const width of [1280,390,320]){
 const context=await browser.newContext({viewport:{width,height:850},locale:'zh-TW',isMobile:width<768,hasTouch:width<768,deviceScaleFactor:width<768?2:1,serviceWorkers:'block'})
 const page=await context.newPage(),errors=[];currentPage=page;page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(60000);page.on('pageerror',e=>errors.push(e.message))
 await context.addInitScript(()=>{
  localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{locale:'zh-TW',localePinned:true,autoSpin:false,statuses:{'826-eng':'visited'},layers:{airports:false,stations:false,ports:false}}}))
  navigator.geolocation.getCurrentPosition=()=>{}
 })
 await context.route('**/auth/session',r=>r.fulfill({json:{user:{id:'uk-fixture',email:'uk@example.invalid'}}}))
 await context.route('**/api/account**',r=>r.fulfill({json:{userId:'uk-fixture',result:{ok:true,value:[]}}}))
 await context.route('**/api/flight?**',r=>r.fulfill({json:{flight:null}}))
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('.map-stage').waitFor()
 await page.getByRole('button',{name:'平面地圖',exact:true}).click()
 await page.locator('path[data-country-id="826-eng"]').first().waitFor()
 // Every rendered country including each UK constituent uses the same default.
 const fills=await page.locator('path[data-country-id]').evaluateAll(a=>a.map(p=>({id:p.dataset.countryId,fill:p.getAttribute('fill')})))
 for(const f of fills)assert.equal(f.fill,'#D8E0E3',f.id)
 for(const id of ids){
  currentId=id;currentTarget=null;currentBase=null
  console.log('SVG FOCUS',width,id,page.url())
  // At global zoom tiny regions can be entirely anti-aliased coastline. Use
  // the normal country search/focus interaction before sampling inland fill.
  if(width<768)await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click()
  await page.getByRole('textbox',{name:'搜尋國家',exact:true}).fill(names[id])
  await page.getByRole('button',{name:new RegExp(names[id])}).first().waitFor({state:'attached'})
  assert.equal(await page.getByRole('textbox',{name:'搜尋國家',exact:true}).count(),1,'Results must not change the accessible input name')
  await page.evaluate(() => {
   window.flatFocusTrace=[]
   let last='',remaining=240
   const tick=()=>{
    const svg=document.querySelector('[data-flat-preview-colors] > svg')
    if(!svg)return
    const z=svg.__zoom,state={k:z?.k,x:z?.x,y:z?.y,width:svg.getAttribute('width'),height:svg.getAttribute('height')}
    const key=JSON.stringify(state)
    if(key!==last){window.flatFocusTrace.push({time:performance.now(),...state});last=key}
    for(const [id,t] of Object.entries(svg.__transition??{}))if(!t.ukDiagnostic){
     t.ukDiagnostic=true;t.on.on('interrupt.ukDiagnostic',()=>window.flatFocusTrace.push({event:'interrupt',id,time:performance.now(),stack:new Error().stack}))
     t.on.on('end.ukDiagnostic',()=>window.flatFocusTrace.push({event:'end',id,time:performance.now()}))
    }
    if(--remaining>0)requestAnimationFrame(tick)
   };requestAnimationFrame(tick)
  })
  let resizedHeight=null
  if(id===ids[0]){
   resizedHeight=await page.evaluate(()=>{
    const svg=document.querySelector('[data-flat-preview-colors] > svg'),stage=svg.parentElement.parentElement.parentElement
    const height=Number(svg.getAttribute('height'))-6
    // Observe d3's actual zoom write, not a later RAF that might run after
    // the transition has ended on a busy software-rendered browser.
    let zoom=svg.__zoom
    Object.defineProperty(svg,'__zoom',{configurable:true,get:()=>zoom,set:value=>{
     zoom=value
     const states=Object.values(svg.__transition??{}).map(t=>t.state)
     if(value.k>1.01&&states.some(state=>state>=3&&state<=5)){
      Object.defineProperty(svg,'__zoom',{configurable:true,writable:true,value})
      stage.style.flex='none';stage.style.height=height+'px'
      window.flatFocusTrace.push({event:'controlled-resize',time:performance.now(),k:value.k,height,states})
     }
    }});return height
   })
  }
  await page.getByRole('textbox',{name:'搜尋國家',exact:true}).press('Enter')
  if(resizedHeight!==null)await page.waitForFunction(height=>Number(document.querySelector('[data-flat-preview-colors] > svg')?.getAttribute('height'))===height,resizedHeight)
  const size=await page.locator('[data-flat-preview-colors] > svg').evaluate(s=>({width:+s.getAttribute('width'),height:+s.getAttribute('height')}))
  const project=geoMercator().scale(size.width/(2*Math.PI)).translate([size.width/2,size.height/2])
  const center=project(geoCentroid(subunits.find(s=>s.id===id).geometry)),target={x:size.width/2-2.5*center[0],y:size.height/2-2.5*center[1]}
  currentTarget=target;currentBase=project([points[id][1],points[id][0]])
  await page.waitForFunction(target=>{const z=document.querySelector('[data-flat-preview-colors] > svg')?.__zoom;return z&&Math.abs(z.k-2.5)<1e-6&&Math.abs(z.x-target.x)<1e-6&&Math.abs(z.y-target.y)<1e-6},target,{timeout:30000})
  fs.writeFileSync(`/tmp/globetrotter-uk-focus-${width}-${id}.json`,JSON.stringify({id,size,target,trace:await page.evaluate(()=>window.flatFocusTrace)},null,2))
  if(resizedHeight!==null){
   assert.equal(await page.evaluate(()=>window.flatFocusTrace.some(e=>e.event==='controlled-resize'&&e.states.some(state=>state>=3&&state<=5))),true,'Resize was triggered during an active d3 transition')
   groups++;console.log(`PASS ${width}px: resizing during country focus still reaches exact 2.5 and current centroid`)
  }
  await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'儲存國家紀錄',exact:true}).waitFor({state:'detached'})
  const base=currentBase
  const at=await page.waitForFunction(({id,base,target})=>{
   const svg=document.querySelector('[data-flat-preview-colors] > svg'),svgBox=svg.getBoundingClientRect()
   if(svg.__transition)return false
   for(const p of document.querySelectorAll(`path[data-country-id="${id}"]`)){
    const matrix=p.getScreenCTM()
    // SVG DOMMatrix stores Float32 values (observed error ~7e-6 CSS px).
    // Accept <0.001 CSS px; this is far below one screenshot pixel at DPR 2.
    if(Math.abs(matrix.a-2.5)>.001||Math.abs(matrix.f-svgBox.top-target.y)>.001)continue
    const source=new DOMPoint(...base),point=source.matrixTransform(matrix)
    const hit=document.elementFromPoint(point.x,point.y)?.closest('[data-country-id]')
    if(point.x>=svgBox.left&&point.x<svgBox.right&&point.y>=svgBox.top&&point.y<svgBox.bottom&&p.isPointInFill(source)&&hit?.dataset.countryId===id)return {x:point.x,y:point.y}
   }return false
  },{id,base,target},{timeout:30000})
  const point=await at.jsonValue();await at.dispose()
  assert.ok(point,`${id}: inland point is inside the real rendered path`)
  const buffer=await page.screenshot(),{data,info}=await sharp(buffer).removeAlpha().raw().toBuffer({resolveWithObject:true}),scale=info.width/width
  const x=Math.round(point.x*scale),y=Math.round(point.y*scale);let matches=0
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const i=((y+dy)*info.width+x+dx)*info.channels;if(data[i]===216&&data[i+1]===224&&data[i+2]===227)matches++}
  assert.ok(matches>=4,`${width}px ${id} actual unvisited SVG inland pixels (${matches})`)
 }
 await page.screenshot({path:`/tmp/globetrotter-uk-${width}-flat.png`});groups++
 await page.evaluate(()=>{const svg=document.querySelector('[data-flat-preview-colors] > svg'),stage=svg.parentElement.parentElement.parentElement;stage.style.removeProperty('height');stage.style.removeProperty('flex')})
 await page.getByRole('button',{name:'地球',exact:true}).click();await attachRenderer(page)
 for(const id of ids){
  await savedCountryFrame(page,points[id])
  const rendered=await page.evaluate(()=>checkedGlobe.renderer().checkedLast)
  for(const expected of ids)assert.equal(rendered.colors[expected].toLowerCase(),'#d8e0e3')
  const point=await page.evaluate(([lat,lng])=>checkedGlobe.getScreenCoords(lat,lng),points[id])
  const box=await page.locator('canvas').boundingBox(),buffer=await page.screenshot(),{data,info}=await sharp(buffer).removeAlpha().raw().toBuffer({resolveWithObject:true})
  const scale=info.width/width,x=Math.round((box.x+point.x)*scale),y=Math.round((box.y+point.y)*scale)
  // Lighting changes brightness, not the grey-blue material chromaticity.
  const target=[216,224,227],norm=Math.hypot(...target),unit=target.map(v=>v/norm)
  const others=[[168,199,209],[220,233,237],[244,247,248],[72,107,128]].map(c=>c.map(v=>v/Math.hypot(...c)))
  let hits=0
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const i=((y+dy)*info.width+x+dx)*info.channels,rgb=[data[i],data[i+1],data[i+2]],n=Math.hypot(...rgb)
   const value=rgb.map(v=>v/n),distance=Math.hypot(...value.map((v,j)=>v-unit[j]))
   if(n>70&&distance<.023&&others.every(c=>distance+.004<Math.hypot(...value.map((v,j)=>v-c[j]))))hits++
  }
  fs.writeFileSync(`/tmp/globetrotter-uk-${width}-${id}.json`,JSON.stringify({point,box,x,y,hits,frame:rendered}))
  assert.ok(hits>=2,`${width}px ${id} actual WebGL unvisited inland pixels (${hits})`)
  if(id==='826-eng')await page.screenshot({path:`/tmp/globetrotter-uk-${width}-globe.png`})
  await page.evaluate(()=>checkedGlobe.resumeAnimation())
 }
 groups++;assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width}px: all-country default SVG fill, UK real SVG and WebGL pixels, old local status isolated`)
}console.log(`PASS ${groups} UK browser groups (actual render, synthetic account)`)}catch(error){
 console.error('ORIGINAL FAILURE',error.stack)
 if(currentPage){
  const evidence=await flatFocusDiagnostics(currentPage,{id:currentId,base:currentBase,target:currentTarget})
  console.error('FOCUS DIAGNOSTIC',JSON.stringify(evidence))
  fs.writeFileSync('/tmp/globetrotter-uk-focus-failure.json',JSON.stringify({error:error.stack,evidence},null,2))
  await currentPage.screenshot({path:'/tmp/globetrotter-uk-focus-failure.png',timeout:5000}).catch(e=>console.error('SCREENSHOT DIAGNOSTIC',e.message))
 }
 throw error
}finally{await browser.close()}
