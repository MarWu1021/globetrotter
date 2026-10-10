/* Production-browser theme verification. Isolated fixtures only, never user data.
   Run after npm run build/start, with TEST_URL pointing to that local server. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {chromium,devices}=require('playwright')
const sharp=require('sharp')
const sandbox={exports:{},require:()=>({})}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/i18n.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,sandbox)
const {translate,LOCALES}=sandbox.exports
const url=process.env.TEST_URL||'http://127.0.0.1:3007'
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
function luminance(color){const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>{const x=c/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
async function run(name,options){
 const context=await browser.newContext({...options,locale:'zh-TW'}),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>{
  if(!localStorage.getItem('globetrotter:v1'))localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{statuses:{'158':'visited','392':'visited','784':'blocked'},notes:{'158':'保留原筆記'},reviews:{'158':{rating:5}},theme:'dark',view:'globe',locale:'zh-TW',localePinned:true,autoSpin:false,layers:{airports:false,stations:false,ports:false}}}))
  navigator.geolocation.getCurrentPosition=()=>{}
 })
 await page.route(/\/api\/flight\?/,r=>r.fulfill({json:{flight:null}}))
 async function menu(t,label){if(options.isMobile&&!await page.getByRole('button',{name:label,exact:true}).isVisible())await page.getByRole('button',{name:t('mobile.travels'),exact:true}).click();await page.getByRole('button',{name:label,exact:true}).click()}
 async function closeDrawer(t){if(options.isMobile&&await page.locator('#travel-panel[role="dialog"]').isVisible())await page.locator('#travel-panel').getByRole('button',{name:t('close'),exact:true}).click()}
 async function within(locator){const box=await locator.boundingBox(),v=page.viewportSize();assert.ok(box&&box.x>=-1&&box.x+box.width<=v.width+1&&box.y>=-1&&box.y+box.height<=v.height+1,'Control fits viewport')}
 async function noOverflow(dialog){const bad=await dialog.evaluate(el=>{const rect=el.getBoundingClientRect();return [...el.querySelectorAll('input,select,textarea,button,fieldset')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&(r.left<rect.left-1||r.right>rect.right+1)}).map(e=>e.tagName)});assert.deepEqual(bad,[])}
 async function surfaces(){const pairs=await page.evaluate(()=>{const p=document.createElement('span');p.style.cssText='position:fixed;visibility:hidden';document.body.appendChild(p);const out=[];for(const bg of ['--bg','--panel','--panel-2','--panel-hover'])for(const ink of ['--ink','--ink-dim','--ink-faint','--accent']){p.style.backgroundColor=`var(${bg})`;p.style.color=`var(${ink})`;const c=getComputedStyle(p);out.push([ink,bg,c.color,c.backgroundColor])}p.style.color='var(--accent-ink)';p.style.backgroundColor='var(--accent)';const c=getComputedStyle(p);out.push(['button','accent',c.color,c.backgroundColor]);p.remove();return out});for(const [ink,bg,a,b]of pairs)assert.ok(contrast(a,b)>=4.5,`${name}: ${ink}/${bg} contrast ${contrast(a,b).toFixed(2)} >=4.5`);assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(244, 247, 248)')}
 try{
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('canvas').first().waitFor();await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await surfaces()
 const original=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('globetrotter:v1')).state;return {statuses:s.statuses,notes:s.notes,reviews:s.reviews}})
 // Wait for real country meshes and visible stroke geometry, not only React props.
 await page.waitForFunction(()=>{
  for(const el of document.querySelectorAll('*')){
   const key=Object.keys(el).find(k=>k.startsWith('__reactFiber$'));if(!key)continue
   for(let f=el[key];f;f=f.return)if(f.ref?.current?.scene){
    window.themeGlobe=f.ref.current;let n=0
    themeGlobe.scene().traverse(o=>{if(o.isLineSegments&&o.visible&&o.geometry?.parameters?.geoJson?.type==='Polygon'&&o.material.color.getHexString()==='486b80')n++})
    if(n>100)return true
   }
  }return false
 })
 await page.waitForTimeout(1200)
 const samples=await page.evaluate(()=>{
  const g=themeGlobe,cam=g.camera(),points=[];g.pauseAnimation();g.scene().updateMatrixWorld(true)
  g.scene().traverse(o=>{
   if(!o.isLineSegments||!o.visible||o.geometry?.parameters?.geoJson?.type!=='Polygon')return
   const attr=o.geometry.attributes.position
   for(let i=0;i<attr.count;i+=Math.max(1,Math.floor(attr.count/6))){
    const p=cam.position.clone().fromBufferAttribute(attr,i).applyMatrix4(o.matrixWorld)
    if(p.dot(cam.position)<=p.lengthSq())continue
    p.project(cam);if(Math.abs(p.x)<.85&&Math.abs(p.y)<.85)points.push({x:(p.x+1)/2,y:(1-p.y)/2})
   }
  });return points.slice(0,120)
 })
 const buffer=await page.locator('canvas').first().screenshot()
 const {data,info}=await sharp(buffer).removeAlpha().raw().toBuffer({resolveWithObject:true})
 let painted=0
 for(const p of samples){let hit=false;const x=Math.round(p.x*info.width),y=Math.round(p.y*info.height)
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const px=x+dx,py=y+dy;if(px<0||px>=info.width||py<0||py>=info.height)continue;const i=(py*info.width+px)*info.channels,r=data[i],g=data[i+1],b=data[i+2];if(r>=60&&r<=105&&g>=90&&g<=140&&b>=110&&b<=160)hit=true}
  if(hit)painted++
 }
 assert.ok(painted>=5,`${name}: deep-blue borders actually painted at projected country perimeter samples (${painted})`)
 await page.screenshot({path:`/tmp/globetrotter-mist-${name}-globe.png`})
 console.log(`PASS ${name}: actual country-border pixels at ${painted} projected samples`)
 // Both saved theme variants remain soft; use the actual existing theme toggle.
 await page.getByRole('button',{name:translate('zh-TW')('theme.toggle'),exact:true}).click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');await surfaces()
 let current='zh-TW'
 for(const locale of [...LOCALES.filter(l=>l.id!=='zh-TW'),LOCALES.find(l=>l.id==='zh-TW')]){
  await page.getByRole('button',{name:translate(current)('language'),exact:true}).click();await page.getByRole('button',{name:new RegExp(locale.label)}).click();current=locale.id
  const t=translate(current);await menu(t,t('trip.create'))
  const editor=page.getByRole('dialog',{name:t('trip.editor'),exact:true});await editor.waitFor();await noOverflow(editor)
  await within(editor.getByRole('button',{name:t('trip.save'),exact:true}));assert.equal(await editor.getByText(t('trip.unsaved'),{exact:true}).count(),1)
  await editor.getByRole('button',{name:t('trip.close'),exact:true}).click();await closeDrawer(t)
  console.log(`PASS ${name} ${locale.id}: editor/save button and navigation fit`)
 }
 const t=translate('zh-TW');await menu(t,t('trip.create'));const editor=page.getByRole('dialog',{name:t('trip.editor'),exact:true})
 for(const code of ['TPE','DXB','ATH']){await editor.getByRole('searchbox').fill(code);await editor.locator('li').filter({has:page.getByRole('button',{name:t('trip.add'),exact:true})}).first().getByRole('button',{name:t('trip.add'),exact:true}).click()}
 await editor.getByLabel(`${t('trip.presence')} DXB`,{exact:true}).selectOption('transit')
 await editor.getByLabel(t('trip.title'),{exact:true}).fill('台灣 → 杜拜 → 希臘')
 const save=editor.getByRole('button',{name:t('trip.save'),exact:true});assert.equal(await save.isEnabled(),true)
 const buttonColors=await save.evaluate(el=>{const s=getComputedStyle(el);return [s.color,s.backgroundColor]});assert.ok(contrast(...buttonColors)>=4.5)
 await noOverflow(editor);await page.screenshot({path:`/tmp/globetrotter-mist-${name}-editor.png`})
 await save.click();await editor.getByText(t('trip.saved'),{exact:true}).first().waitFor();await editor.getByRole('button',{name:t('trip.close'),exact:true}).click()
 await menu(t,t('trip.records'));const records=page.getByRole('dialog',{name:t('trip.records'),exact:true});await records.locator('li').waitFor();await noOverflow(records);await page.screenshot({path:`/tmp/globetrotter-mist-${name}-records.png`});await records.getByRole('button',{name:t('trip.closeRecords'),exact:true}).click();await closeDrawer(t)
 await page.getByRole('button',{name:t('view.map'),exact:true}).click();const map=page.getByRole('img',{name:t('map.label'),exact:true});await map.waitFor();await within(map);assert.equal(await map.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(220, 233, 237)')
 assert.equal(await page.locator('path[data-country-id="158"]').getAttribute('fill'),'#22c55e');assert.equal(await page.locator('path[data-country-id="392"]').getAttribute('fill'),'#22c55e')
 await page.screenshot({path:`/tmp/globetrotter-mist-${name}-flat.png`})
 assert.deepEqual(await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('globetrotter:v1')).state;return {statuses:s.statuses,notes:s.notes,reviews:s.reviews}}),original)
 assert.deepEqual(errors,[]);console.log(`PASS ${name}: both mist variants, AA text contrast, functional colors, five locales, globe/editor/records/map screenshots, preserved legacy records`)
 }catch(e){await page.screenshot({path:`/tmp/globetrotter-mist-${name}-failure.png`}).catch(()=>{});throw e}finally{await context.close()}
}
try{await run('desktop',{viewport:{width:1440,height:1000}});const phone={...devices['iPhone 13']};delete phone.defaultBrowserType;await run('iphone-390',phone);await run('mobile-320',{...phone,viewport:{width:320,height:640}})}finally{await browser.close()}
