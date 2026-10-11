import { draftGlobePreview } from '../trip-draft/globe'
import type { TripDraft } from '../trip-draft/core'
import type { ArcDescriptor } from '../travel-core/models'
/** Server acknowledgement is a prerequisite. No optimistic data or statistics. */
export function acknowledgedJourney(draft:TripDraft, ok:boolean, creating:boolean) {
  if(!ok || !creating || draft.status!=='completed')return null
  const preview=draftGlobePreview(draft)
  return preview.arcs.length ? {tripId:draft.id,arcs:preview.arcs} : null
}
export const LEG_DURATION=3000
export function journeyFrame(arcs:readonly ArcDescriptor[],elapsed:number) {
  const index=Math.min(arcs.length-1,Math.floor(Math.max(0,elapsed)/LEG_DURATION))
  return {index,progress:Math.min(1,Math.max(0,(elapsed-index*LEG_DURATION)/LEG_DURATION)),done:!arcs.length||elapsed>=arcs.length*LEG_DURATION}
}
export function animationAllowed(reduced:boolean,hidden:boolean,lowPower:boolean) {return !reduced&&!hidden&&!lowPower}
