import { buildArcDescriptors, deriveFootprint, validateAirports } from "../travel-core/core"
import type { Airport, CountryRecord, Trip } from "../travel-core/models"
import { requireStatisticalCountry } from "./countries"
import type { CatalogAirport, CountryPolicy } from "./types"

export function toCoreAirports(records: readonly CatalogAirport[], policy: CountryPolicy = {}): Airport[] {
  const result = records.map((a): Airport => {
    const c = requireStatisticalCountry(a.sourceCountryCode, policy)
    if (a.isoCountryCode !== c.isoCode) throw new Error(`Conflicting airport country: ${a.id}`)
    if (a.history.some((h) => h.isoCountryCode !== a.isoCountryCode) && !policy.approvedCountryChangeIds?.includes(a.id)) {
      throw new Error(`Airport country changed; review required: ${a.id}`)
    }
    return { id: a.id, source: a.source, sourceId: a.sourceId, name: a.name, countryCode: c.isoCode!,
      latitude: a.latitude, longitude: a.longitude,
      ...(a.iata ? { iata: a.iata } : {}), ...(a.icao ? { icao: a.icao } : {}),
      ...(a.city ? { city: a.city } : {}), closed: a.closed || a.retired }
  })
  validateAirports(result)
  return result
}
/** Adapt only the airports referenced by these trips, not the entire global catalog. */
export function deriveCatalogFootprint(trips: readonly Trip[], manual: readonly CountryRecord[],
  catalog: readonly CatalogAirport[], policy: CountryPolicy = {}) {
  const byId = new Map(catalog.map((a) => [a.id, a]))
  if (byId.size !== catalog.length) throw new Error("Duplicate catalog airport ID")
  const usedIds = new Set(trips.flatMap((t) => t.stops.map((s) => s.airportId)))
  const used = [...usedIds].map((id) => {
    const a = byId.get(id)
    if (!a) throw new Error(`Unknown catalog airport: ${id}`)
    return a
  })
  for (const r of manual) if (r.manualPresence !== "none") requireStatisticalCountry(r.countryCode ?? "", policy)
  const airports = toCoreAirports(used, policy)
  const footprint = deriveFootprint(trips, manual, airports)
  return { ...footprint, arcs: buildArcDescriptors(trips, airports), statisticalCountries: footprint.countries.map((c) => ({ ...c,
    mapping: requireStatisticalCountry(c.countryCode, policy) })) }
}
