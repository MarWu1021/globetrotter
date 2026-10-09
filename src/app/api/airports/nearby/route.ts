import { resolveCountry } from '@/lib/airport-data/countries'
export async function GET(request:Request) {
  const params=new URL(request.url).searchParams
  const lat=Number(params.get('lat')),lng=Number(params.get('lng'))
  if(!params.has('lat')||!params.has('lng')||!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180)
    return Response.json({error:'invalid-coordinates'},{status:400})
  const altitude=Number(params.get('altitude')??'1.8')
  if(!Number.isFinite(altitude)||altitude<=0) return Response.json({error:'invalid-altitude'},{status:400})
  const spacing=Math.max(0.025,Math.min(5,altitude*3))
  const {AIRPORT_CATALOG}=await import('@/lib/airport-data/catalog')
  const distance=(a:{latitude:number;longitude:number})=> {
    const r=Math.PI/180
    return Math.sin((a.latitude-lat)*r/2)**2+Math.cos(lat*r)*Math.cos(a.latitude*r)*Math.sin((a.longitude-lng)*r/2)**2
  }
  const eligible=AIRPORT_CATALOG.filter(a=>!a.closed&&!a.retired&&(a.type==='large_airport'||a.scheduledService)&&
    a.isoCountryCode&&!resolveCountry(a.sourceCountryCode)?.requiresReview)
  const result:typeof eligible=[]
  for(const a of eligible.sort((a,b)=>distance(a)-distance(b))) {
    // Sparse regional markers. Search still exposes airports skipped for density.
    if(result.every(b=>Math.hypot(a.latitude-b.latitude,Math.min(Math.abs(a.longitude-b.longitude),360-Math.abs(a.longitude-b.longitude)))>=spacing)) result.push(a)
    if(result.length===32) break
  }
  return Response.json({airports:result},{headers:{'Cache-Control':'no-store'}})
}
