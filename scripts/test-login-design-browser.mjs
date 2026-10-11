/** Real Chromium/SVG with a synthetic signed-out session; no live OAuth or database. */
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import sharp from 'sharp'

const {chromium}=createRequire(import.meta.url)('playwright')
const origin=process.env.TEST_URL||'http://127.0.0.1:3080'
const sandbox={exports:{},require:()=>({})}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/i18n.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,sandbox)
const {translate,LOCALES}=sandbox.exports
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
let groups=0
try {
  for(const [width,height] of [[1440,900],[390,844],[320,740],[320,568]]) {
    const context=await browser.newContext({viewport:{width,height},locale:'zh-TW',isMobile:width<768,hasTouch:width<768,deviceScaleFactor:width<768?2:1,serviceWorkers:'block'})
    const page=await context.newPage(),errors=[]
    page.setDefaultTimeout(60000)
    page.on('pageerror',e=>errors.push(e.message))
    await context.addInitScript(()=>{
      Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8})
      Object.defineProperty(navigator,'deviceMemory',{get:()=>8})
      localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{locale:'zh-TW',localePinned:true,statuses:{'158':'visited'},notes:{'158':'ISOLATED FIXTURE'}}}))
      localStorage.setItem('globetrotter:trips:v1','UNTOUCHED_FIXTURE')
    })
    await context.route('**/auth/session',r=>r.fulfill({json:{user:null},headers:{'Cache-Control':'private, no-store'}}))
    await page.goto(origin+'/login',{waitUntil:'domcontentloaded'})
    await page.getByRole('heading',{name:translate('zh-TW')('login.title'),exact:true}).waitFor()
    const island=page.locator('[data-login-island]')
    await island.waitFor()
    await page.locator('[data-island-motion="animated"]').waitFor()
    const button=page.getByRole('button',{name:translate('zh-TW')('auth.login'),exact:true})
    const cover=await island.boundingBox(),cta=await button.boundingBox()
    assert.ok(cover.width>100&&cover.height>100,'A large island remains on narrow/short screens')
    assert.ok(cover.y>=0&&cover.y+cover.height<=height,'Island is visible on entry')
    assert.ok(cta.y>=0&&cta.y+cta.height<=height,'Chinese login action is fully visible on entry')
    assert.ok(cta.x>=0&&cta.x+cta.width<=width&&cta.height>=44,'Login action fits and has an accessible touch target')
    if(width>=768){assert.ok(cover.width>=width*.35,'Large main island illustration');assert.ok(cover.x+cover.width/2<cta.x,'Island left, login card right')}
    else assert.ok(cover.y+cover.height<cta.y,'Mobile island stacks above the login action')
    assert.equal(await button.isEnabled(),true)
    const spot={x:cta.x+cta.width/2,y:cta.y+cta.height/2}
    assert.equal(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('button'),spot),true,'Decorative layers do not intercept login')
    assert.equal(await page.locator('.map-stage').count(),0,'No private map is mounted behind the cover')
    assert.equal(await page.locator('canvas').count(),0,'Login never mounts a WebGL renderer')
    assert.ok(await island.locator('[data-island-building]').count()>=10,'Complete town, not a corner decoration')
    assert.ok(await island.locator('[data-island-tree]').count()>=20)
    assert.equal(await island.evaluate(el=>getComputedStyle(el).pointerEvents),'none')
    const shot=`/tmp/globetrotter-island-login-${width}-${height}.png`
    await page.screenshot({path:shot,timeout:60000,animations:'disabled'})
    // Actual screenshot pixels prove that the town walls and hotel roof were painted.
    const {data,info}=await sharp(shot).ensureAlpha().raw().toBuffer({resolveWithObject:true})
    const ratio=info.width/width
    let cream=0,roof=0
    for(let y=Math.max(0,Math.ceil(cover.y*ratio));y<Math.min(info.height,Math.floor((cover.y+cover.height)*ratio));y++){
      for(let x=Math.max(0,Math.ceil(cover.x*ratio));x<Math.min(info.width,Math.floor((cover.x+cover.width)*ratio));x++){
        const i=(y*info.width+x)*4
        if(data[i]===255&&data[i+1]===248&&data[i+2]===232)cream++
        if(data[i]===84&&data[i+1]===127&&data[i+2]===140)roof++
      }
    }
    assert.ok(cream>20&&roof>10,`Painted island details: cream=${cream}, roof=${roof}`)
    console.log(`SCREENSHOT ${width}x${height}: SVG island, cream=${cream}, roof=${roof}`);groups++

    await page.emulateMedia({reducedMotion:'reduce'})
    await page.locator('[data-island-motion="static"]').waitFor()
    assert.equal(await island.locator('[data-island-plane]').evaluate(el=>getComputedStyle(el).animationName),'none')
    assert.equal(await page.locator('canvas').count(),0)
    assert.equal(await button.isEnabled(),true)
    await page.screenshot({path:`/tmp/globetrotter-island-login-static-${width}-${height}.png`});groups++

    // Returning to a background tab stops optional motion without removing the illustration.
    await page.emulateMedia({reducedMotion:'no-preference'})
    await page.locator('[data-island-motion="animated"]').waitFor()
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))})
    await page.locator('[data-island-motion="static"]').waitFor()
    assert.equal(await island.locator('[data-island-plane]').evaluate(el=>getComputedStyle(el).animationName),'none')
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))})
    await page.locator('[data-island-motion="animated"]').waitFor();groups++
    await page.emulateMedia({reducedMotion:'reduce'})

    for(const locale of LOCALES) {
      await page.locator('select').selectOption(locale.id)
      await page.getByRole('heading',{name:translate(locale.id)('login.title'),exact:true}).waitFor()
      await page.getByRole('heading',{name:translate(locale.id)('login.begin'),exact:true}).waitFor()
      const action=page.getByRole('button',{name:translate(locale.id)('auth.login'),exact:true})
      await page.locator('[data-login-page]').evaluate(el=>el.scrollTo(0,0))
      const bounds=await action.boundingBox()
      assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.height>=44,locale.id)
      assert.ok(bounds.y>=0&&bounds.y+bounds.height<=height,`${locale.id}: login action visible on entry`)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
      assert.equal(await page.locator('[data-login-page]').evaluate(el=>el.scrollWidth<=el.clientWidth),true)
      await action.focus()
      assert.equal(await action.evaluate(el=>el===document.activeElement),true)
      groups++
    }
    const legacy=await page.evaluate(()=>JSON.parse(localStorage.getItem('globetrotter:v1')).state)
    assert.deepEqual(legacy.statuses,{'158':'visited'});assert.equal(legacy.notes['158'],'ISOLATED FIXTURE')
    assert.equal(await page.evaluate(()=>localStorage.getItem('globetrotter:trips:v1')),'UNTOUCHED_FIXTURE')
    assert.deepEqual(errors,[]);groups++
    console.log(`PASS ${width}x${height}: painted island, background/reduced-motion fallback, five locales, keyboard/touch targets, isolated legacy data`)
    await context.close()
  }
  const low=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})
  await low.addInitScript(()=>Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2}))
  await low.route('**/auth/session',r=>r.fulfill({json:{user:null}}))
  const page=await low.newPage();await page.goto(origin+'/login',{waitUntil:'domcontentloaded'})
  await page.locator('[data-island-motion="static"]').waitFor()
  assert.equal(await page.locator('canvas').count(),0)
  assert.equal(await page.locator('[data-island-plane]').evaluate(el=>getComputedStyle(el).animationName),'none')
  assert.equal(await page.locator('[data-login-page] button').isEnabled(),true);groups++
  await low.close()
  console.log(`PASS ${groups} island login browser groups; synthetic sessions, actual browser rendering`)
}finally{await browser.close()}
