import type { AirportSearchHit, CatalogAirport, SearchOptions } from "./types"
import { countryDisplayName, resolveCountry } from "./countries"
import { airportChinese, countryChineseAliases } from "./localization"

const normalize = (value: string) => value.normalize("NFKC").normalize("NFD")
  .replace(/\p{M}/gu, "").toLowerCase().replace(/[’‘]/g, "'").trim()
export function createAirportSearchIndex(airports: readonly CatalogAirport[]) {
  const ids = new Set<string>()
  const countryText = new Map<string, string[]>()
  return airports.map((a) => {
    if (ids.has(a.id)) throw new Error(`Duplicate airport identity: ${a.id}`)
    ids.add(a.id)
    const c = resolveCountry(a.sourceCountryCode)
    const zh = a.source === "ourairports" ? airportChinese[a.sourceId] : undefined
    if (!countryText.has(a.sourceCountryCode)) countryText.set(a.sourceCountryCode,
      ["en", "fr", "es", "de", "zh-TW"].map((l) => countryDisplayName(a.sourceCountryCode, l)))
    const text = [a.name, a.city ?? "", a.ident, a.keywords, c?.name ?? "", a.sourceCountryCode,
      ...countryText.get(a.sourceCountryCode)!,
      ...(countryChineseAliases[a.sourceCountryCode] ?? []), ...(zh ? [zh.name, zh.city, ...zh.aliases] : [])]
    return { airport: structuredClone(a), iata: normalize(a.iata ?? ""), icao: normalize(a.icao ?? ""),
      ident: normalize(a.ident), aliases: a.aliases.map(normalize), haystack: normalize(text.join(" ")) }
  })
}
export type AirportSearchIndex = ReturnType<typeof createAirportSearchIndex>
export function searchAirports(index: AirportSearchIndex, query: string, options: SearchOptions = {}): AirportSearchHit[] {
  const q = normalize(query)
  if (!q) return []
  const terms = q.split(/\s+/)
  const scored: { entry: AirportSearchIndex[number]; score: number }[] = []
  for (const entry of index) {
    const a = entry.airport
    if ((!options.includeClosed && a.closed) || (!options.includeRetired && a.retired)) continue
    const score = entry.iata === q ? 0 : entry.icao === q ? 1 : entry.ident === q ? 2
      : entry.aliases.includes(q) ? 3
      : entry.iata.startsWith(q) || entry.icao.startsWith(q) ? 4
      : terms.every((t) => entry.haystack.includes(t)) ? 5 : -1
    if (score >= 0) scored.push({ entry, score })
  }
  scored.sort((a, b) => a.score - b.score ||
    Number(b.entry.airport.type === "large_airport") - Number(a.entry.airport.type === "large_airport") ||
    a.entry.airport.name.localeCompare(b.entry.airport.name) || a.entry.airport.id.localeCompare(b.entry.airport.id))
  const limit = Number.isFinite(options.limit) ? Math.max(0, Math.min(50, Math.trunc(options.limit!))) : 20
  return scored.slice(0, limit).map(({ entry, score }) => {
    const a = entry.airport, c = resolveCountry(a.sourceCountryCode), locale = options.locale ?? "zh-TW"
    const zh = locale === "zh-TW" ? airportChinese[a.sourceId] : undefined
    return { id: a.id, sourceId: a.sourceId, name: zh?.name ?? a.name, city: zh?.city ?? a.city,
      countryName: countryDisplayName(a.sourceCountryCode, locale), isoCountryCode: a.isoCountryCode,
      iata: a.iata, icao: a.icao, requiresReview: !c?.isoCode || c.requiresReview, score }
  })
}
/** Codes can be reused: do not select the first result silently. */
export function resolveAirportCode(index: AirportSearchIndex, code: string, includeClosed = false): CatalogAirport {
  const q = normalize(code)
  if (!q) throw new Error("Empty airport code")
  const matches = index.filter((e) => (!e.airport.closed || includeClosed) && !e.airport.retired &&
    [e.iata, e.icao, e.ident, ...e.aliases].includes(q))
  if (matches.length !== 1) throw new Error(`Airport code requires selection: ${code} (${matches.length} candidates)`)
  return structuredClone(matches[0].airport)
}
