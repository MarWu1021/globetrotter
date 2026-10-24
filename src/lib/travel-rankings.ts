import { AIRLINES, airlineValue, type Airline } from "./airlines/catalog"
import type { CatalogAirport } from "./airport-data/types"
import { collectSavedFlightLegs } from "./saved-flight-legs"
import type { SavedTrip } from "./trip-storage/core"

export interface AirportRanking { id: string; airport: CatalogAirport; count: number }
export interface AirlineRanking { id: string; airline: Airline; count: number }
export interface TravelRankings {
  airports: AirportRanking[]
  airlines: AirlineRanking[]
  validLegCount: number
  excludedLegCount: number
  excludedTripCount: number
  duplicateLegCount: number
  airportConflicts: number
  missingAirlines: number
  unknownAirlines: number
  conflictingAirlines: number
}

const normalize = (s: string) => s.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ")
/** Exact catalog facts only. Autocomplete substring matching is deliberately not used for statistics. */
export function resolveRecordedAirline(value: unknown): Airline | null {
  if (typeof value !== "string" || !value.trim()) return null
  const q = normalize(value)
  const matches = AIRLINES.filter(a => [a.iata, a.name, a.zhTW, ...a.aliases, airlineValue(a),
    `${a.iata} · ${a.zhTW}`].some(v => normalize(v) === q))
  return matches.length === 1 ? matches[0] : null
}

/** Endpoint uses, not airport-stop events. Country/transit footprint calculations remain separate. */
export function calculateTravelRankings(records: readonly SavedTrip[]): TravelRankings {
  const collection = collectSavedFlightLegs(records)
  const airportRows = new Map<string, AirportRanking>(), airlineRows = new Map<string, AirlineRanking>()
  const identities = new Map<string, Set<string>>()
  const snapshots = new Map<string, { airport: CatalogAirport; signature: string; conflict: boolean }>()
  for (const leg of collection.legs) for (const airport of [leg.from, leg.to]) {
    const sources = identities.get(airport.id) ?? new Set<string>()
    sources.add(airport.sourceId); identities.set(airport.id, sources)
    const key = `${airport.source}:${airport.sourceId}`
    const signature = JSON.stringify([airport.name, airport.ident, airport.iata, airport.icao])
    const previous = snapshots.get(key)
    if (!previous || airport.updatedAt > previous.airport.updatedAt) snapshots.set(key, { airport, signature, conflict: false })
    else if (airport.updatedAt === previous.airport.updatedAt && signature !== previous.signature) previous.conflict = true
  }
  let airportConflicts = 0, missingAirlines = 0, unknownAirlines = 0, conflictingAirlines = 0
  for (const leg of collection.legs) {
    for (const airport of [leg.from, leg.to]) {
      const id = `${airport.source}:${airport.sourceId}`
      const snapshot = snapshots.get(id)!
      if (identities.get(airport.id)!.size !== 1 || snapshot.conflict) { airportConflicts++; continue }
      const previous = airportRows.get(id)
      // Updated names/codes do not split a source ID. Conflicting newest snapshots are not guessed.
      if (!previous) airportRows.set(id, { id, airport: snapshot.airport, count: 1 })
      else previous.count++
    }
    const carriers = leg.airlines.map(resolveRecordedAirline)
    const present = leg.airlines.map(v => typeof v === "string" && !!v.trim())
    if (present.every(v => !v)) { missingAirlines++; continue }
    if (carriers.some(v => !v)) {
      if (present.some(v => !v) || new Set(leg.airlines.map(v => typeof v === "string" ? normalize(v) : v)).size > 1) conflictingAirlines++
      else unknownAirlines++
      continue
    }
    if (new Set(carriers.map(a => a!.iata)).size !== 1) { conflictingAirlines++; continue }
    const airline = carriers[0]!, previous = airlineRows.get(airline.iata)
    if (previous) previous.count++
    else airlineRows.set(airline.iata, { id: airline.iata, airline, count: 1 })
  }
  const byCount = <T extends { count: number; id: string }>(a: T, b: T) => b.count - a.count || a.id.localeCompare(b.id)
  return { airports: [...airportRows.values()].sort(byCount), airlines: [...airlineRows.values()].sort(byCount),
    validLegCount: collection.legs.length, excludedLegCount: collection.excludedLegCount,
    excludedTripCount: collection.excludedTripCount, duplicateLegCount: collection.duplicateLegCount,
    airportConflicts, missingAirlines, unknownAirlines, conflictingAirlines }
}
