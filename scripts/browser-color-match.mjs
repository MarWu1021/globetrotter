// Match the new material hue under WebGL lighting, not the old neon thresholds.
// Normalize brightness, but reject gray, ocean and the other footprint hue.
const palette={green:[111,158,145],blue:[139,182,206]}
const others=[[216,224,227],[168,199,209],[220,233,237],[72,107,128]]
const normalized=rgb=>rgb.map(v=>v/rgb.reduce((a,b)=>a+b,0))
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]))
export function footprintPixel(r,g,b,color){
  const target=palette[color]
  if(!target || Math.max(r,g,b)<70)return false
  const value=normalized([r,g,b]),difference=distance(value,normalized(target))
  const competitors=[...others,palette[color==='green'?'blue':'green']]
  return difference<.024 && competitors.every(rgb=>difference+.005<distance(value,normalized(rgb)))
}
