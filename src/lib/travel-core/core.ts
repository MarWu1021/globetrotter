import type {
  Airport, ArcDescriptor, CountryFootprint, CountryRecord,
  DerivedFootprint, FlightDetails, LegacyTravelData, Presence, RouteEntry,
  RouteGroup, Trip, UsageKind, AirportUsage,
} from "./models"

const copy = <T>(value: T): T => structuredClone(value)
const requireValid = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message)
}
const uniqueIds = (ids: string[], label: string) => {
  requireValid(ids.every((id) => typeof id === "string" && id.trim().length > 0), `${label}: empty ID`)
  requireValid(new Set(ids).size === ids.length, `${label}: duplicate ID`)
}
const presenceValid = (value: string) => value === "visited" || value === "transit"
const usageValid = (value: string) => value === "terminal" || value === "connection"

export function validateAirports(airports: readonly Airport[]): void {
  uniqueIds(airports.map((a) => a.id), "airports")
  uniqueIds(airports.map((a) => JSON.stringify([a.source, a.sourceId])), "airport sources")
  for (const a of airports) {
    requireValid(a.source?.trim() && a.sourceId?.trim() && a.name?.trim(), "Missing airport identity")
    requireValid(/^[A-Z]{2}$/.test(a.countryCode), `Invalid country code for ${a.id}`)
    requireValid(Number.isFinite(a.latitude) && Math.abs(a.latitude) <= 90, `Invalid latitude: ${a.id}`)
    requireValid(Number.isFinite(a.longitude) && Math.abs(a.longitude) <= 180, `Invalid longitude: ${a.id}`)
  }
}
function airportMap(airports: readonly Airport[]) {
  validateAirports(airports)
  return new Map(airports.map((a) => [a.id, a]))
}
function stopMap(trip: Trip) { return new Map(trip.stops.map((s) => [s.id, s])) }
function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
}

/** Reject incomplete graphs rather than silently producing partial statistics. */
export function validateTrip(trip: Trip, airports: readonly Airport[]): void {
  const master = airportMap(airports)
  uniqueIds([trip.id], "trip")
  requireValid(["draft", "planned", "in_progress", "completed"].includes(trip.status), "Invalid trip status")
  uniqueIds(trip.stops.map((s) => s.id), "stops")
  uniqueIds(trip.flights.map((f) => f.id), "flights")
  requireValid(trip.flights.length > 0, "At least one flight is required")
  const stops = stopMap(trip)
  const arrivals = new Map<string, number>(), departures = new Map<string, number>()
  for (const s of trip.stops) {
    requireValid(s.tripId === trip.id, "Stop belongs to another trip")
    requireValid(master.has(s.airportId), `Unknown airport: ${s.airportId}`)
    requireValid(presenceValid(s.countryPresence) && usageValid(s.usageKind), "Invalid stop nature")
  }
  for (let i = 0; i < trip.flights.length; i++) {
    const f = trip.flights[i]
    requireValid(f.tripId === trip.id, "Flight belongs to another trip")
    const dep = stops.get(f.departureStopId), arr = stops.get(f.arrivalStopId)
    requireValid(dep && arr, "Flight has missing stop reference")
    requireValid(dep!.airportId !== arr!.airportId, "Same-airport flight is not supported")
    if (f.date) requireValid(validDate(f.date), "Invalid flight date")
    arrivals.set(f.arrivalStopId, (arrivals.get(f.arrivalStopId) ?? 0) + 1)
    departures.set(f.departureStopId, (departures.get(f.departureStopId) ?? 0) + 1)
    if (i > 0) {
      const previous = trip.flights[i - 1]
      requireValid(stops.get(previous.arrivalStopId)!.airportId === dep!.airportId,
        "Disconnected route; ground transfers require a future explicit model")
    }
  }
  for (const s of trip.stops) {
    const incoming = arrivals.get(s.id) ?? 0, outgoing = departures.get(s.id) ?? 0
    requireValid(incoming + outgoing > 0, "Orphan stop")
    requireValid(incoming <= 1 && outgoing <= 1, "Stop reused for separate airport visits")
    if (incoming && outgoing) {
      const arrivalIndex = trip.flights.findIndex((f) => f.arrivalStopId === s.id)
      requireValid(trip.flights[arrivalIndex + 1]?.departureStopId === s.id,
        "Shared stop must connect consecutive flights")
    }
  }
}

/** IDs and confirmation status are supplied by the caller; no clock or UUID side effects. */
export function buildTripFromRoute(
  header: Pick<Trip, "id" | "status" | "title" | "notes">,
  route: readonly RouteEntry[], details: readonly FlightDetails[], airports: readonly Airport[],
): Trip {
  requireValid(route.length >= 2 && details.length === route.length - 1, "Route/flight count mismatch")
  const trip: Trip = {
    ...copy(header),
    stops: route.map((r) => ({ id: r.stopId, tripId: header.id, airportId: r.airportId,
      usageKind: r.usageKind, countryPresence: r.countryPresence, ...(r.notes === undefined ? {} : { notes: r.notes }) })),
    flights: details.map((d, i) => ({ ...copy(d), tripId: header.id,
      departureStopId: route[i].stopId, arrivalStopId: route[i + 1].stopId })),
  }
  validateTrip(trip, airports)
  return trip
}
function validateTrips(trips: readonly Trip[], airports: readonly Airport[]) {
  uniqueIds(trips.map((t) => t.id), "trips")
  uniqueIds(trips.flatMap((t) => t.flights.map((f) => f.id)), "global flights")
  uniqueIds(trips.flatMap((t) => t.stops.map((s) => s.id)), "global stops")
  for (const t of trips) validateTrip(t, airports)
}

