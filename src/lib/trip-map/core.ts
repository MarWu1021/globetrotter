import { draftGlobePreview } from '../trip-draft/globe'
import type { SavedTrip } from '../trip-storage/core'
import { previewTripDraft } from '../trip-draft/core'
import { COUNTRY_MAPPINGS } from '../airport-data/countries'
import type { ArcDescriptor } from '../travel-core/models'

export const VISITED_COLOR = '#22c55e'
export const TRANSIT_COLOR = '#3b82f6'
export type MapColors = Record<string, string>
/** Visual composition only. Never changes legacy statuses/preferences or storage. */
export function mergeMapColors(...layers: readonly MapColors[]): MapColors {
  const result: MapColors = {}
  for (const layer of layers) for (const [id, color] of Object.entries(layer)) {
    if (result[id] !== VISITED_COLOR) result[id] = color
  }
  return result
}
export interface SavedArc extends ArcDescriptor { count: number; flightRefs: {tripId:string;flightId:string}[] }
/** Read the stored airport snapshots, not a new catalog revision; keep every flight.
 * Only identical directed endpoints/coordinates share a rendered line. */
export function savedTripMap(records: readonly SavedTrip[], statuses: Readonly<Record<string,string>>) {
  let colors: MapColors = {}, flatColors: MapColors = {}
  const countries = new Map<string, 'visited'|'transit'>(), arcs: ArcDescriptor[] = []
  let tripCount = 0
  for (const record of records) {
    if (record.draft.status !== 'completed') continue
    const p = previewTripDraft(record.draft)
    if (p.kind !== 'ready') continue
    tripCount++
    const map = draftGlobePreview(record.draft)
    colors = mergeMapColors(colors, map.colors); flatColors = mergeMapColors(flatColors, map.flatColors)
    arcs.push(...map.arcs)
    for (const c of p.footprint.countries) {
      if (countries.get(c.countryCode) !== 'visited') countries.set(c.countryCode,c.presence)
    }
  }
  for (const [id,status] of Object.entries(statuses)) if (status === 'visited') {
    const mapping = COUNTRY_MAPPINGS.find(c => !c.requiresReview && c.isoCode && c.legacyGeoIds.includes(id))
    countries.set(mapping?.isoCode ?? `legacy:${id}`, 'visited')
    // Preserve the selected legacy area even when its ISO mapping is unresolved.
    colors[id] = VISITED_COLOR; flatColors[id] = VISITED_COLOR
    for (const geoId of mapping?.globeGeoIds ?? []) colors[geoId] = VISITED_COLOR
    for (const geoId of mapping?.flatGeoIds ?? []) flatColors[geoId] = VISITED_COLOR
  }
  const grouped = new Map<string,SavedArc>()
  for (const arc of arcs) {
    const key = JSON.stringify([arc.departureAirportId,arc.arrivalAirportId,arc.startLat,arc.startLng,arc.endLat,arc.endLng])
    let group = grouped.get(key)
    if (!group) { group = {...arc,count:0,flightRefs:[]}; grouped.set(key,group) }
    group.count++; group.flightRefs.push({tripId:arc.tripId,flightId:arc.flightId})
  }
  return {colors,flatColors,arcs,renderedArcs:[...grouped.values()],tripCount,flightCount:arcs.length,
    countryCount:countries.size,visitedCount:[...countries.values()].filter(p=>p==='visited').length,
    transitCount:[...countries.values()].filter(p=>p==='transit').length}
}
