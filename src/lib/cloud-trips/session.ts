import type { TripDraft } from '../trip-draft/core'
import type { CloudTripRepository, Mutation, PrivateSnapshot, Result } from './contracts'

function immutable(value: PrivateSnapshot): PrivateSnapshot {
  const copy = structuredClone(value)
  const freeze = (v: unknown) => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v) } }
  freeze(copy); return copy
}

/** D1 state machine, deliberately NOT mounted in the application. Never reads localStorage. */
export class PrivateTripSession {
  private epoch = 0
  private snapshot: PrivateSnapshot = immutable({ phase: 'signed-out', userId: null, trips: [], error: null })
  private listeners = new Set<() => void>()
  constructor(private repositoryForUser: (verifiedUserId: string) => CloudTripRepository) {}
  getSnapshot = (): PrivateSnapshot => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(value: PrivateSnapshot) { this.snapshot = immutable(value); this.listeners.forEach(f => f()) }
  beginLogin() { this.epoch++; this.publish({ phase: 'authenticating', userId: null, trips: [], error: null }) }
  beginLogout() { this.epoch++; this.publish({ phase: 'signing-out', userId: null, trips: [], error: null }) }
  signedOut() { this.epoch++; this.publish({ phase: 'signed-out', userId: null, trips: [], error: null }) }
  async acceptVerifiedUser(userId: string) {
    const epoch = ++this.epoch
    this.publish({ phase: 'loading', userId, trips: [], error: null })
    let result: Awaited<ReturnType<CloudTripRepository['list']>>
    try { result = await this.repositoryForUser(userId).list() } catch { result = { ok: false, error: 'network' } }
    if (epoch !== this.epoch) return
    if (!result.ok && result.error === 'unauthenticated') { this.signedOut(); return }
    this.publish(result.ok ? { phase: 'ready', userId, trips: result.value, error: null } : { phase: 'error', userId, trips: [], error: result.error })
  }
  async save(command: Mutation & { draft: TripDraft }): Promise<Result<null>> { return this.write(command) }
  async remove(command: Mutation): Promise<Result<null>> { return this.write(command) }
  private async write(command: Mutation & { draft?: TripDraft }): Promise<Result<null>> {
    const { userId, phase } = this.snapshot
    if (!userId) return { ok: false, error: 'unauthenticated' }
    if (phase === 'syncing') return { ok: false, error: 'busy' }
    if (phase !== 'ready' && phase !== 'error') return { ok: false, error: 'busy' }
    const epoch = this.epoch, before = structuredClone(this.snapshot.trips)
    this.publish({ phase: 'syncing', userId, trips: before, error: null })
    try {
      const repo = this.repositoryForUser(userId)
      const result = command.draft ? await repo.save({ ...command, draft: command.draft }) : await repo.remove(command)
      if (epoch !== this.epoch) return { ok: false, error: 'unauthenticated' }
      if (!result.ok && result.error === 'unauthenticated') { this.signedOut(); return result }
      if (!result.ok) { this.publish({ phase: 'error', userId, trips: before, error: result.error }); return result }
      const trips = command.draft && result.value ? [...before.filter(r => r.draft.id !== command.id), result.value] : before.filter(r => r.draft.id !== command.id)
      this.publish({ phase: 'ready', userId, trips, error: null })
      return { ok: true, value: null }
    } catch {
      if (epoch !== this.epoch) return { ok: false, error: 'unauthenticated' }
      // A write may have committed before the response was lost. Do not retry blindly.
      this.publish({ phase: 'error', userId, trips: before, error: 'uncertain' })
      return { ok: false, error: 'uncertain' }
    }
  }
}
