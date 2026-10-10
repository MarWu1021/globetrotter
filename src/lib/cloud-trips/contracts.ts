import type { TripDraft } from '../trip-draft/core'
import type { SavedTrip } from '../trip-storage/core'

/** D1 contract only. A real transport MUST derive identity from verified Auth, not user input. */
export interface CloudTrip extends SavedTrip { revision: number }
export interface CountryRecord {
  geoId: string
  status: 'visited' | 'wishlist' | 'blocked' | null
  notes: string
  review: Readonly<Record<string, unknown>>
  revision: number
}
export type CloudError = 'unauthenticated' | 'invalid' | 'conflict' | 'network' | 'uncertain' | 'busy'
export type Result<T> = { ok: true; value: T } | { ok: false; error: CloudError }
export interface Mutation { id: string; expectedRevision: number | null; requestId: string }
export interface CloudTripRepository {
  list(): Promise<Result<readonly CloudTrip[]>>
  save(command: Mutation & { draft: TripDraft }): Promise<Result<CloudTrip>>
  remove(command: Mutation): Promise<Result<null>>
}
export interface CloudCountryRepository {
  list(): Promise<Result<readonly CountryRecord[]>>
  save(command: Mutation & { record: Omit<CountryRecord, 'revision'> }): Promise<Result<CountryRecord>>
  remove(command: Mutation): Promise<Result<null>>
}
export type SessionPhase = 'signed-out' | 'authenticating' | 'loading' | 'ready' | 'syncing' | 'error' | 'signing-out'
export interface PrivateSnapshot {
  phase: SessionPhase
  userId: string | null
  trips: readonly CloudTrip[]
  error: CloudError | null
}
