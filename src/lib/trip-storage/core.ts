import { previewTripDraft, type TripDraft } from "../trip-draft/core"
import type { CatalogAirport, AirportRevision } from "../airport-data/types"

export const TRIPS_KEY = "globetrotter:trips:v1"
export interface SavedTrip { draft: TripDraft; createdAt: string; updatedAt: string }
export interface TripFile { version: 1; trips: SavedTrip[] }
export type StorageError = "corrupt" | "unavailable" | "conflict" | "invalid"
export type StoragePort = Pick<Storage, "getItem" | "setItem">
export type ReadResult = { ok: true; raw: string | null; file: TripFile } | { ok: false; error: StorageError }
const MAX_SERIALIZED_CHARS = 4_000_000
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const text = (v: unknown, max = 2000): v is string => typeof v === "string" && v.length <= max
const identity = (v: unknown): v is string => text(v, 250) && v.trim().length > 0
const nullableText = (v: unknown, max = 2000) => v === null || text(v, max)
const timestamp = (v: unknown): v is string => text(v, 40) &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v) && Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().replace(".000Z", "Z") === v.replace(".000Z", "Z")
function revision(v: unknown): v is AirportRevision {
  return object(v) && timestamp(v.updatedAt) && identity(v.name) && nullableText(v.city) &&
    nullableText(v.iata, 3) && (v.iata === null || /^[A-Z0-9]{3}$/.test(v.iata as string)) &&
    nullableText(v.icao, 4) && (v.icao === null || /^[A-Z0-9]{4}$/.test(v.icao as string)) && identity(v.ident) &&
    (v.isoCountryCode === null || (text(v.isoCountryCode, 2) && /^[A-Z]{2}$/.test(v.isoCountryCode))) &&
    typeof v.latitude === "number" && Number.isFinite(v.latitude) && Math.abs(v.latitude) <= 90 &&
    typeof v.longitude === "number" && Number.isFinite(v.longitude) && Math.abs(v.longitude) <= 180
}
function airport(v: unknown): v is CatalogAirport {
  if (!revision(v) || !object(v)) return false
  return identity(v.id) && v.source === "ourairports" && text(v.sourceId, 20) && /^\d+$/.test(v.sourceId) &&
    text(v.sourceCountryCode, 3) && identity(v.type) &&
    [v.scheduledService, v.closed, v.retired].every(x => typeof x === "boolean") &&
    Array.isArray(v.aliases) && v.aliases.length <= 100 && v.aliases.every(x => text(x)) &&
    Array.isArray(v.history) && v.history.length <= 100 && v.history.every(revision) &&
    text(v.keywords, 10000) && nullableText(v.wikipedia, 2000)
}
/** Runtime validation of the complete snapshot, then reuse the existing 2A/2B validation. */
export function validSavedDraft(v: unknown): v is TripDraft {
  if (!object(v) || !identity(v.id) || !text(v.title, 200) || v.status !== "completed" ||
    !Array.isArray(v.stops) || v.stops.length < 2 || v.stops.length > 100 || !Array.isArray(v.legs) || v.legs.length !== v.stops.length - 1) return false
  if (!v.stops.every(s => object(s) && identity(s.id) && airport(s.airport) && ["visited", "transit"].includes(s.countryPresence as string))) return false
  if (!v.legs.every(l => object(l) && identity(l.id) && identity(l.fromStopId) && identity(l.toStopId) &&
    ["date", "airline", "flightNumber", "notes"].every(k => l[k] === undefined || text(l[k], k === "notes" ? 2000 : k === "date" ? 10 : 200)))) return false
  try { return previewTripDraft(v as unknown as TripDraft).kind === "ready" } catch { return false }
}
export function parseTripFile(raw: string | null): TripFile {
  if (raw === null) return { version: 1, trips: [] }
  if (raw.length > MAX_SERIALIZED_CHARS) throw new Error("Oversized trip file")
  const v: unknown = JSON.parse(raw)
  if (!object(v) || v.version !== 1 || !Array.isArray(v.trips) || v.trips.length > 500 || !v.trips.every(r =>
    object(r) && validSavedDraft(r.draft) && timestamp(r.createdAt) && timestamp(r.updatedAt) && Date.parse(r.updatedAt) >= Date.parse(r.createdAt))) throw new Error("Invalid trip file")
  const trips = v.trips as SavedTrip[]
  if (new Set(trips.map(r => r.draft.id)).size !== trips.length) throw new Error("Duplicate trip IDs")
  for (const ids of [trips.flatMap(r => r.draft.stops.map(s => s.id)), trips.flatMap(r => r.draft.legs.map(l => l.id))]) {
    if (new Set(ids).size !== ids.length) throw new Error("Reused event or flight IDs across trips")
  }
  return structuredClone({ version: 1, trips })
}
export function readTripFile(storage: StoragePort): ReadResult {
  let raw: string | null
  try { raw = storage.getItem(TRIPS_KEY) } catch { return { ok: false, error: "unavailable" } }
  try { return { ok: true, raw, file: parseTripFile(raw) } } catch { return { ok: false, error: "corrupt" } }
}
export const savedTripToken = (r: SavedTrip | undefined): string | null => r ? JSON.stringify(r) : null
export type WriteResult = { ok: true; file: TripFile; raw: string; record?: SavedTrip } | { ok: false; error: StorageError }
/** Read/validate first. A changed file or record blocks the write instead of overwriting another tab. */
export function writeTrip(storage: StoragePort, expectedRaw: string | null, id: string, expectedRecord: string | null,
  draft: TripDraft | null, now: string): WriteResult {
  const current = readTripFile(storage)
  if (!current.ok) return current
  if (current.raw !== expectedRaw) return { ok: false, error: "conflict" }
  const previous = current.file.trips.find(r => r.draft.id === id)
  if (savedTripToken(previous) !== expectedRecord) return { ok: false, error: "conflict" }
  if (!timestamp(now) || (draft && (draft.id !== id || !validSavedDraft(draft)))) return { ok: false, error: "invalid" }
  if (!draft && !previous) return { ok: false, error: "conflict" }
  // Repeated save of the same revision is idempotent, not another flight/trip.
  const unchanged = draft && previous && JSON.stringify(draft) === JSON.stringify(previous.draft)
  const record = draft ? unchanged ? previous : { draft: structuredClone(draft), createdAt: previous?.createdAt ?? now,
    updatedAt: previous && Date.parse(previous.updatedAt) > Date.parse(now) ? previous.updatedAt : now } : undefined
  const trips = current.file.trips.filter(r => r.draft.id !== id)
  if (record) trips.push(record)
  const raw = JSON.stringify({ version: 1, trips })
  try { parseTripFile(raw) } catch { return { ok: false, error: "invalid" } }
  try { if (raw !== current.raw) storage.setItem(TRIPS_KEY, raw) } catch { return { ok: false, error: "unavailable" } }
  return { ok: true, file: { version: 1, trips }, raw, record: record && structuredClone(record) }
}
