/** Original SVG source; render locally with the already-installed sharp dependency. */
import sharp from 'sharp'
import fs from 'node:fs/promises'
const source = await fs.readFile('public/icons/island.svg')
for (const [file,size] of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]]) {
  await sharp(source).resize(size,size).flatten({background:'#DCE9ED'}).png().toFile('public/icons/'+file)
}
// Inset the illustration to keep essential island details inside the 40% radius safe zone.
await sharp({create:{width:512,height:512,channels:3,background:'#DCE9ED'}})
  .composite([{input:await sharp(source).resize(400,400).png().toBuffer(),left:56,top:56}])
  .png().toFile('public/icons/maskable-512.png')
await fs.writeFile('src/app/icon.svg',source)
console.log('Generated 192px, 512px, maskable 512px and Apple 180px icons from original island.svg.')
