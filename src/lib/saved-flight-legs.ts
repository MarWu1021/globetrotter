import { greatCircleDistanceKm } from "./travel-core/core"
import type { SavedTrip } from "./trip-storage/core"
import type { CatalogAirport } from "./airport-data/types"
import type { DraftStop } from "./trip-draft/core"

export type MileageIssueReason = "incomplete" | "airport" | "coordinates" | "duplicate"
export interface MileageIssue {
  tripId: string | null
  tripTitle: string
  flightId: string | null
  from: string | null
  to: string | null
  reason: MileageIssueReason
}
export interface SavedFlightLeg {
  id: string
  from: CatalogAirport
  to: CatalogAirport
  distanceKm: number
  /** All replayed copies, for detecting conflicting airline evidence without altering mileage. */
  airlines: unknown[]
}
export interface SavedFlightCollection {
  legs: SavedFlightLeg[]
  excludedLegCount: number
  excludedTripCount: number
  duplicateLegCount: number
  issues: MileageIssue[]
}
const identity = (value: unknown): value is string => typeof value === "string" && !!value.trim()
function identifiedAirport(a: CatalogAirport | undefined): a is CatalogAirport {
  // A saved snapshot is the authority; IATA is optional and never used to guess coordinates.
  return !!a && a.source === "ourairports" && identity(a.id) && identity(a.sourceId) &&
    /^\d+$/.test(a.sourceId) && identity(a.ident) && identity(a.name)
}
const label = (a: CatalogAirport | undefined): string | null =>
  a ? [a.iata, a.icao, a.ident, a.name].find(identity) ?? null : null

/** Only confirmed saved records are inputs. No map arcs, editor state, catalog fetch or storage. */
export function collectSavedFlightLegs(records: readonly SavedTrip[]): SavedFlightCollection {
  const flights = new Map<string, { signature: string; distance: number | null; issue: MileageIssue; from: CatalogAirport | undefined; to: CatalogAirport | undefined; airlines: unknown[] }>()
  const issues: MileageIssue[] = []
  let excludedTripCount = 0, duplicateLegCount = 0, unidentifiedLegCount = 0
  for (const record of records) {
    const draft = record?.draft
    if (!draft || !["draft", "planned", "in_progress", "completed"].includes(draft.status)) {
      excludedTripCount++
      issues.push({ tripId: null, tripTitle: "", flightId: null, from: null, to: null, reason: "incomplete" })
      continue
    }
    if (draft?.status !== "completed") continue
    const base = { tripId: identity(draft.id) ? draft.id : null,
      tripTitle: typeof draft.title === "string" ? draft.title : "" }
    if (!base.tripId || !Array.isArray(draft.stops) || !Array.isArray(draft.legs) || !draft.legs.length) {
      excludedTripCount++
      issues.push({ ...base, flightId: null, from: null, to: null, reason: "incomplete" })
      continue
    }
    const stops = new Map<string, DraftStop>(), stopIndices = new Map<string, number>()
    const ambiguousStops = new Set<string>()
    draft.stops.forEach((stop, index) => {
      if (!identity(stop?.id)) return
      if (stops.has(stop.id)) ambiguousStops.add(stop.id)
      stops.set(stop.id, stop); stopIndices.set(stop.id, index)
    })
    for (const leg of draft.legs) {
      const from = stops.get(leg?.fromStopId), to = stops.get(leg?.toStopId)
      const a = from?.airport, b = to?.airport
      const issue: MileageIssue = { ...base, flightId: identity(leg?.id) ? leg.id : null,
        from: label(a), to: label(b), reason: "incomplete" }
      let distance: number | null = null
      if (issue.flightId && from && to && from.id !== to.id &&
        !ambiguousStops.has(from.id) && !ambiguousStops.has(to.id) &&
        stopIndices.get(to.id) === stopIndices.get(from.id)! + 1) {
        if (!identifiedAirport(a) || !identifiedAirport(b)) issue.reason = "airport"
        else if (a.id !== b.id) {
          distance = greatCircleDistanceKm(a, b)
          if (distance === null) issue.reason = "coordinates"
        }
      }
      if (!issue.flightId) { unidentifiedLegCount++; issues.push(issue); continue }
      const signature = JSON.stringify([base.tripId, leg.fromStopId, leg.toStopId,
        a?.id, a?.source, a?.sourceId, a?.latitude, a?.longitude,
        b?.id, b?.source, b?.sourceId, b?.latitude, b?.longitude, distance, issue.reason])
      const previous = flights.get(issue.flightId)
      if (!previous) flights.set(issue.flightId, { signature, distance, issue, from: a, to: b, airlines: [leg.airline] })
      else {
        duplicateLegCount++
        previous.airlines.push(leg.airline)
        // Conflicting copies of one flight are excluded; never arbitrarily choose a revision.
        if (previous.signature !== signature) {
          previous.distance = null
          previous.issue.reason = "duplicate"
        }
      }
    }
  }
  const legs: SavedFlightLeg[] = []
  for (const [id, flight] of flights) {
    if (flight.distance === null) issues.push(flight.issue)
    else legs.push({ id, from: flight.from!, to: flight.to!, distanceKm: flight.distance, airlines: flight.airlines })
  }
  return { legs, excludedLegCount: unidentifiedLegCount + [...flights.values()].filter(f => f.distance === null).length,
    excludedTripCount, duplicateLegCount, issues }
}
