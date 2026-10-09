import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require = createRequire(import.meta.url)
function load(file) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
  }}).outputText
  new vm.Script(`(function(exports,require){${code}\n})`).runInThisContext()(exports,
    s=>s.startsWith('@/')?require(path.resolve('src',s.slice(2))):require(s))
  return exports
}
const geo=load('src/lib/geo.ts')
process.stdout.write(JSON.stringify({
  flat:geo.countryFeatures.map(f=>({id:f.id,name:f.properties.name})),
  globe:geo.globeCountryFeatures.map(f=>({id:f.id,name:f.properties.name})),
  legacy:load('src/lib/transport-airports.ts').AIRPORTS,
})+'\n')
