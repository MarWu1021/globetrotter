import { readTripFile, writeTrip, type SavedTrip, type StorageError, type StoragePort, type WriteResult } from "./core"
import type { TripDraft } from "../trip-draft/core"

export interface TripSnapshot { ready: boolean; trips: readonly SavedTrip[]; error: StorageError | null }
const INITIAL: TripSnapshot = { ready: false, trips: [], error: null }
/** No storage access during construction/render. Only subscribe or explicit user actions read/write. */
export class TripRepository {
  private snapshot: TripSnapshot = INITIAL
  private raw: string | null = null
  private listeners = new Set<() => void>()
  constructor(private storage: () => StoragePort) {}
  getSnapshot = () => this.snapshot
  getServerSnapshot = () => INITIAL
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    if (!this.snapshot.ready) this.reload()
    return () => { this.listeners.delete(listener) }
  }
  private publish(snapshot: TripSnapshot) { this.snapshot = snapshot; this.listeners.forEach(fn => fn()) }
  reload = () => {
    try {
      const result = readTripFile(this.storage())
      if (result.ok) { this.raw = result.raw; this.publish({ ready: true, trips: result.file.trips, error: null }) }
      else this.publish({ ready: true, trips: this.snapshot.trips, error: result.error })
    } catch { this.publish({ ready: true, trips: this.snapshot.trips, error: "unavailable" }) }
  }
  save = (draft: TripDraft, expectedRecord: string | null): WriteResult => this.write(draft.id, expectedRecord, draft)
  remove = (id: string, expectedRecord: string): WriteResult => this.write(id, expectedRecord, null)
  private write(id: string, expectedRecord: string | null, draft: TripDraft | null): WriteResult {
    if (!this.snapshot.ready || this.snapshot.error) return { ok: false, error: this.snapshot.error ?? "unavailable" }
    let result: WriteResult
    try { result = writeTrip(this.storage(), this.raw, id, expectedRecord, draft, new Date().toISOString()) }
    catch { result = { ok: false, error: "unavailable" } }
    if (result.ok) { this.raw = result.raw; this.publish({ ready: true, trips: result.file.trips, error: null }) }
    else this.reload()
    return result
  }
}
