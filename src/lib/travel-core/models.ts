/** Independent domain data. No reference to the existing store or transport dataset. */
export type TripStatus = "draft" | "planned" | "in_progress" | "completed"
export type Presence = "visited" | "transit"
export type UsageKind = "terminal" | "connection"
export interface Airport {
  id: string
  source: string
  sourceId: string
  name: string
  countryCode: string
  latitude: number
  longitude: number
  iata?: string
  icao?: string
  city?: string
  closed?: boolean
}
export interface AirportStop {
  id: string
  tripId: string
  airportId: string
  usageKind: UsageKind
  countryPresence: Presence
  notes?: string
}
export interface Flight {
  id: string
  tripId: string
  departureStopId: string
  arrivalStopId: string
  date?: string
  airline?: string
  flightNumber?: string
  notes?: string
}
export interface Trip {
  id: string
  status: TripStatus
  title?: string
  notes?: string
  /** Ordered flight IDs are represented by array order; stops are referenced by ID. */
  flights: readonly Flight[]
  stops: readonly AirportStop[]
}
export interface Review {
  rating?: number
  wouldReturn?: "yes" | "maybe" | "no"
  liked?: string
  disliked?: string
  bestTime?: string
  visits?: string[]
}
export interface CountryRecord {
  id: string
  legacyGeoId: string
  /** Explicit approved mapping. Never guess from a name or territory parent. */
  countryCode: string | null
  manualPresence: Presence | "none"
  wishlist: boolean
  blocked: boolean
  notes?: string
  review?: Review
}
export interface LegacyTravelData {
  statuses: Record<string, "visited" | "wishlist" | "blocked">
  notes: Record<string, string>
  reviews: Record<string, Review>
}
export interface RouteEntry {
  stopId: string
  airportId: string
  usageKind: UsageKind
  countryPresence: Presence
  notes?: string
}
export interface FlightDetails {
  id: string
  date?: string
  airline?: string
  flightNumber?: string
  notes?: string
}
export interface CountryFootprint {
  countryCode: string
  presence: Presence
  color: "#22c55e" | "#3b82f6"
  manualRecordIds: string[]
  tripIds: string[]
}
export interface AirportUsage {
  airportId: string
  total: number
  connection: number
  terminal: number
  events: { tripId: string; stopId: string; flightIds: string[]; dates: string[] }[]
}
export interface RouteGroup {
  departureAirportId: string
  arrivalAirportId: string
  count: number
  flights: { tripId: string; flight: Flight }[]
}
export interface ArcDescriptor {
  tripId: string
  flightId: string
  status: TripStatus
  departureAirportId: string
  arrivalAirportId: string
  startLat: number
  startLng: number
  endLat: number
  endLng: number
  distanceKm: number
  altitude: number
  schematic: true
}
export interface DerivedFootprint {
  countries: CountryFootprint[]
  countryTotals: { total: number; visited: number; transit: number }
  airports: AirportUsage[]
  airportTotals: { distinct: number; total: number; connection: number; terminal: number }
  routes: RouteGroup[]
  /** Preserve preferences/reviews independently of derived presence. */
  countryRecords: CountryRecord[]
}