export function deriveCountryFootprint(
  trips: readonly Trip[], records: readonly CountryRecord[], airports: readonly Airport[],
): CountryFootprint[] {
  validateTrips(trips, airports)
  uniqueIds(records.map((r) => r.id), "country records")
  const countries = new Map<string, CountryFootprint>()
  const add = (code: string, presence: Presence, kind: "manualRecordIds" | "tripIds", id: string) => {
    requireValid(/^[A-Z]{2}$/.test(code), "Unresolved/invalid country mapping")
    const c = countries.get(code) ?? { countryCode: code, presence, color: "#3b82f6", manualRecordIds: [], tripIds: [] }
    if (presence === "visited") c.presence = "visited"
    c.color = c.presence === "visited" ? "#22c55e" : "#3b82f6"
    if (!c[kind].includes(id)) c[kind].push(id)
    countries.set(code, c)
  }
  for (const r of records) {
    requireValid(["none", "visited", "transit"].includes(r.manualPresence), "Invalid manual presence")
    if (r.manualPresence !== "none") {
      requireValid(r.countryCode, `Unresolved country record: ${r.legacyGeoId}`)
      add(r.countryCode!, r.manualPresence, "manualRecordIds", r.id)
    }
  }
  const master = airportMap(airports)
  for (const t of trips.filter((t) => t.status === "completed")) {
    const originId = t.flights[0].departureStopId
    for (const s of t.stops) add(master.get(s.airportId)!.countryCode,
      s.id === originId ? "visited" : s.countryPresence, "tripIds", t.id)
  }
  return [...countries.values()].sort((a, b) => a.countryCode.localeCompare(b.countryCode))
}

export function deriveAirportUsage(trips: readonly Trip[], airports: readonly Airport[]): AirportUsage[] {
  validateTrips(trips, airports)
  const result = new Map<string, AirportUsage>()
  for (const t of trips.filter((t) => t.status === "completed")) for (const s of t.stops) {
    const usage = result.get(s.airportId) ?? { airportId: s.airportId, total: 0, connection: 0, terminal: 0, events: [] }
    usage.total++
    usage[s.usageKind]++
    const related = t.flights.filter((f) => f.departureStopId === s.id || f.arrivalStopId === s.id)
    usage.events.push({ tripId: t.id, stopId: s.id, flightIds: related.map((f) => f.id),
      dates: [...new Set(related.flatMap((f) => f.date ? [f.date] : []))].sort() })
    result.set(s.airportId, usage)
  }
  return [...result.values()].sort((a, b) => b.total - a.total || a.airportId.localeCompare(b.airportId))
}

export function deriveRouteGroups(trips: readonly Trip[], airports: readonly Airport[]): RouteGroup[] {
  validateTrips(trips, airports)
  const groups = new Map<string, RouteGroup>()
  for (const t of trips.filter((t) => t.status === "completed")) {
    const stops = stopMap(t)
    for (const f of t.flights) {
      const departureAirportId = stops.get(f.departureStopId)!.airportId
      const arrivalAirportId = stops.get(f.arrivalStopId)!.airportId
      const key = JSON.stringify([departureAirportId, arrivalAirportId])
      const group = groups.get(key) ?? { departureAirportId, arrivalAirportId, count: 0, flights: [] }
      group.count++
      group.flights.push({ tripId: t.id, flight: copy(f) })
      groups.set(key, group)
    }
  }
  for (const g of groups.values()) g.flights.sort((a, b) => {
    const x = a.flight.date, y = b.flight.date
    return x && y ? x.localeCompare(y) || a.flight.id.localeCompare(b.flight.id)
      : x ? -1 : y ? 1 : a.flight.id.localeCompare(b.flight.id)
  })
  return [...groups.values()].sort((a, b) => JSON.stringify([a.departureAirportId, a.arrivalAirportId])
    .localeCompare(JSON.stringify([b.departureAirportId, b.arrivalAirportId])))
}

