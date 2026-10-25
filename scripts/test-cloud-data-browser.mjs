/** Production build + real UI/SVG. Account endpoints are doubles, NOT live Supabase/OAuth. */
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {attachRenderer,savedCountryFrame} from './browser-globe-render.mjs'
import {footprintPixel} from './browser-color-match.mjs'
const require=createRequire(import.meta.url),{chromium}=require('playwright'),sharp=require('sharp')
const url=process.env.TEST_URL||'http://127.0.0.1:3021'
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const identities={A:{id:'00000000-0000-0000-0000-000000000001',email:'a@example.invalid'},B:{id:'00000000-0000-0000-0000-000000000002',email:'b@example.invalid'}}
const box={exports:{},require:()=>({})};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/i18n.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,box)
const {translate,LOCALES}=box.exports
let groups=0
try {for(const width of process.env.TEST_WIDTH?[Number(process.env.TEST_WIDTH)]:[1280,390,320]){
 const context=await browser.newContext({viewport:{width,height:850},locale:'zh-TW',reducedMotion:'reduce',isMobile:width<768,hasTouch:width<768,deviceScaleFactor:width<768?2:1,serviceWorkers:'block'}),page=await context.newPage(),errors=[]
 let user=null,setup=false,fail=null,denied=false;let holdReads=false;const readWaiters=[];const calls=[],rows={A:new Map(),B:new Map()},countries={A:new Map(),B:new Map()},requests=new Map()
 page.setDefaultTimeout(60000)
 page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>{
  if(!localStorage.getItem('globetrotter:v1'))localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{statuses:{'250':'visited','158':'blocked'},notes:{'158':'OLD NOTE'},reviews:{'158':{rating:5}},locale:'zh-TW',localePinned:true,autoSpin:false,layers:{airports:false,stations:false,ports:false}}}))
  localStorage.setItem('globetrotter:trips:v1','OLD TEST TRIPS - DO NOT IMPORT')
  const read=Storage.prototype.getItem;window.oldTripReads=0
  Storage.prototype.getItem=function(key){if(key==='globetrotter:trips:v1')window.oldTripReads++;return read.call(this,key)}
  navigator.geolocation.getCurrentPosition=()=>{}
 })
 await context.route('**/auth/session',r=>{if(process.env.TEST_AUTH_ONLY||process.env.TEST_TRACE)console.log('AUTH VERIFY',user?.email??'guest');return r.fulfill({json:{user},headers:{'Cache-Control':'private, no-store'}})})
 await context.route(/\/api\/flight\?/,r=>r.fulfill({json:{flight:null}}))
 await context.route('**/api/account**',async route=>{
  const req=route.request(),requestUser=user,owner=user===identities.A?'A':'B',reply=result=>route.fulfill({json:{userId:requestUser?.id??null,result},headers:{'Cache-Control':'private, no-store'}})
  if(!user)return reply({ok:false,error:'unauthenticated'})
  const expected=req.method()==='GET'?new URL(req.url()).searchParams.get('expectedUserId'):req.postDataJSON()?.expectedUserId
  if(expected!==requestUser.id)return reply({ok:false,error:'account-changed'})
  if(setup)return reply({ok:false,error:'setup'})
  if(denied&&req.method()==='POST'){user=null;return reply({ok:false,error:'unauthenticated'})}
  if(req.method()==='GET'&&holdReads)await new Promise(resolve=>readWaiters.push(resolve))
  if(req.method()==='GET')return reply({ok:true,value:[...(new URL(req.url()).searchParams.get('kind')==='trips'?rows:countries)[owner].values()]})
  const body=req.postDataJSON(),c=body.command;calls.push(structuredClone(body))
  if(fail){const error=fail;fail=null;return reply({ok:false,error})}
  const replayKey=owner+':'+c.requestId,previousReply=requests.get(replayKey)
  if(previousReply)return reply(previousReply)
  const records=body.operation.endsWith('trip')?rows[owner]:countries[owner],old=records.get(c.id)
  if((old?.revision??null)!==c.expectedRevision)return reply({ok:false,error:'conflict'})
  let value=null
  if(body.operation==='save-trip'){
   const now=new Date().toISOString();value={draft:c.draft,revision:(old?.revision??0)+1,createdAt:old?.createdAt??now,updatedAt:now};records.set(c.id,value)
  }else if(body.operation==='save-country'){value={...c.record,revision:(old?.revision??0)+1};records.set(c.id,value)}
  else records.delete(c.id)
  const result={ok:true,value};requests.set(replayKey,result);return reply(result)
 })
 const editor=page.getByRole('dialog',{name:'旅行編輯',exact:true}),recordDialog=page.getByRole('dialog',{name:'我的旅行紀錄',exact:true})
 async function menu(label){if(width<768&&!await page.getByRole('button',{name:label,exact:true}).isVisible())await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click();await page.getByRole('button',{name:label,exact:true}).click()}
 async function closeDrawer(){const drawer=page.getByRole('dialog',{name:'搜尋與我的旅行',exact:true});if(width<768&&await drawer.isVisible())await drawer.getByRole('button',{name:'關閉',exact:true}).click()}
 async function add(code){if(!await editor.getByRole('searchbox').isVisible())await editor.locator('summary#trip-search-title').click();await editor.getByRole('searchbox').fill(code);await editor.locator('li').filter({has:page.getByRole('button',{name:'加入路線',exact:true})}).filter({hasText:code}).first().getByRole('button',{name:'加入路線',exact:true}).click()}
 const colorData=()=>page.evaluate(()=>JSON.parse(document.querySelector('[data-flat-preview-colors]')?.dataset.savedColors||'{}'))
 async function colors(expected){await page.waitForFunction(expected=>{const colors=JSON.parse(document.querySelector('[data-flat-preview-colors]')?.dataset.savedColors||'{}');return Object.entries(expected).every(([id,c])=>colors[id]===c)},expected)}
 async function globePixels(sample,color){
  await closeDrawer();await page.getByRole('button',{name:'地球',exact:true}).click()
  await attachRenderer(page);await savedCountryFrame(page,sample)
  const intro=await page.evaluate(()=>checkedGlobe.renderer().checkedBlockedIntro)
  if(intro)console.log('INTRO FRAME',width,JSON.stringify(intro))
  const point=await page.evaluate(sample=>checkedGlobe.getScreenCoords(...sample),sample),box=await page.locator('canvas').boundingBox(),scale=await page.evaluate(()=>devicePixelRatio)
  const {data,info}=await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true})
  const x=Math.round((box.x+point.x)*scale),y=Math.round((box.y+point.y)*scale);let count=0
  for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const i=((y+dy)*info.width+x+dx)*info.channels;if(footprintPixel(data[i],data[i+1],data[i+2],color))count++}
  if(count<4)console.log('PIXEL DIAGNOSTIC',JSON.stringify(await page.evaluate(({point,sample,x,y,count})=>({point,sample,x,y,count,pov:checkedGlobe.pointOfView(),camera:checkedGlobe.camera().position.toArray(),frame:checkedGlobe.renderer().checkedLast,rect:checkedGlobe.renderer().domElement.getBoundingClientRect().toJSON()}),{point,sample,x,y,count})))
  assert.ok(count>=4,`${width}px: confirmed account ${color} is actually rendered at inland coordinates`)
  await page.screenshot({path:`/tmp/d3-cloud-${width}-${color}-globe.png`})
  await page.evaluate(()=>checkedGlobe.resumeAnimation())
 }
 async function signIn(identity){if(process.env.TEST_TRACE)console.log('VERIFY REQUEST',identity.email);user=identity;await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await page.getByText(identity.email,{exact:true}).waitFor({state:'attached'})}
 async function manualCountry(){
  // Manual country data is staged separately; only an acknowledged explicit save
  // changes the permanent map. Notes and ratings are sent to this account only.
  if(width<768&&!await page.getByRole('textbox',{name:'搜尋國家',exact:true}).isVisible())await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click()
  await page.getByRole('textbox',{name:'搜尋國家',exact:true}).fill('法國')
  await page.getByRole('button',{name:/法國/}).first().click();await closeDrawer()
  await page.getByRole('button',{name:'已造訪',exact:true}).click()
  await page.getByRole('button',{name:'5 顆星',exact:true}).click()
  await page.getByRole('textbox',{name:'旅行筆記',exact:true}).fill('Account A France note')
  assert.equal((await colorData())['250'],undefined,'Country editor changes do not affect the confirmed map')
  fail='uncertain';await page.getByRole('button',{name:'儲存國家紀錄',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'未收到儲存確認'}).first().waitFor()
  assert.equal((await colorData())['250'],undefined)
  await page.getByRole('button',{name:'儲存國家紀錄',exact:true}).click();await colors({'250':'#6F9E91'})
  assert.equal(countries.A.get('250').notes,'Account A France note');assert.equal(countries.A.get('250').review.rating,5)
  await page.getByRole('button',{name:'關閉',exact:true}).last().click();groups++;console.log('STEP',width,groups)
 }
 try {
  await page.goto(url,{waitUntil:'domcontentloaded'});
  if(process.env.TEST_AUTH_ONLY){
   await signIn(identities.A);await menu('建立旅行');await add('TPE');await add('KCZ');await editor.getByLabel('旅行名稱（選填）',{exact:true}).fill('PRIVATE EXPIRING DRAFT')
   denied=true;await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();await page.getByRole('button',{name:'使用 Google 登入',exact:true,includeHidden:true}).waitFor({state:'attached'})
   assert.equal(await editor.count(),0);assert.equal(Object.keys(await colorData()).length,0)
   denied=false;await signIn(identities.A);await signIn(identities.B);await signIn(identities.A)
   user=null;await menu('登出');await page.getByRole('button',{name:'使用 Google 登入',exact:true,includeHidden:true}).waitFor({state:'attached'})
   assert.equal(Object.keys(await colorData()).length,0);groups++;console.log(`PASS account-only ${width}px: expiry, re-verification, A/B/A isolation, logout`);continue
  }
  if(process.env.TEST_COUNTRY_ONLY){
   holdReads=true;await signIn(identities.A)
   if(width<768)await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click()
   await page.getByRole('textbox',{name:'搜尋國家',exact:true}).fill('法國');await page.getByRole('button',{name:/法國/}).first().click();await closeDrawer()
   assert.equal(await page.getByRole('button',{name:'已造訪',exact:true}).isDisabled(),true,'Country edits are disabled until the deferred account read is ready')
   assert.equal(await page.getByRole('button',{name:'儲存國家紀錄',exact:true}).count(),0,'No unsaved edits can be created while cloud records are loading')
   console.log('READ GATE',width,readWaiters.length);holdReads=false;readWaiters.splice(0).forEach(resolve=>resolve())
   await page.waitForFunction(()=>!document.querySelector('fieldset[disabled]'))
   await page.getByRole('button',{name:'關閉',exact:true}).last().click()
   await manualCountry();console.log(`PASS country-only ${width}px: read gate, normal taps, pending-edit retry`);continue
  }
  await page.waitForURL('**/login');await page.locator('[data-login-page]').waitFor()
  assert.equal(await editor.count(),0);assert.equal(await page.locator('.map-stage').count(),0)
  assert.equal(calls.length,0);groups++;console.log('STEP',width,groups)
  // Missing reviewed SQL is a visible setup failure, not empty success or local fallback.
  setup=true;await signIn(identities.A);await menu('建立旅行');await add('TPE');await add('KCZ')
  await editor.getByText(/尚待啟用已審查的 SQL/).first().waitFor()
  assert.equal(await editor.getByRole('button',{name:'儲存旅行',exact:true}).isDisabled(),true)
  setup=false;await editor.getByRole('button',{name:'關閉編輯器',exact:true}).click();await menu('重新載入雲端紀錄')
  await menu('建立旅行');await editor.getByRole('button',{name:'儲存旅行',exact:true}).waitFor();groups++;console.log('STEP',width,groups)
  await editor.getByLabel('旅行名稱（選填）',{exact:true}).fill('台灣日本')
  const airline=editor.getByRole('combobox',{name:'航空公司',exact:true})
  await airline.fill('中華');await editor.getByRole('option').filter({hasText:'CI · 中華航空'}).getByRole('button').click()
  assert.equal(await airline.inputValue(),'CI · China Airlines')
  if(!await editor.getByLabel('航班編號',{exact:true}).isVisible())await editor.locator('[data-flight-more] > summary').click()
  await editor.getByLabel('航班編號',{exact:true}).fill('CI100')
  fail='uncertain';await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();await editor.getByRole('alert').filter({hasText:'未收到儲存確認'}).waitFor()
  assert.equal((await colorData())['392'],undefined);assert.equal(rows.A.size,0)
  await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();await page.locator('[data-journey-notice]').waitFor();await editor.waitFor({state:'hidden'})
  if(await page.locator('[data-skip-journey]').isVisible())await page.locator('[data-skip-journey]').click()
  assert.equal(calls.at(-1).command.requestId,calls.at(-2).command.requestId);assert.equal(rows.A.size,1)
  await colors({'158':'#6F9E91','392':'#6F9E91'});await closeDrawer();groups++;console.log('STEP',width,groups)
  await page.getByRole('button',{name:'平面地圖',exact:true}).click()
  assert.equal(await page.locator('[data-saved-routes] path').count(),1)
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('path[data-country-id="392"]')).fill==='rgb(111, 158, 145)')
  await page.screenshot({path:`/tmp/d3-cloud-${width}-saved-flat.png`})
  await page.reload({waitUntil:'domcontentloaded'});await colors({'158':'#6F9E91','392':'#6F9E91'})
  await closeDrawer();await page.getByRole('button',{name:'地球',exact:true}).click();await page.locator('[data-globe-points]').waitFor({state:'attached'})
  await page.waitForFunction(()=>document.querySelector('[data-globe-points]')?.dataset.savedArcs==='1')
  await globePixels([23.7,121],'green');await page.screenshot({path:`/tmp/d3-cloud-${width}-reload-globe.png`});groups++;console.log('STEP',width,groups)
  await menu('我的旅行紀錄');const japan=recordDialog.locator('li').filter({has:page.getByRole('heading',{name:'台灣日本',exact:true})})
  await japan.getByRole('button',{name:'編輯',exact:true}).click();assert.equal(await airline.inputValue(),'CI · China Airlines')
  await editor.getByLabel('旅行名稱（選填）',{exact:true}).fill('台灣日本修改')
  fail='conflict';await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();await editor.getByRole('alert').filter({hasText:'其他裝置已修改'}).waitFor()
  assert.equal(rows.A.values().next().value.draft.title,'台灣日本');assert.equal(await editor.getByLabel('旅行名稱（選填）',{exact:true}).inputValue(),'台灣日本修改')
  await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();await editor.getByText('已儲存至帳號',{exact:true}).first().waitFor();await editor.getByRole('button',{name:'關閉編輯器',exact:true}).click();groups++;console.log('STEP',width,groups)
  await menu('建立旅行');await add('TPE');await add('DXB');await add('ATH');await editor.getByLabel('國家停留性質 DXB',{exact:true}).selectOption('transit')
  await editor.getByLabel('旅行名稱（選填）',{exact:true}).fill('台灣杜拜希臘')
  await editor.locator('fieldset').nth(0).getByRole('combobox',{name:'航空公司',exact:true}).fill('EK')
  await editor.getByRole('option').filter({hasText:'EK · 阿聯酋航空'}).getByRole('button').click()
  await editor.locator('fieldset').nth(1).getByRole('combobox',{name:'航空公司',exact:true}).fill('BR')
  await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter')
  await editor.getByRole('button',{name:'儲存旅行',exact:true}).click();await page.locator('[data-journey-notice]').waitFor();await editor.waitFor({state:'hidden'})
  if(await page.locator('[data-skip-journey]').isVisible())await page.locator('[data-skip-journey]').click()
  const greek=[...rows.A.values()].find(r=>r.draft.title==='台灣杜拜希臘');assert.equal(greek.draft.legs[0].airline,'EK · Emirates');assert.equal(greek.draft.legs[1].airline,'BR · EVA Air')
  await colors({'158':'#6F9E91','392':'#6F9E91','784':'#8BB6CE','300':'#6F9E91'})
  await closeDrawer();await page.getByRole('button',{name:'平面地圖',exact:true}).click()
  assert.equal(await page.locator('[data-saved-routes] path').count(),3)
  assert.deepEqual(JSON.parse(await page.locator('[data-trip-statistics]').getAttribute('data-trip-statistics')),{countries:4,trips:2,flights:3})
  await page.screenshot({path:`/tmp/d3-cloud-${width}-transit-flat.png`});await globePixels([24.2,54.4],'blue');groups++;console.log('STEP',width,groups)
  await menu('我的旅行紀錄');const greekItem=recordDialog.locator('li').filter({has:page.getByRole('heading',{name:'台灣杜拜希臘',exact:true})})
  page.once('dialog',d=>d.accept());await greekItem.getByRole('button',{name:'刪除',exact:true}).click()
  await page.waitForFunction(()=>!JSON.parse(document.querySelector('[data-flat-preview-colors]')?.dataset.savedColors||'{}')['784'])
  assert.equal(rows.A.size,1);await recordDialog.getByRole('button',{name:'關閉旅行紀錄',exact:true}).click();groups++;console.log('STEP',width,groups)
  // A second device gets the same account rows; all writes still use version checks.
  const device=await context.newPage();await device.goto(url,{waitUntil:'domcontentloaded'});await device.waitForFunction(()=>JSON.parse(document.querySelector('[data-trip-statistics]')?.dataset.tripStatistics||'{}').trips===1);await device.close();groups++;console.log('STEP',width,groups)
  await manualCountry()
  await menu('建立旅行');await editor.getByLabel('旅行名稱（選填）',{exact:true}).fill('PRIVATE EXPIRING DRAFT');await add('TPE');await add('KCZ')
  denied=true;await editor.getByRole('button',{name:'儲存旅行',exact:true}).click()
  await page.getByRole('button',{name:'使用 Google 登入',exact:true,includeHidden:true}).waitFor({state:'attached'})
  assert.equal(await editor.count(),0);assert.equal(Object.keys(await colorData()).length,0)
  denied=false;await signIn(identities.A);await colors({'250':'#6F9E91'});groups++;console.log('STEP',width,groups)
  await signIn(identities.B);await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-trip-statistics]')?.dataset.tripStatistics||'{}').trips===0)
  assert.equal(Object.keys(await colorData()).length,0);await menu('建立旅行');assert.equal(await editor.locator('fieldset').count(),0);await editor.getByRole('button',{name:'關閉編輯器',exact:true}).click()
  await signIn(identities.A);await colors({'392':'#6F9E91'});user=null;await menu('登出')
  await page.getByRole('button',{name:'使用 Google 登入',exact:true,includeHidden:true}).waitFor({state:'attached'});assert.equal(Object.keys(await colorData()).length,0);groups++;console.log('STEP',width,groups)
  assert.equal(await page.evaluate(()=>window.oldTripReads),0)
  const legacy=await page.evaluate(()=>({trips:localStorage.getItem('globetrotter:trips:v1'),data:JSON.parse(localStorage.getItem('globetrotter:v1')).state}))
  assert.equal(legacy.trips,'OLD TEST TRIPS - DO NOT IMPORT');assert.deepEqual(legacy.data.statuses,{'250':'visited','158':'blocked'});assert.equal(legacy.data.notes['158'],'OLD NOTE');assert.equal(legacy.data.reviews['158'].rating,5)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);groups++;console.log('STEP',width,groups)
  await signIn(identities.A);await closeDrawer();let language='zh-TW'
  for(const locale of [...LOCALES.filter(l=>l.id!=='zh-TW'),LOCALES.find(l=>l.id==='zh-TW')]){
   await page.getByRole('button',{name:translate(language)('language'),exact:true}).click()
   await page.getByRole('button',{name:new RegExp(locale.label)}).click();language=locale.id;const t=translate(language)
   if(width<768)await page.getByRole('button',{name:t('mobile.travels'),exact:true}).click()
   await page.getByRole('button',{name:t('trip.create'),exact:true}).click();const d=page.getByRole('dialog',{name:t('trip.editor'),exact:true})
   assert.ok(await d.getByText(t('cloud.accountOnly'),{exact:true}).count()>0)
   const save=d.getByRole('button',{name:t('trip.save'),exact:true});assert.equal(await save.isDisabled(),true)
   const rect=await save.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width+1&&rect.y+rect.height<=850,'Localized save/login controls stay visible')
   await d.getByRole('button',{name:t('trip.close'),exact:true}).click()
   if(width<768)await page.getByRole('dialog',{name:t('mobile.travels'),exact:true}).getByRole('button',{name:t('close'),exact:true}).click()
  }
  groups++;console.log('STEP',width,groups)
  console.log(`PASS ${width}px: guest/setup, CRUD, retry/conflict, airline selection, maps/reload, account switch/logout, old storage isolation`)
 }catch(error){console.log('COUNTRY FIXTURE',JSON.stringify({records:[...countries.A.values()].map(r=>({geoId:r.geoId,status:r.status,revision:r.revision})),writes:calls.filter(c=>c.operation==='save-country').map(c=>({id:c.command.id,status:c.command.record.status}))}));await page.screenshot({path:`/tmp/d3-cloud-${width}-failure.png`}).catch(()=>{});throw error}finally{await context.close()}
 }
 console.log(`PASS ${groups} cloud UI scenario groups (mock API; not live Supabase/RLS/OAuth)`)
}finally{await browser.close()}
