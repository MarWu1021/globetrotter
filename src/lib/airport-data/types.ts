export interface AirportRevision {
  updatedAt: string
  name: string
  city: string | null
  iata: string | null
  icao: string | null
  ident: string
  isoCountryCode: string | null
  latitude: number
  longitude: number
}
export interface CatalogAirport extends AirportRevision {
  id: string
  source: "ourairports"
  sourceId: string
  sourceCountryCode: string
  type: string
  scheduledService: boolean
  closed: boolean
  retired: boolean
  aliases: string[]
  history: AirportRevision[]
  keywords: string
  wikipedia: string | null
}
export interface CountryMapping {
  isoCode: string | null
  sourceCode: string
  name: string
  statisticalId: string | null
  numericCode: string | null
  requiresReview: boolean
  classification: string
  flatGeoIds: string[]
  globeGeoIds: string[]
  legacyGeoIds: string[]
}
export interface CountryPolicy {
  /** Explicit caller approval; no overseas/disputed-area folding happens automatically. */
  approvedSpecialAreas?: readonly string[]
  approvedCountryChangeIds?: readonly string[]
}
export interface SearchOptions {
  locale?: "en" | "fr" | "es" | "de" | "zh-TW"
  limit?: number
  includeClosed?: boolean
  includeRetired?: boolean
}
export interface AirportSearchHit {
  id: string
  sourceId: string
  name: string
  city: string | null
  countryName: string
  isoCountryCode: string | null
  iata: string | null
  icao: string | null
  requiresReview: boolean
  score: number
}
