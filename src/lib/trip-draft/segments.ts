import type { CatalogAirport } from "../airport-data/types"
import { previewTripDraft, setDraftRoute, type DraftStop, type TripDraft } from "./core"

/** The existing version-1 saved draft accepts at most 100 airport-stop events. */
const MAX_STOPS = 100
export type StopIdFactory = () => string
const identity = (value: unknown): value is string => typeof value === "string" && !!value.trim()

/** These operations never create disconnected flights or a second persisted data model. */
function assertStructure(draft: TripDraft): void {
  if (!identity(draft.id) || !Array.isArray(draft.stops) || !Array.isArray(draft.legs) ||
    draft.stops.length > MAX_STOPS || draft.legs.length !== Math.max(0, draft.stops.length - 1))
    throw new Error("Invalid draft route")
  for (const [label, ids] of [["stop", draft.stops.map(s => s.id)], ["flight", draft.legs.map(l => l.id)]] as const) {
    if (ids.some(id => !identity(id)) || new Set(ids).size !== ids.length)
      throw new Error(`Duplicate or invalid ${label} ID`)
  }
  if (draft.legs.some((leg, index) => leg.fromStopId !== draft.stops[index].id ||
    leg.toStopId !== draft.stops[index + 1].id)) throw new Error("Inconsistent draft flight references")
}

function rebuild(draft: TripDraft, stops: readonly DraftStop[]): TripDraft {
  const next = setDraftRoute(draft, stops.map((stop, index) => index === 0 ?
    { ...stop, countryPresence: "visited" } : stop))
  // setDraftRoute's existing deterministic ID format is preserved. Reject even
  // adversarial colon-containing event IDs if they would collide after rebuilding.
  assertStructure(next)
  return next
}

function idAllocator(draft: TripDraft, factory: StopIdFactory): () => string {
  const used = new Set([draft.id, ...draft.stops.map(s => s.id), ...draft.legs.map(l => l.id)])
  return () => {
    const id = factory()
    if (!identity(id) || used.has(id)) throw new Error("Duplicate or invalid new stop ID")
    used.add(id)
    return id
  }
}

/** Edit one stop EVENT in place. Its incoming/outgoing flights keep their own
 * optional details, because both endpoint event IDs remain the same. A shared
 * connection is one event: editing it updates both adjacent cards together. */
export function replaceDraftStopAirport(draft: TripDraft, stopId: string, airport: CatalogAirport): TripDraft {
  assertStructure(draft)
  if (!draft.stops.some(stop => stop.id === stopId)) throw new Error("Unknown draft stop")
  return rebuild(draft, draft.stops.map(stop => stop.id === stopId ?
    { ...stop, airport: structuredClone(airport) } : stop))
}

/** Add one flight from the existing final stop. Only the destination EVENT and
 * its flight are new; date, airline, number and notes start unconfirmed/empty. */
export function appendNextSegment(draft: TripDraft, airport: CatalogAirport, factory: StopIdFactory): TripDraft {
  assertStructure(draft)
  if (!draft.stops.length) throw new Error("Choose a departure airport first")
  if (draft.stops.length >= MAX_STOPS) throw new Error("Saved trip stop limit reached")
  const allocate = idAllocator(draft, factory)
  return rebuild(draft, [...draft.stops, {
    id: allocate(), airport: structuredClone(airport), countryPresence: "visited",
  }])
}

/** The caller's explicit confirmation is required before invoking this helper.
 * Reverse the current valid outbound route, sharing its final arrival event as
 * the turnaround; all later return stops are NEW events, including revisits.
 * Return leg optional details are never copied or inferred from outbound dates.
 * No persistent outbound/return flag or automatic completion/date is introduced. */
export function appendReturnRoute(draft: TripDraft, factory: StopIdFactory): TripDraft {
  assertStructure(draft)
  if (previewTripDraft(draft).kind !== "ready") throw new Error("Confirm a valid outbound route first")
  if (draft.stops[0].airport.id === draft.stops.at(-1)!.airport.id)
    throw new Error("Route already ends at the departure airport")
  if (draft.stops.length * 2 - 1 > MAX_STOPS) throw new Error("Return route exceeds saved trip stop limit")
  const allocate = idAllocator(draft, factory)
  const returning = draft.stops.slice(0, -1).reverse().map(stop => ({
    ...structuredClone(stop), id: allocate(),
  }))
  return rebuild(draft, [...draft.stops, ...returning])
}

/** Delete a segment while keeping the single continuous-route model.
 * For the first leg, remove the original departure event, preserving later legs.
 * Otherwise remove that leg's arrival event and reconnect the following route.
 * Any newly connected edge has empty details; unchanged stop-event pairs keep
 * their original fields. UI must explain/confirm this reconnection and offer Undo. */
export function removeDraftSegment(draft: TripDraft, legId: string): TripDraft {
  assertStructure(draft)
  const index = draft.legs.findIndex(leg => leg.id === legId)
  if (index < 0) throw new Error("Unknown draft flight")
  // Removing the sole flight clears both endpoints: no orphan stop card remains.
  if (draft.legs.length === 1) return rebuild(draft, [])
  const remove = index === 0 ? 0 : index + 1
  return rebuild(draft, draft.stops.filter((_, i) => i !== remove))
}

/** This is a route/arrival-event reorder, NOT moving an arbitrary intact flight
 * to a disconnected position. Keep the first origin fixed, move the selected
 * leg's arrival stop to the requested arrival index, and rebuild adjacency.
 * Exact unchanged event pairs retain details; newly connected pairs start blank.
 * UI must explain/confirm this reconnection and offer Undo. */
export function moveDraftSegment(draft: TripDraft, legId: string, toIndex: number): TripDraft {
  assertStructure(draft)
  const fromIndex = draft.legs.findIndex(leg => leg.id === legId)
  if (fromIndex < 0 || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= draft.legs.length)
    throw new Error("Invalid draft flight move")
  const stops = structuredClone(draft.stops)
  const [arrival] = stops.splice(fromIndex + 1, 1)
  stops.splice(toIndex + 1, 0, arrival)
  return rebuild(draft, stops)
}
