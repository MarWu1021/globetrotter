/** Five-locale layout and low-power fallback with synthetic session only. */
import {createRequire} from 'node:module'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
const {chromium}=createRequire(import.meta.url)('playwright'),url=process.env.TEST_URL||'http://127.0.0.1:3062'
const box={exports:{},require:()=>({})};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/i18n.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,box)
const {translate,LOCALES}=box.exports
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
let groups=0
try{for(const width of [1280,390,320]){
 const context=await browser.newContext({viewport:{width,height:850},locale:'zh-TW',reducedMotion:'reduce',isMobile:width<768,hasTouch:width<768,serviceWorkers:'block'}),page=await context.newPage()
 page.setDefaultTimeout(60000)
 let user={id:'00000000-0000-0000-0000-000000000001',email:'a@example.invalid'},current='zh-TW'
 await context.addInitScript(()=>{navigator.geolocation.getCurrentPosition=()=>{};Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2});localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{locale:'zh-TW',localePinned:true}}))})
 await context.route('**/auth/session',r=>r.fulfill({json:{user}}));await context.route('**/api/account**',r=>r.fulfill({json:{userId:user?.id,result:{ok:true,value:[]}}}))
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('.map-stage').waitFor()
 for(const locale of LOCALES){
  await page.locator('.map-stage').getByRole('button',{name:translate(current)('language'),exact:true}).click()
  await page.locator('.map-stage').getByRole('button').filter({hasText:locale.label}).click();current=locale.id
  if(width<768){
   const nav=page.locator('[data-mobile-navigation]');await nav.waitFor()
   for(const id of ['globe','records','add','stats','settings']){const b=nav.getByRole('button',{name:translate(current)(`nav.go.${id}`),exact:true});const rect=await b.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width+1&&rect.height>=44)}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  }else assert.equal(await page.locator('[data-mobile-navigation]').isVisible(),false)
 }
 await page.screenshot({path:`/tmp/globetrotter-upgrade-home-${width}.png`,timeout:60000,animations:'disabled'});groups++
 if(width<768)await page.getByRole('button',{name:'開啟設定',exact:true}).click()
 user=null;await page.getByRole('button',{name:'登出',exact:true}).click();await page.waitForURL('**/login');await page.locator('[data-login-cover="static"]').waitFor()
 await page.emulateMedia({reducedMotion:'no-preference'});await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-login-cover="static"]').waitFor();assert.equal(await page.locator('[data-login-globe]').count(),0)
 assert.equal(await page.getByRole('button',{name:'使用 Google 登入',exact:true}).isEnabled(),true);groups++
 await context.close();console.log(`PASS ${width}px: five-locale navigation bounds and low-power static login`)
}
console.log(`PASS ${groups} presentation layout groups (synthetic sessions)`)
}finally{await browser.close()}
