import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const mod={exports:{}}
const code=ts.transpileModule(fs.readFileSync('src/lib/airlines/catalog.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
new vm.Script(`(function(exports){${code}})`).runInThisContext()(mod.exports)
const {AIRLINES,searchAirlines,airlineValue}=mod.exports

test('curated catalog has unique valid codes and source references',()=>{
 assert.ok(AIRLINES.length>=75);assert.equal(new Set(AIRLINES.map(a=>a.iata)).size,AIRLINES.length)
 assert.ok(AIRLINES.every(a=>/^[A-Z0-9]{2}$/.test(a.iata)&&a.name&&a.zhTW&&a.source.startsWith('https://en.wikipedia.org/wiki/')))
})
test('IATA search is case insensitive and exact code is ranked first',()=>{assert.equal(searchAirlines('ci')[0].name,'China Airlines');assert.equal(searchAirlines('  ｂｒ  ')[0].iata,'BR')})
test('Taiwan Chinese names, aliases and English names are searchable',()=>{
 for(const [q,code] of [['華航','CI'],['中華','CI'],['长荣','BR'],['星宇','JX'],['台灣虎航','IT'],['Emirates','EK'],['Scoot','TR'],['樂桃','MM']])assert.equal(searchAirlines(q)[0].iata,code)
})
test('international low-cost carriers are included without paid APIs',()=>{for(const code of ['FR','U2','W6','AK','5J','TR','IT','MM'])assert.equal(searchAirlines(code)[0].iata,code)})
test('results are bounded and unrelated/blank inputs do not render the catalog',()=>{assert.equal(searchAirlines('').length,0);assert.equal(searchAirlines('not-a-known-airline').length,0);assert.ok(searchAirlines('Air',100).length<=12)})
test('selection preserves code and canonical name in the unchanged airline string',()=>{
 const selected=searchAirlines('CI')[0];assert.equal(airlineValue(selected),'CI · China Airlines')
 const saved=JSON.parse(JSON.stringify({airline:airlineValue(selected)}));assert.equal(saved.airline,airlineValue(selected))
})
test('autocomplete retains legacy values and supports keyboard/listbox controls',()=>{
 const ui=fs.readFileSync('src/components/airline-autocomplete.tsx','utf8')
 for(const text of ['role="combobox"','role="listbox"','aria-activedescendant','ArrowDown','ArrowUp',"e.key==='Enter'",'value={value}'])assert.ok(ui.includes(text),text)
 assert.doesNotMatch(ui,/fetch\(|localStorage/)
})

// The visual matcher must distinguish the new colors from ocean/gray and each other.
test('soft footprint pixel assertions reject ocean, gray and the other status',async()=>{
 const {footprintPixel}=await import('./browser-color-match.mjs')
 for(const [name,rgb] of [['green',[111,158,145]],['blue',[139,182,206]]]){
  assert.equal(footprintPixel(...rgb,name),true)
  assert.equal(footprintPixel(...rgb.map(v=>Math.round(v*.7)),name),true)
  assert.equal(footprintPixel(...rgb,name==='green'?'blue':'green'),false)
  for(const other of [[216,224,227],[168,199,209],[220,233,237],[255,255,255]])assert.equal(footprintPixel(...other,name),false)
 }
})

const placement={exports:{}}
new vm.Script(`(function(exports){${ts.transpileModule(fs.readFileSync('src/lib/airlines/placement.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText}})`).runInThisContext()(placement.exports)
const {placeAirlineMenu}=placement.exports
const area={left:6,top:80,right:314,bottom:740}
for(const [name,anchor,height,side] of [
 ['upper field opens down',{left:160,top:100,right:290,bottom:144},80,'down'],
 ['middle field prefers down when it fits',{left:160,top:350,right:290,bottom:394},80,'down'],
 ['footer field opens up',{left:160,top:680,right:290,bottom:724},80,'up'],
 ['both spaces constrained uses the larger space',{left:160,top:360,right:290,bottom:404},600,'down'],
])test(`airline placement: ${name}`,()=>{
 const p=placeAirlineMenu(anchor,area,height);assert.equal(p.side,side)
 assert.ok(p.left>=area.left&&p.left+p.width<=area.right)
 assert.ok(p.top>=area.top&&p.top+Math.min(height,p.maxHeight)<=area.bottom)
 if(side==='up')assert.ok(p.top+Math.min(height,p.maxHeight)<=anchor.top-4)
 else assert.ok(p.top>=anchor.bottom+4)
})
test('keyboard and safe-area bounds constrain the menu without changing the airport or airline value',()=>{
 const bounds={left:6,top:85,right:314,bottom:300},anchor={left:160,top:180,right:290,bottom:224}
 const p=placeAirlineMenu(anchor,bounds,600);assert.equal(p.side,'up');assert.equal(p.maxHeight,91)
 assert.deepEqual(anchor,{left:160,top:180,right:290,bottom:224});assert.ok(p.top>=bounds.top)
})
test('narrow viewports clamp dropdown width rather than overflowing the page',()=>{
 const p=placeAirlineMenu({left:200,top:200,right:305,bottom:244},area,100)
 assert.equal(p.width,280);assert.equal(p.left,34)
})
test('offscreen inputs and invalid bounds do not leave clickable detached suggestions',()=>{
 for(const anchor of [{left:0,right:100,top:0,bottom:40},{left:0,right:100,top:800,bottom:844},{left:400,right:500,top:100,bottom:144}])assert.equal(placeAirlineMenu(anchor,area,80),null)
 assert.equal(placeAirlineMenu({left:1,right:30,top:100,bottom:144},{...area,right:0},80),null)
 assert.equal(placeAirlineMenu({left:NaN,right:30,top:100,bottom:144},area,80),null)
})
