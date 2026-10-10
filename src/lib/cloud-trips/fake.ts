import { validSavedDraft } from '../trip-storage/core'
import type { CloudTrip, CloudTripRepository, Mutation, Result } from './contracts'
import type { TripDraft } from '../trip-draft/core'

type Row = { trip: CloudTrip; deleted: boolean; requestId: string; fingerprint: string }
/** TEST DOUBLE, not an Auth/RLS implementation. No network, SDK, browser or storage access. */
export class FakeCloudDatabase {
  private rows = new Map<string, Row>()
  failNext: 'network' | 'uncertain' | null = null
  constructor(private clock = () => new Date().toISOString()) {}
  forVerifiedTestUser(userId: string | null): CloudTripRepository {
    const key = (id: string) => JSON.stringify([userId, id])
    const failure = (): Result<never> | null => {
      if (!userId) return { ok: false, error: 'unauthenticated' }
      if (this.failNext) { const error = this.failNext; this.failNext = null; return { ok: false, error } }
      return null
    }
    const mutate = (c: Mutation, draft: TripDraft | null): Result<CloudTrip | null> => {
      const failed = failure(); if (failed) return failed
      if (!c.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.requestId) || (c.expectedRevision !== null && (!Number.isSafeInteger(c.expectedRevision) || c.expectedRevision < 1)) ||
        (draft && (draft.id !== c.id || !validSavedDraft(draft)))) return { ok: false, error: 'invalid' }
      const previous = this.rows.get(key(c.id))
      const fingerprint = JSON.stringify([c.expectedRevision, draft])
      if (previous?.requestId === c.requestId) {
        if (previous.fingerprint !== fingerprint) return { ok: false, error: 'conflict' }
        return { ok: true, value: draft ? structuredClone(previous.trip) : null }
      }
      if (previous ? previous.deleted || previous.trip.revision !== c.expectedRevision : c.expectedRevision !== null || !draft)
        return { ok: false, error: 'conflict' }
      const now = this.clock()
      const trip: CloudTrip = { draft: structuredClone(draft ?? previous!.trip.draft), createdAt: previous?.trip.createdAt ?? now,
        updatedAt: now, revision: (previous?.trip.revision ?? 0) + 1 }
      this.rows.set(key(c.id), { trip, deleted: !draft, requestId: c.requestId, fingerprint })
      return { ok: true, value: draft ? structuredClone(trip) : null }
    }
    return {
      list: async () => {
        const failed = failure(); if (failed) return failed
        return { ok: true, value: [...this.rows.entries()].filter(([k, r]) => JSON.parse(k)[0] === userId && !r.deleted).map(([,r]) => structuredClone(r.trip)) }
      },
      save: async c => mutate(c, c.draft) as Result<CloudTrip>,
      remove: async c => mutate(c, null) as Result<null>,
    }
  }
}
