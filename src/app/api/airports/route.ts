import { createAirportSearchIndex, searchAirports } from "@/lib/airport-data/search"
import type { SearchOptions } from "@/lib/airport-data/types"

// Catalog and index stay on the server and load only on the first valid search.
let indexPromise: Promise<ReturnType<typeof createAirportSearchIndex>> | undefined
const getIndex = () => indexPromise ??= import("@/lib/airport-data/catalog").then(({ AIRPORT_CATALOG }) =>
  createAirportSearchIndex(AIRPORT_CATALOG)).catch(error => { indexPromise = undefined; throw error })

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams, q = (params.get("q") ?? "").trim()
  if (q.length > 80) return Response.json({ error: "query-too-long" }, { status: 400 })
  if (q.length < 2) return Response.json({ results: [] })
  const requestedLocale = params.get("locale") ?? "en"
  const locale = (["en", "fr", "es", "de", "zh-TW"].includes(requestedLocale) ? requestedLocale : "en") as SearchOptions["locale"]
  try {
    const index = await getIndex()
    const hits = searchAirports(index, q, { locale, limit: 12 })
    const byId = new Map(hits.map(hit => [hit.id, hit]))
    // Return at most 12 selected records, never the global catalog.
    return Response.json({ results: index.filter(e => byId.has(e.airport.id))
      .map(e => ({ hit: byId.get(e.airport.id)!, airport: e.airport }))
      .sort((a, b) => hits.findIndex(h => h.id === a.hit.id) - hits.findIndex(h => h.id === b.hit.id)) },
    { headers: { "Cache-Control": "no-store" } })
  } catch { return Response.json({ error: "search-unavailable" }, { status: 503 }) }
}
