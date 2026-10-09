import type { AirportRevision, CatalogAirport } from "./types"

const revision = (a: CatalogAirport): AirportRevision => ({ updatedAt: a.updatedAt, name: a.name,
  city: a.city, iata: a.iata, icao: a.icao, ident: a.ident, isoCountryCode: a.isoCountryCode,
  latitude: a.latitude, longitude: a.longitude })
const identity = (a: CatalogAirport) => JSON.stringify([a.source, a.sourceId])
function checkedMap(records: readonly CatalogAirport[]) {
  const map = new Map<string, CatalogAirport>(), ids = new Set<string>()
  for (const a of records) {
    if (map.has(identity(a)) || ids.has(a.id)) throw new Error("Duplicate update identity")
    map.set(identity(a), a); ids.add(a.id)
  }
  return map
}
/** Pure explicit update plan, not an automatic download or write operation. */
export function reconcileAirportCatalog(previous: readonly CatalogAirport[], next: readonly CatalogAirport[]) {
  const old = checkedMap(previous), current = checkedMap(next)
  const result: CatalogAirport[] = [], retiredIds: string[] = [], changedCountryIds: string[] = []
  for (const [key, incoming] of current) {
    const before = old.get(key)
    if (before && before.id !== incoming.id) throw new Error("Provider identity cannot change internal ID")
    const a = structuredClone(incoming)
    if (before) {
      if (incoming.updatedAt < before.updatedAt) throw new Error("Reject stale source update")
      a.aliases = [...new Set([...before.aliases, ...a.aliases,
        ...[before.iata, before.icao, before.ident].filter((x): x is string => Boolean(x))])]
      const history = structuredClone(before.history)
      if (JSON.stringify(revision(before)) !== JSON.stringify(revision(a))) history.push(revision(before))
      a.history = history
      if (before.isoCountryCode !== incoming.isoCountryCode) changedCountryIds.push(a.id)
    }
    result.push(a)
  }
  for (const [key, a] of old) if (!current.has(key)) {
    result.push({ ...structuredClone(a), retired: true }); retiredIds.push(a.id)
  }
  checkedMap(result)
  return { airports: result, retiredIds, changedCountryIds }
}
