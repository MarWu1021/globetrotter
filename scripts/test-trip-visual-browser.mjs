/** Production-browser visual regression, using real pixels from Chromium's
 * software WebGL renderer. No application test hooks or user storage writes.
 * Run with the same optional Playwright environment as the other browser tests. */
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium, devices } = require('playwright')
const sharp = require('sharp')
const {geoContains}=require('d3-geo')
const {writeFileSync}=require('node:fs')
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--no-proxy-server', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const samples = { TW: [23.7, 121], JP: [36.2, 138.2], AE: [24.2, 54.4], GR: [39, 22] }
const names = { TW: '台灣', JP: '日本', AE: '阿拉伯聯合大公國', GR: '希臘' }
const ids = { TW: '158', JP: '392', AE: '784', GR: '300' }
const matches = (r,g,b,color) => color === 'green' ? g > 100 && g > r * 1.4 && g > b * 1.25 : color === 'red' ? r > 160 && r > g * 1.5 && r > b * 1.5 : color === 'purple' ? b > 140 && r > 100 && g < r * .8 : b > 160 && b - r > 80 && b - g > 60
async function pixels(buffer, color, point) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let count = 0
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (point && (Math.abs(x-point.x)>4 || Math.abs(y-point.y)>4)) continue
    const i = (y*info.width+x)*info.channels
    if (matches(data[i],data[i+1],data[i+2],color)) count++
  }
  return count
}
async function attachGlobe(page) {
  await page.waitForFunction(() => {
    for (const el of document.querySelectorAll('*')) {
      const k = Object.keys(el).find(k => k.startsWith('__reactFiber$'))
      if (!k) continue
      for (let f = el[k]; f; f = f.return) if (f.ref?.current?.pointOfView) {
        window.visualGlobe = f.ref.current;
        const renderer=visualGlobe.renderer()
        if(!renderer.visualTracked){
          renderer.visualTracked=true
          const render=renderer.render.bind(renderer)
          renderer.render=(scene,camera)=>{
            render(scene,camera)
            if(scene!==visualGlobe.scene())return
            const colors={}
            scene.traverse(obj=>{
              if(obj.__globeObjType==='polygon'){
                const id=obj.__data?.data?.id,material=obj.children[0]?.material?.at(-1)
                if(id&&material?.color)colors[id]='#'+material.color.getHexString()
              }
            })
            window.visualLastRender={sequence:(window.visualLastRender?.sequence??0)+1,
              frame:renderer.info.render.frame,camera:camera.position.toArray(),colors,
              width:renderer.domElement.width,height:renderer.domElement.height}
          }
        }
        return true
      }
    }
    return false
  })
}
const focus = {TW:[25.0777,121.233002],JP:[33.545217,133.670166],AE:[25.24979,55.370992],GR:[37.936401,23.9445]}
async function paintedFrame(page,country,after) {
  await page.evaluate(()=>visualGlobe.resumeAnimation())
  await page.waitForFunction(({target,after})=>{
    const g=visualGlobe,r=g.renderer(),last=window.visualLastRender,pov=g.pointOfView()
    const expected=JSON.parse(document.querySelector('[data-preview-colors]').dataset.previewColors)
    if(!last||last.sequence<=after||Math.abs(pov.lat-target[0])>1e-4||Math.abs(pov.lng-target[1])>1e-4)return false
    if(!g.camera().position.toArray().every((v,i)=>Math.abs(v-last.camera[i])<1e-7))return false
    if(last.width!==r.domElement.width||last.height!==r.domElement.height||r.getContext().isContextLost())return false
    if(!Object.entries(expected).every(([id,color])=>last.colors[id]===color))return false
    // Freeze ONLY after the renderer has completed the matching camera/material frame.
    g.pauseAnimation()
    r.getContext().finish()
    return true
  },{target:focus[country],after},{timeout:30000})
}
async function run(name,options) {
  const context = await browser.newContext({ ...options, locale: 'zh-TW' })
  const page = await context.newPage(), errors = []
  page.on('pageerror',e=>errors.push(e.message))
  // Fresh, isolated browser fixture; never touches an existing user's browser.
  await page.addInitScript(() => {
    localStorage.setItem('globetrotter:v1',JSON.stringify({ version:4, state:{
      statuses:{'158':'blocked','392':'wishlist','250':'visited'}, notes:{'158':'原筆記'}, reviews:{'158':{rating:5}},
      theme:'dark',locale:'zh-TW',localePinned:true,autoSpin:false,layers:{airports:false,stations:false,ports:false} } }))
    navigator.geolocation.getCurrentPosition = success => { window.lateLocation = success }
  })
  await page.route(/\/api\/flight\?/,r=>r.fulfill({json:{flight:null}}))
  try {
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3005')
    if (options.isMobile) await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click()
    let baseline
    // Real user action reproducing the stale country focus / zoom regression.
    await page.getByRole('textbox',{name:'搜尋國家',exact:true}).fill('阿根廷')
    await page.getByRole('button',{name:/阿根廷/}).first().click()
    await page.waitForTimeout(800)
    if (options.isMobile) await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click()
    await page.getByRole('button',{name:'建立旅行',exact:true}).click()
    baseline = await page.evaluate(()=>localStorage.getItem('globetrotter:v1'))
    const editor = page.getByRole('dialog',{name:'旅行編輯',exact:true})
    async function add(code) {
      await editor.getByRole('searchbox').fill(code)
      await editor.locator('li').first().getByRole('button',{name:'加入路線',exact:true}).click()
    }
    async function view(mode) { await page.getByRole('button',{name:mode==='map'?'平面地圖':'地球',exact:true}).click() }
    async function unchanged() { assert.equal(await page.evaluate(()=>localStorage.getItem('globetrotter:v1')),baseline) }
    async function flat(country,color) {
      const path = page.locator(`path[data-country-id="${ids[country]}"]`).first()
      assert.equal(await path.getAttribute('fill'),color==='green'?'#22c55e':'#3b82f6')
      // SVG has an intentional 150ms CSS fill transition; attribute equality
      // alone precedes the painted/computed color. Wait for its real endpoint.
      await page.waitForFunction(({id,color})=>getComputedStyle(document.querySelector(`path[data-country-id="${id}"]`)).fill===color,{id:ids[country],color:color==='green'?'rgb(34, 197, 94)':'rgb(59, 130, 246)'})
      const image = await path.screenshot({path:`/tmp/flat-visual-${name}-${country}.png`})
      console.log('FLAT',name,country,await path.boundingBox())
      assert.ok(await pixels(image,color) >= 1, `${name}: ${country} actually visible in flat-map screenshot`)
    }
    async function globe(country,color) {
      const after=await page.evaluate(()=>window.visualLastRender?.sequence??0)
      await page.getByRole('button',{name:`查看旅行預覽 · ${names[country]}`,exact:true}).click()
      await paintedFrame(page,country,after)
      const coordinates = await page.evaluate(([lat,lng])=>{visualGlobe.pauseAnimation();return visualGlobe.getScreenCoords(lat,lng)},samples[country])
      const canvas = page.locator('canvas').first(), box = await canvas.boundingBox()
      if(options.isMobile) {
        const layout=await page.evaluate(()=>({scroll:window.scrollY,height:innerHeight,
          panel:document.querySelector('section[aria-label="查看旅行預覽"]').getBoundingClientRect().toJSON()}))
        assert.equal(layout.scroll,0,'Mobile viewport remains at the page top')
        assert.ok(box.y+box.height<=layout.panel.top+1,'Mobile panel stays below the actual canvas')
        assert.ok(layout.panel.bottom<=layout.height+1,'Mobile exit controls stay inside the viewport')
      }
      // Screenshot reads the rendered WebGL frame, not React data-* / accessor output.
      const image = await page.screenshot({path:`/tmp/trip-visual-${name}-${country}.png`})
      const scale = await page.evaluate(()=>devicePixelRatio)
      const diagnostic=await page.evaluate(({sample,ids,wantedId})=>{
        const g=visualGlobe,r=g.renderer(),c=r.domElement,controls=g.controls();let geometry
        g.scene().traverse(obj=>{if(obj.__globeObjType==='polygon'&&obj.__data?.data?.id===wantedId)geometry=obj.__data.data.geometry})
        return {geometry,
          pov:g.pointOfView(),sample,projected:g.getScreenCoords(...sample),frame:r.info.render.frame,
          devicePixelRatio,rendererPixelRatio:r.getPixelRatio(),canvas:{width:c.width,height:c.height,box:c.getBoundingClientRect().toJSON()},
          camera:g.camera().position.toArray(),autoRotate:controls.autoRotate,damping:controls.enableDamping,
          lastRendered:window.visualLastRender?{...window.visualLastRender,colors:Object.fromEntries(Object.values(ids).map(id=>[id,window.visualLastRender.colors[id]]))}:null,contextLost:r.getContext().isContextLost(),previewColors:document.querySelector('[data-preview-colors]')?.dataset.previewColors,
          sampleHit:document.elementFromPoint(c.getBoundingClientRect().x+g.getScreenCoords(...sample).x,c.getBoundingClientRect().y+g.getScreenCoords(...sample).y)?.tagName
        }
      },{sample:samples[country],ids,wantedId:ids[country]})
      assert.ok(geoContains(diagnostic.geometry,[samples[country][1],samples[country][0]]),'Sample coordinate is inside the rendered country geometry')
      delete diagnostic.geometry
      assert.equal(diagnostic.sampleHit,'CANVAS','Projected inland sample is not covered by a toolbar or marker')
      assert.ok(coordinates.x>0&&coordinates.x<box.width&&coordinates.y>0&&coordinates.y<box.height,'Inland sample remains inside the actual canvas')
      diagnostic.pixelCount=await pixels(image,color,{x:(box.x+coordinates.x)*scale,y:(box.y+coordinates.y)*scale})
      console.log('DIAGNOSTIC',name,country,JSON.stringify(diagnostic))
      writeFileSync(`/tmp/stage-c-diagnostic-${name}-${country}.json`,JSON.stringify(diagnostic,null,2))
      assert.ok(await pixels(image,color,{x:(box.x+coordinates.x)*scale,y:(box.y+coordinates.y)*scale}) >= 4,
        `${name}: ${country} rendered ${color} at known inland coordinates`)
      console.log(`PASS pixels ${name} ${country} ${color}`)
      await page.evaluate(()=>visualGlobe.resumeAnimation())
    }
    await add('TPE'); await add('KCZ')
    assert.equal(await editor.getByLabel('整趟旅行狀態',{exact:true}).count(),0,'Completed trips need no status selector')
    await editor.getByRole('button',{name:'查看旅行預覽',exact:true}).click()
    await view('map'); await flat('TW','green'); await flat('JP','green')
    await view('globe'); await attachGlobe(page); await globe('JP','green')
    const initial = await page.evaluate(()=>visualGlobe.pointOfView())
    assert.ok(Math.abs(initial.lng-133.67)<1,'Travel camera is not overridden by Argentina focus')
    await globe('TW','green')
    // Repeated country button clicks must refocus after a real pointer drag,
    // even if the selected airport identity has not changed.
    const beforeDrag = await page.evaluate(()=>visualGlobe.pointOfView())
    const box = await page.locator('canvas').first().boundingBox()
    await page.mouse.move(box.x+box.width*.4,box.y+box.height*.3)
    await page.mouse.down(); await page.mouse.move(box.x+box.width*.6,box.y+box.height*.3,{steps:6}); await page.mouse.up()
    const afterDrag = await page.evaluate(()=>visualGlobe.pointOfView())
    assert.ok(Math.abs(afterDrag.lng-beforeDrag.lng)>.1,'Drag really changed the camera')
    await globe('TW','green')
    const afterRefocus=await page.evaluate(()=>visualGlobe.pointOfView())
    console.log('REFOCUS', {beforeDrag,afterDrag,afterRefocus})
    assert.ok(Math.abs(afterRefocus.lng-beforeDrag.lng)<.01,'Same country button recenters after drag')
    await globe('JP','green'); await unchanged()
    await page.getByRole('button',{name:'返回編輯器',exact:true}).click()
    await add('DXB'); await add('ATH')
    // TPE -> DXB -> ATH, keep the same stop identities when changing the route.
    await editor.getByRole('button',{name:'移除停留 KCZ',exact:true}).click()
    await editor.getByLabel('國家停留性質 DXB',{exact:true}).selectOption('transit')
    await editor.getByRole('button',{name:'查看旅行預覽',exact:true}).click()
    await view('map'); await flat('TW','green'); await flat('GR','green'); await flat('AE','blue')
    await view('globe'); await attachGlobe(page)
    await globe('AE','blue')
    // Deterministic regression: RAF callbacks still execute when no WebGL frame
    // is drawn. The former two-RAF wait must not accept this stale blue frame.
    await page.evaluate(()=>visualGlobe.pauseAnimation())
    const staleSequence=await page.evaluate(()=>window.visualLastRender.sequence)
    await page.getByRole('button',{name:'查看旅行預覽 · 台灣',exact:true}).click()
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    const stale=await page.evaluate(()=>({pov:visualGlobe.pointOfView(),camera:visualGlobe.camera().position.toArray(),last:window.visualLastRender,
      projected:visualGlobe.getScreenCoords(23.7,121),box:visualGlobe.renderer().domElement.getBoundingClientRect().toJSON(),scale:devicePixelRatio}))
    assert.equal(stale.last.sequence,staleSequence,'Two browser RAFs do not prove a WebGL render')
    assert.ok(stale.last.camera.some((v,i)=>Math.abs(v-stale.camera[i])>1), 'Stale frame retains the previous camera')
    const staleImage=await page.screenshot({path:`/tmp/stage-c-stale-frame-${name}.png`})
    writeFileSync(`/tmp/stage-c-stale-frame-${name}.json`,JSON.stringify(stale,null,2))
    assert.ok(await pixels(staleImage,'green',{x:(stale.box.x+stale.projected.x)*stale.scale,y:(stale.box.y+stale.projected.y)*stale.scale})<4,'Stale blue frame fails the original four-pixel assertion')
    await paintedFrame(page,'TW',staleSequence)
    await globe('TW','green'); await globe('GR','green'); await globe('AE','blue')
    await page.getByRole('button',{name:'離開旅行預覽',exact:true}).click()
    await unchanged()
    await page.getByRole('button',{name:'關閉',exact:true}).click() // Close the restored original country panel.
    await view('map')
    assert.equal(await page.locator('path[data-country-id="158"]').first().getAttribute('fill'),'#ef4444')
    assert.equal(await page.locator('path[data-country-id="392"]').first().getAttribute('fill'),'#a855f7')
    await page.getByRole('button',{name:'重設視角',exact:true}).click(); await page.waitForTimeout(400)
    assert.ok(await pixels(await page.locator('path[data-country-id="158"]').first().screenshot(),'red')>=1,'Original Taiwan red is rendered after exit')
    assert.ok(await pixels(await page.locator('path[data-country-id="392"]').first().screenshot(),'purple')>=1,'Original Japan wishlist purple is rendered after exit')
    // A separate real mounted globe requests location before preview starts.
    // Deliver that callback late, while the SAME globe is previewing Japan.
    await page.reload()
    await view('globe'); await attachGlobe(page)
    await page.waitForFunction(()=>typeof window.lateLocation==='function')
    if(options.isMobile) await page.getByRole('button',{name:'搜尋與我的旅行',exact:true}).click()
    await page.getByRole('button',{name:'建立旅行',exact:true}).click()
    baseline = await page.evaluate(()=>localStorage.getItem('globetrotter:v1'))
    await add('TPE'); await add('KCZ')
    assert.equal(await editor.getByLabel('整趟旅行狀態',{exact:true}).count(),0,'Completed trips need no status selector')
    await editor.getByRole('button',{name:'查看旅行預覽',exact:true}).click()
    await globe('JP','green')
    const beforeLocation = await page.evaluate(()=>visualGlobe.pointOfView())
    await page.evaluate(()=>window.lateLocation({coords:{latitude:-34,longitude:-64}}))
    await page.waitForTimeout(1300)
    assert.ok(Math.abs((await page.evaluate(()=>visualGlobe.pointOfView())).lng-beforeLocation.lng)<1,'Late geolocation cannot override preview')
    await globe('JP','green'); await unchanged()
    assert.deepEqual(errors,[])
    console.log(`PASS ${name}: actual globe/flat pixels, stale focus, late geolocation, two routes, exit colors, unchanged legacy data`)
  } finally { await context.close() }
}
try {
  if(process.env.VISUAL_DEVICE!=='iphone') await run('desktop',{viewport:{width:1100,height:720}})
  const phone = {...devices['iPhone 13']}; delete phone.defaultBrowserType
  if(process.env.VISUAL_DEVICE!=='desktop') await run('iphone',phone)
} finally { await browser.close() }
