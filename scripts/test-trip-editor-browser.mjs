/* Cloud-only browser regression: needs the environment's Playwright and Chromium.
   Start a local production build server; TEST_URL defaults to localhost:3005.
   This uses isolated test contexts, never the user's browser storage. */
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const { chromium, devices } = createRequire(import.meta.url)('playwright')
const url = process.env.TEST_URL || 'http://127.0.0.1:3005'

async function run(browser, name, options) {
  const context = await browser.newContext({ ...options, locale: 'zh-TW' })
  const page = await context.newPage(), errors = [], searches = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('response', res => { if (res.url().includes('/api/airports?')) searches.push(res) })
  await page.addInitScript(() => {
    localStorage.setItem('globetrotter:v1', JSON.stringify({ version: 4, state: {
      statuses: { '158': 'visited', '392': 'wishlist', '300': 'blocked' },
      notes: { '158': '不要覆寫既有筆記' }, reviews: { '158': { rating: 5, liked: '美食', visits: ['2025-10'] } },
      theme: 'dark', locale: 'zh-TW', localePinned: true, autoSpin: false,
      zoomLocked: false, southUp: false, layers: { airports: false, stations: false, ports: false },
    } }))
    localStorage.setItem('globetrotter', 'legacy-sentinel-do-not-touch')
  })
  try {
    await page.goto(url,{ waitUntil: 'domcontentloaded' })
    if (options.isMobile) await page.getByRole('button',{ name:'搜尋與我的旅行', exact:true }).click()
    await page.getByRole('button',{ name:'建立旅行', exact:true }).waitFor({ state:'visible' })
    const baseline = await page.evaluate(() => ({ current:localStorage.getItem('globetrotter:v1'),legacy:localStorage.getItem('globetrotter') }))
    assert.equal(searches.length,0,'No airport requests before editor/search')
    await page.getByRole('button',{ name:'建立旅行',exact:true }).click()
    const dialog=page.getByRole('dialog',{ name:'旅行編輯',exact:true })
    await dialog.waitFor(); await dialog.getByText('預覽／尚未儲存',{ exact:true }).waitFor()
    const viewport=page.viewportSize(), box=await dialog.boundingBox()
    assert.ok(box.width<=viewport.width+1 && box.height<=viewport.height+1,'Editor fits viewport')
    const overflow=await dialog.evaluate(el => {
      const elements=[el,...el.querySelectorAll('input,select,textarea,button,fieldset')]
      const rect=el.getBoundingClientRect()
      return elements.filter(e => { const r=e.getBoundingClientRect(); return r.width && (r.left<rect.left-1 || r.right>rect.right+1) }).map(e=>e.tagName)
    })
    assert.deepEqual(overflow,[],'No horizontal control overflow')
    async function add(q,expectedCode) {
      await dialog.getByRole('searchbox',{ name:'搜尋機場',exact:true }).fill(q)
      const item=dialog.locator('li').filter({ has:page.getByRole('button',{ name:'加入路線',exact:true }) }).filter({ hasText:expectedCode }).first()
      await item.getByRole('button',{ name:'加入路線',exact:true }).click()
    }
    await add('RCTP','TPE'); await add('杜拜','DXB'); await add('雅典','ATH')
    await dialog.getByLabel('旅行名稱（選填）',{ exact:true }).fill('希臘旅行預覽')
    await dialog.getByLabel('國家停留性質 DXB',{ exact:true }).selectOption('transit')
    const preview=dialog.locator('section[aria-labelledby="trip-preview-title"]')
    assert.ok((await preview.innerText()).includes('2 段航班・3 個機場停留事件'))
    assert.equal(await dialog.getByLabel('整趟旅行狀態',{exact:true}).count(),0,'Completed trips need no status selector')
    assert.ok((await preview.innerText()).includes('去過 3 國・實際旅遊 2 國・僅轉機 1 國'))
    assert.ok((await preview.innerText()).includes('阿拉伯聯合大公國') || (await preview.innerText()).includes('阿聯酋'))
    const colors=await preview.locator('li span[aria-hidden]').evaluateAll(els=>els.map(e=>e.style.background))
    assert.equal(colors.filter(c=>c==='rgb(34, 197, 94)').length,2)
    assert.equal(colors.filter(c=>c==='rgb(59, 130, 246)').length,1)
    const legs=dialog.locator('fieldset')
    await legs.nth(0).getByLabel('飛行日期',{ exact:true }).fill('2026-10-09')
    await legs.nth(0).getByLabel('航空公司',{ exact:true }).fill('航空公司 A')
    await legs.nth(0).getByLabel('航班編號',{ exact:true }).fill('EK367')
    await legs.nth(1).getByLabel('航班編號',{ exact:true }).fill('EK209')
    await legs.nth(1).getByLabel('備註',{ exact:true }).fill('第二段備註')
    await dialog.getByLabel('新增機場的位置',{ exact:true }).selectOption('2')
    await add('NRT','NRT')
    assert.equal(await dialog.locator('fieldset').count(),3)
    assert.equal(await dialog.locator('fieldset').nth(0).getByLabel('航班編號',{ exact:true }).inputValue(),'EK367')
    assert.equal(await dialog.locator('fieldset').nth(1).getByLabel('航班編號',{ exact:true }).inputValue(),'')
    await dialog.getByRole('button',{ name:'往前移 NRT',exact:true }).click()
    assert.equal(await dialog.locator('fieldset').nth(0).getByLabel('航班編號',{ exact:true }).inputValue(),'')
    await dialog.getByRole('button',{ name:'移除停留 NRT',exact:true }).click()
    assert.equal(await dialog.locator('fieldset').count(),2)
    assert.equal(await dialog.getByLabel('整趟旅行狀態',{exact:true}).count(),0,'Completed trips need no status selector')
    await preview.scrollIntoViewIfNeeded()
    await page.screenshot({ path:`/tmp/globetrotter-trip-${name}.png` })
    await dialog.getByRole('button',{ name:'關閉編輯器',exact:true }).click()
    await page.getByRole('button',{ name:'建立旅行',exact:true }).click()
    assert.equal(await dialog.getByLabel('旅行名稱（選填）',{ exact:true }).inputValue(),'希臘旅行預覽')
    assert.equal(await dialog.locator('fieldset').count(),2)
    // Focus remains in the native modal even while the mobile country drawer is open.
    await dialog.getByRole('button',{ name:'關閉編輯器',exact:true }).focus()
    await page.keyboard.press('Shift+Tab')
    assert.equal(await page.evaluate(()=>document.activeElement.closest('dialog')?.getAttribute('aria-labelledby')),'trip-editor-title')
    await page.keyboard.press('Escape'); await dialog.waitFor({ state:'hidden' })
    assert.deepEqual(await page.evaluate(() => ({ current:localStorage.getItem('globetrotter:v1'),legacy:localStorage.getItem('globetrotter') })),baseline,
      'Existing storage bytes and records must remain unchanged')
    for(const response of searches) { assert.equal(response.status(),200); assert.ok((await response.json()).results.length<=12) }
    assert.deepEqual(errors,[],'No JavaScript runtime errors')
    await page.reload({ waitUntil:'domcontentloaded' })
    if(options.isMobile) await page.getByRole('button',{ name:'搜尋與我的旅行',exact:true }).click()
    await page.getByRole('button',{ name:'建立旅行',exact:true }).click()
    await dialog.waitFor(); assert.equal(await dialog.locator('fieldset').count(),0,'Reload discards unsaved draft')
    console.log(`PASS ${name}: route search/edit/completed/colors/metadata/modal/RWD/storage/reload, requests=${searches.length}`)
  } catch(e) {
    await page.screenshot({ path:`/tmp/globetrotter-trip-${name}-failure.png` }).catch(()=>{})
    throw e
  } finally { await context.close() }
}
;(async()=>{
  const browser=await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true,
    args:['--no-sandbox','--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
  try {
    await run(browser,'desktop',{ viewport:{ width:1440,height:1000 } })
    const iphone={ ...devices['iPhone 13'] }; delete iphone.defaultBrowserType
    await run(browser,'iphone-390',iphone)
    await run(browser,'mobile-320',{ ...iphone,viewport:{ width:320,height:640 } })
  } finally { await browser.close() }
})().catch(e=>{ console.error(e);process.exitCode=1 })
