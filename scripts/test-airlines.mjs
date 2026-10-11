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