export function buildArcDescriptors(trips: readonly Trip[], airports: readonly Airport[], includePreview = false): ArcDescriptor[] {
  validateTrips(trips, airports)
  const master = airportMap(airports)
  const radians = (n: number) => n * Math.PI / 180
  return trips.filter((t) => includePreview || t.status === "completed").flatMap((t) => {
    const stops = stopMap(t)
    return t.flights.map((f) => {
      const a = master.get(stops.get(f.departureStopId)!.airportId)!
      const b = master.get(stops.get(f.arrivalStopId)!.airportId)!
      const hav = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 +
        Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) *
        Math.sin(radians(b.longitude - a.longitude) / 2) ** 2
      const distanceKm = 6371 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, hav))))
      return { tripId: t.id, flightId: f.id, status: t.status,
        departureAirportId: a.id, arrivalAirportId: b.id,
        startLat: a.latitude, startLng: a.longitude, endLat: b.latitude, endLng: b.longitude,
        distanceKm, altitude: Math.max(0.05, Math.min(0.5, distanceKm / 40000)), schematic: true as const }
    })
  })
}

export function deriveFootprint(trips: readonly Trip[], records: readonly CountryRecord[], airports: readonly Airport[]): DerivedFootprint {
  const countries = deriveCountryFootprint(trips, records, airports)
  const usage = deriveAirportUsage(trips, airports)
  const visited = countries.filter((c) => c.presence === "visited").length
  return { countries, countryTotals: { total: countries.length, visited, transit: countries.length - visited },
    airports: usage,
    airportTotals: { distinct: usage.length, total: usage.reduce((n, a) => n + a.total, 0),
      connection: usage.reduce((n, a) => n + a.connection, 0), terminal: usage.reduce((n, a) => n + a.terminal, 0) },
    routes: deriveRouteGroups(trips, airports), countryRecords: copy([...records]) }
}

/** In-memory compatibility only. Never reads/writes browser storage or invents flights. */
export function countryRecordsFromLegacy(
  legacy: LegacyTravelData, mappings: Readonly<Record<string, string>>, ids: Readonly<Record<string, string>>,
): CountryRecord[] {
  const geoIds = [...new Set([...Object.keys(legacy.statuses), ...Object.keys(legacy.notes), ...Object.keys(legacy.reviews)])].sort()
  const result = geoIds.map((geoId): CountryRecord => ({ id: ids[geoId], legacyGeoId: geoId,
    countryCode: mappings[geoId] ?? null,
    manualPresence: legacy.statuses[geoId] === "visited" ? "visited" : "none",
    wishlist: legacy.statuses[geoId] === "wishlist", blocked: legacy.statuses[geoId] === "blocked",
    ...(legacy.notes[geoId] === undefined ? {} : { notes: legacy.notes[geoId] }),
    ...(legacy.reviews[geoId] === undefined ? {} : { review: copy(legacy.reviews[geoId]) }) }))
  uniqueIds(result.map((r) => r.id), "legacy record IDs")
  return result
}

/** Only explicitly confirmed, consecutive arrival/departure events may be merged. */
export function mergeAirportStops(trip: Trip, arrivalStopId: string, departureStopId: string,
  resolution: { usageKind: UsageKind; countryPresence: Presence; notes?: string }, airports: readonly Airport[]): Trip {
  validateTrip(trip, airports)
  requireValid(arrivalStopId !== departureStopId, "Already one event")
  const stops = stopMap(trip), a = stops.get(arrivalStopId), b = stops.get(departureStopId)
  requireValid(a && b && a.airportId === b.airportId, "Cannot merge different/unknown airports")
  requireValid(a!.notes === b!.notes || resolution.notes !== undefined, "Resolve conflicting stop notes explicitly")
  const index = trip.flights.findIndex((f) => f.arrivalStopId === arrivalStopId)
  requireValid(index >= 0 && trip.flights[index + 1]?.departureStopId === departureStopId, "Events are not consecutive")
  requireValid(!trip.flights.some((f) => f.departureStopId === arrivalStopId || f.arrivalStopId === departureStopId), "Events already shared")
  const result: Trip = { ...copy(trip), stops: trip.stops.filter((s) => s.id !== departureStopId).map((s) =>
    s.id === arrivalStopId ? { ...copy(s), ...copy(resolution) } : copy(s)),
    flights: trip.flights.map((f) => ({ ...copy(f), departureStopId: f.departureStopId === departureStopId ? arrivalStopId : f.departureStopId })) }
  validateTrip(result, airports)
  return result
}

export function splitAirportStop(trip: Trip, stopId: string,
  arrival: { usageKind: UsageKind; countryPresence: Presence; notes?: string },
  departure: { id: string; usageKind: UsageKind; countryPresence: Presence; notes?: string }, airports: readonly Airport[]): Trip {
  validateTrip(trip, airports)
  const s = stopMap(trip).get(stopId)
  requireValid(s, "Unknown stop")
  requireValid(trip.flights.some((f) => f.arrivalStopId === stopId) && trip.flights.some((f) => f.departureStopId === stopId), "Only shared events can be split")
  requireValid(!trip.stops.some((s) => s.id === departure.id), "Duplicate split ID")
  const result: Trip = { ...copy(trip), stops: trip.stops.flatMap((old) => old.id === stopId
    ? [{ ...copy(old), ...copy(arrival) }, { ...copy(old), ...copy(departure) }] : [copy(old)]),
    flights: trip.flights.map((f) => ({ ...copy(f), departureStopId: f.departureStopId === stopId ? departure.id : f.departureStopId })) }
  validateTrip(result, airports)
  return result
}
