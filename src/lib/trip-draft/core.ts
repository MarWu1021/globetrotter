import type { CatalogAirport } from "../airport-data/types"
import { resolveCountry } from "../airport-data/countries"
import { deriveCatalogFootprint, toCoreAirports } from "../airport-data/integration"
import { buildTripFromRoute } from "../travel-core/core"
import type { FlightDetails, Presence, TripStatus } from "../travel-core/models"

export interface DraftStop { id: string; airport: CatalogAirport; countryPresence: Presence }
export interface DraftLeg extends FlightDetails { fromStopId: string; toStopId: string }
export interface TripDraft { id: string; title: string; status: TripStatus; stops: DraftStop[]; legs: DraftLeg[] }
export const createTripDraft = (id: string): TripDraft => ({ id, title: "", status: "draft", stops: [], legs: [] })
const edge = (from: string, to: string) => JSON.stringify([from, to])
/** Preserve fields only when the exact pair of stop EVENTS remains adjacent, never by array index. */
export function setDraftRoute(draft: TripDraft, stops: readonly DraftStop[]): TripDraft {
  if (new Set(stops.map(s => s.id)).size !== stops.length) throw new Error("Duplicate draft stop ID")
  const old = new Map(draft.legs.map(l => [edge(l.fromStopId, l.toStopId), l]))
  const legs = stops.slice(1).map((to, i): DraftLeg => {
    const from = stops[i], previous = old.get(edge(from.id, to.id))
    return previous ? structuredClone(previous) : {
      id: `${draft.id}:flight:${from.id}:${to.id}`, fromStopId: from.id, toStopId: to.id,
    }
  })
  return { ...structuredClone(draft), stops: structuredClone([...stops]), legs }
}
export function addDraftStop(draft: TripDraft, airport: CatalogAirport, stopId: string, position = draft.stops.length): TripDraft {
  if (!Number.isInteger(position) || position < 0 || position > draft.stops.length) throw new Error("Invalid insertion position")
  const stops = structuredClone(draft.stops)
  stops.splice(position, 0, { id: stopId, airport: structuredClone(airport), countryPresence: "visited" })
  return setDraftRoute(draft, stops)
}
export function removeDraftStop(draft: TripDraft, stopId: string): TripDraft {
  if (!draft.stops.some(s => s.id === stopId)) throw new Error("Unknown draft stop")
  return setDraftRoute(draft, draft.stops.filter(s => s.id !== stopId))
}
export function moveDraftStop(draft: TripDraft, stopId: string, position: number): TripDraft {
  const old = draft.stops.findIndex(s => s.id === stopId)
  if (old < 0 || !Number.isInteger(position) || position < 0 || position >= draft.stops.length) throw new Error("Invalid move")
  const stops = structuredClone(draft.stops), [stop] = stops.splice(old, 1)
  stops.splice(position, 0, stop)
  return setDraftRoute(draft, stops)
}
export function buildDraftTrip(draft: TripDraft) {
  const selected = [...new Map(draft.stops.map(s => [s.airport.id, s.airport])).values()]
  if (draft.legs.length !== Math.max(0, draft.stops.length - 1) || draft.legs.some((l, i) =>
    l.fromStopId !== draft.stops[i].id || l.toStopId !== draft.stops[i + 1].id)) throw new Error("Inconsistent draft legs")
  return buildTripFromRoute({ id: draft.id, title: draft.title, status: draft.status },
    draft.stops.map((s, i) => ({ stopId: s.id, airportId: s.airport.id,
      countryPresence: i === 0 ? "visited" : s.countryPresence,
      usageKind: i > 0 && i < draft.stops.length - 1 ? "connection" : "terminal" })),
    draft.legs.map(({ fromStopId: _from, toStopId: _to, ...fields }) => {
      // Stop references are rebuilt by the core; editor references do not leak into Flight.
      void _from; void _to; return fields
    }), toCoreAirports(selected))
}
/** Preview ONLY this temporary trip. Never reads or writes the existing country store. */
export function previewTripDraft(draft: TripDraft) {
  if (draft.stops.length < 2) return { kind: "empty" as const }
  if (draft.stops.some(s => { const c = resolveCountry(s.airport.sourceCountryCode); return !c?.isoCode || c.requiresReview }))
    return { kind: "review" as const }
  if (draft.stops.some((s, i) => i > 0 && s.airport.id === draft.stops[i - 1].airport.id))
    return { kind: "same-airport" as const }
  try {
    const trip = buildDraftTrip(draft)
    const airports = [...new Map(draft.stops.map(s => [s.airport.id, s.airport])).values()]
    return { kind: "ready" as const, trip, footprint: deriveCatalogFootprint([trip], [], airports) }
  } catch { return { kind: "invalid" as const } }
}
