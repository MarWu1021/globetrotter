import { buildArcDescriptors } from '../travel-core/core'
import { toCoreAirports } from '../airport-data/integration'
import { resolveCountry } from '../airport-data/countries'
import type { CatalogAirport } from '../airport-data/types'
import { previewTripDraft, type TripDraft } from './core'

export function draftGlobePreview(draft: TripDraft) {
  const preview = previewTripDraft(draft)
  if (preview.kind !== 'ready') return { arcs: [], colors: {} as Record<string,string>, flatColors: {} as Record<string,string> }
  const airports = [...new Map(draft.stops.map(s=>[s.airport.id,s.airport])).values()]
  const arcs = buildArcDescriptors([preview.trip],toCoreAirports(airports),true)
  const colors: Record<string,string> = {}, flatColors: Record<string,string> = {}
  for (const country of preview.footprint.countries) {
    const mapping=resolveCountry(country.countryCode)
    for (const geoId of mapping?.globeGeoIds ?? []) colors[geoId]=country.color
    for (const geoId of mapping?.flatGeoIds ?? []) flatColors[geoId]=country.color
  }
  return { arcs, colors, flatColors }
}
export function markerSubset(groups: readonly (readonly CatalogAirport[])[], limit=48, separation=0): CatalogAirport[] {
  const result=new Map<string,CatalogAirport>()
  for(const group of groups) for(const a of group) {
    const country=resolveCountry(a.sourceCountryCode)
    if(country?.isoCode===a.isoCountryCode && !country.requiresReview && !a.closed && !a.retired && !a.history.some(h=>h.isoCountryCode!==a.isoCountryCode) && !result.has(a.id) && result.size<limit && [...result.values()].every(b=>Math.hypot(a.latitude-b.latitude, Math.min(Math.abs(a.longitude-b.longitude),360-Math.abs(a.longitude-b.longitude)))>=separation)) result.set(a.id,structuredClone(a))
  }
  return [...result.values()]
}
export function isAirportTap(start: {x:number;y:number}, end:{x:number;y:number}, multiple:boolean) {
  return !multiple && Math.hypot(end.x-start.x,end.y-start.y)<=8
}
/** Controls change events include auto-spin; only actual start/end gestures hide markers. */
export function markerMotionController(setHidden:(hidden:boolean)=>void, delay=150) {
  let timer:ReturnType<typeof setTimeout>|undefined
  return {
    start() { clearTimeout(timer); setHidden(true) },
    end() { clearTimeout(timer); timer=setTimeout(()=>setHidden(false),delay) },
    dispose() { clearTimeout(timer) },
  }
}

/** Rendering-only clearance: react-globe.gl uses a cubic Bezier, so the domain
 * altitude alone is insufficient for near-antipodal routes. Match its default
 * angular-distance scale while keeping the 2A descriptor unchanged. */
export function renderedArcAltitude(d:{distanceKm:number;altitude:number}):number {
  return Math.max(d.altitude,d.distanceKm/6371/4)
}
