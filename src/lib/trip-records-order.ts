import type { SavedTrip } from "./trip-storage/core"

export type TripRecordOrder = "date-desc" | "date-asc" | "updated-desc"

/** Route order is authoritative. A later leg's date never invents a missing departure date. */
export function tripDepartureDate(record: SavedTrip): string | null {
  const value = record.draft.legs[0]?.date
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : null
}

/** Filter first, then stable sort. No rewriting saved records or timezone conversions. */
export function selectTripRecords(records: readonly SavedTrip[], order: TripRecordOrder = "date-desc", query = ""): SavedTrip[] {
  const normalize = (text: string) => text.normalize("NFKC").toLowerCase().trim()
  const search = normalize(query)
  return records.map((record, index) => ({ record, index, date: tripDepartureDate(record) }))
    .filter(({ record }) => !search || normalize([record.draft.title,
      ...record.draft.stops.flatMap(s => [s.airport.name, s.airport.city, s.airport.iata, s.airport.icao]),
      ...record.draft.legs.map(l => l.airline)].filter(Boolean).join(" ")).includes(search))
    .sort((a, b) => {
      if (order === "updated-desc") return b.record.updatedAt.localeCompare(a.record.updatedAt) || a.index - b.index
      if (!a.date || !b.date) return a.date ? -1 : b.date ? 1 : a.index - b.index
      return (order === "date-asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) || a.index - b.index
    }).map(({ record }) => record)
}
