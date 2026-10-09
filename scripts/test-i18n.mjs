import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = fs.readFileSync('src/lib/i18n.ts', 'utf8') + '\nexport { en, zhTW }\n'
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
const sandbox = { exports: {}, require: () => ({}), navigator: { languages: ['zh-TW'] } }
vm.runInNewContext(compiled, sandbox)
const { en, zhTW, detectLocale, translate, LOCALES } = sandbox.exports
assert.deepEqual(Object.keys(zhTW).sort(), Object.keys(en).sort(), 'Every English interface key needs a Chinese translation')
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
for (const key of Object.keys(en)) {
  assert.deepEqual(placeholders(zhTW[key]), placeholders(en[key]), `Placeholder mismatch: ${key}`)
  assert(!/[\uFFFD]/.test(zhTW[key]), `Invalid text: ${key}`)
}
for (const [languages, expected] of [
  [['zh-TW'], 'zh-TW'], [['zh-Hant'], 'zh-TW'], [['zh-Hant-TW', 'en'], 'zh-TW'],
  [['en-US', 'zh-TW'], 'en'], [['fr-FR'], 'fr'], [['es-ES'], 'es'], [['de-DE'], 'de'],
  [['zh-CN', 'zh-TW'], 'zh-TW'], [['ja-JP'], 'en'],
]) {
  sandbox.navigator.languages = languages
  assert.equal(detectLocale(), expected, languages.join(','))
}
assert.equal(translate('zh-TW')('safety.level', { n: 2, short: '注意安全' }), '第 2 級 · 注意安全')
assert.equal(LOCALES.length, 5)
console.log('PASS complete Chinese dictionary, interpolation, browser detection, five locales')
