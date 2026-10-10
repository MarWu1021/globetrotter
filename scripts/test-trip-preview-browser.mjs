import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const {chromium,devices}=createRequire(import.meta.url)('playwright')
const url=process.env.TEST_URL||'http://127.0.0.1:3005'
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
async function run(name,options){
 const context=await browser.newContext({...options,locale:'zh-TW'}),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>localStorage.setItem('globetrotter:v1',JSON.stringify({version:4,state:{statuses:{'158':'blocked','392':'wishlist','784':'visited'},notes:{'158':'原筆記'},reviews:{'158':{rating:5}},theme:'dark',locale:'zh-TW',localePinned:true,autoSpin:false,layers:{airports:false,stations:false,ports:false}}})))
 await page.route(/\/api\/flight\?/,r=>r.fulfill({json:{flight:null}}))
 try{
 await page.goto(url,{waitUntil:'domcontentloaded'})
 await page.locator('path[data-country-id="158"]').waitFor({state:'attached'})
 const baseline=await page.evaluate(()=>localStorage.getItem('globetrotter:v1'))
 const original={};for(const id of ['158','392','300','784'])original[id]=await page.locator(`path[data-country-id="${id}"]`).getAttribute('fill')
 if(options.isMobile && !await page.getByRole('button',{name:'建立旅行',exact:true}).isVisible())await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click()
 await page.getByRole('button',{name:'建立旅行',exact:true}).click()
 const editor=page.getByRole('dialog',{name:'旅行編輯',exact:true})
 async function add(code){await editor.getByRole('searchbox',{name:'搜尋機場',exact:true}).fill(code);await editor.locator('li').filter({has:page.getByRole('button',{name:'加入路線',exact:true})}).first().getByRole('button',{name:'加入路線',exact:true}).click()}
 async function view(v){await page.getByRole('button',{name:v==='map'?'平面地圖':'地球',exact:true}).click()}
 async function flatColors(expected){await page.waitForFunction(e=>JSON.stringify(JSON.parse(document.querySelector('[data-flat-preview-colors]').dataset.flatPreviewColors))===JSON.stringify(e),expected);for(const [id,color]of Object.entries(expected))assert.equal(await page.locator(`path[data-country-id="${id}"]`).getAttribute('fill'),color)}
 async function globeColors(expected,arcs){await page.waitForFunction(({expected,arcs})=>{const g=document.querySelector('[data-preview-arcs]');return g?.dataset.previewArcs===String(arcs)&&JSON.stringify(JSON.parse(g.dataset.previewColors))===JSON.stringify(expected)},{expected,arcs});assert.equal(await page.locator('[data-airport-code]').count(),0,'View-only mode does not expose airport selection')}
 async function unchanged(){assert.equal(await page.evaluate(()=>localStorage.getItem('globetrotter:v1')),baseline)}
 await add('TPE');await add('KCZ');assert.equal(await editor.getByLabel('整趟旅行狀態',{exact:true}).count(),0,'Completed trips need no status selector')
 // Ordinary close does not imply save or preview; draft survives reopening.
 await editor.getByRole('button',{name:'關閉編輯器',exact:true}).click()
 assert.equal(await page.getByRole('region',{name:'查看旅行預覽',exact:true}).count(),0)
 if(options.isMobile && !await page.getByRole('button',{name:'建立旅行',exact:true}).isVisible())await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click()
 await page.getByRole('button',{name:'建立旅行',exact:true}).click();assert.equal(await editor.locator('fieldset').count(),1)
 await editor.getByRole('button',{name:'查看旅行預覽',exact:true}).click()
 await view('map');await flatColors({'158':'#22c55e','392':'#22c55e'})
 assert.equal(await page.locator('path[data-country-id="392"]').getAttribute('stroke-dasharray'),null)
 await view('globe');await globeColors({'158':'#22c55e','392':'#22c55e'},1)
 await page.locator('canvas').first().click({position:{x:100,y:100}})
 assert.equal(await page.locator('[data-testid="airport-confirmation"]').count(),0)
 if(options.isMobile){const map=await page.locator('canvas').first().boundingBox(),panel=await page.getByRole('region',{name:'查看旅行預覽',exact:true}).boundingBox();assert.ok(map.y+map.height<=panel.y+1,'Mobile preview panel does not cover the globe')}
 await unchanged();await page.screenshot({path:`/tmp/globetrotter-preview-${name}.png`})
 await page.getByRole('button',{name:'離開旅行預覽',exact:true}).click();await flatColors({})
 for(const [id,fill] of Object.entries(original))assert.equal(await page.locator(`path[data-country-id="${id}"]`).getAttribute('fill'),fill)
 await unchanged()
 if(options.isMobile && !await page.getByRole('button',{name:'建立旅行',exact:true}).isVisible())await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click()
 await page.getByRole('button',{name:'建立旅行',exact:true}).click();assert.equal(await editor.locator('fieldset').count(),1)
 assert.equal(await editor.getByLabel('整趟旅行狀態',{exact:true}).count(),0)
 assert.equal(await page.evaluate(()=>localStorage.getItem('globetrotter:trips:v1')),null,'Preview is not saving')
 page.once('dialog',d=>d.accept());await editor.getByRole('button',{name:'清除暫存草稿',exact:true}).click()
 await add('TPE');await add('DXB');await add('ATH');assert.equal(await editor.getByLabel('整趟旅行狀態',{exact:true}).count(),0,'Completed trips need no status selector');await editor.getByLabel('國家停留性質 DXB',{exact:true}).selectOption('transit')
 await editor.getByRole('button',{name:'查看旅行預覽',exact:true}).click()
 const colors={'158':'#22c55e','300':'#22c55e','784':'#3b82f6'}
 await view('map');await flatColors(colors);await view('globe');await globeColors(colors,2)
 await page.getByRole('button',{name:'返回編輯器',exact:true}).click();assert.equal(await editor.locator('fieldset').count(),2);await unchanged();assert.deepEqual(errors,[])
 console.log(`PASS ${name}: preview toggle, globe/flat actual fills, TPE/KCZ, transit colors, completed default, exit restoration, no accidental stop, unchanged storage`)
 }catch(e){await page.screenshot({path:`/tmp/globetrotter-preview-${name}-failure.png`}).catch(()=>{});throw e}finally{await context.close()}
}
try{await run('desktop',{viewport:{width:1440,height:1000}});const phone={...devices['iPhone 13']};delete phone.defaultBrowserType;await run('iphone',phone)}finally{await browser.close()}
