import type { CloudTrip, CountryRecord, Mutation, CloudError } from './contracts'
import { validSavedDraft } from '../trip-storage/core'

export const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const identity = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 250
// Identity is a consistency precondition, never an authentication credential.
export const sameAccount=(verifiedUserId:string,expectedUserId:unknown):boolean=>identity(expectedUserId)&&expectedUserId===verifiedUserId
export const revision = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 1
export function validMutation(v: unknown): v is Mutation {
  return object(v) && identity(v.id) && (v.expectedRevision === null || revision(v.expectedRevision)) &&
    typeof v.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.requestId)
}
export function validCountry(v: unknown): v is Omit<CountryRecord, 'revision'> {
  if (!object(v) || !identity(v.geoId) || (v.status !== null && !['visited','wishlist','blocked'].includes(String(v.status))) ||
    typeof v.notes !== 'string' || v.notes.length > 20000 || !object(v.review)) return false
  try { if (new TextEncoder().encode(JSON.stringify(v.review)).length > 50000) return false } catch { return false }
  const r = v.review
  return (r.rating === undefined || (Number.isInteger(r.rating) && Number(r.rating) >= 1 && Number(r.rating) <= 5)) &&
    (r.wouldReturn === undefined || ['yes','maybe','no'].includes(String(r.wouldReturn))) &&
    ['liked','disliked','bestTime'].every(k => r[k] === undefined || (typeof r[k] === 'string' && r[k].length <= 20000)) &&
    (r.visits === undefined || (Array.isArray(r.visits) && r.visits.every(v => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v))))
}
export function validCloudTrip(v: unknown): v is CloudTrip {
  return object(v) && revision(v.revision) && validSavedDraft(v.draft) &&
    typeof v.createdAt === 'string' && typeof v.updatedAt === 'string' &&
    Number.isFinite(Date.parse(v.createdAt)) && Number.isFinite(Date.parse(v.updatedAt)) && Date.parse(v.updatedAt) >= Date.parse(v.createdAt)
}
export function validCollection(trips: readonly CloudTrip[]): boolean {
  if (!trips.every(validCloudTrip)) return false
  const ids = [trips.map(t => t.draft.id), trips.flatMap(t => t.draft.stops.map(s => s.id)), trips.flatMap(t => t.draft.legs.map(l => l.id))]
  return ids.every(group => new Set(group).size === group.length)
}
export function cloudError(error: unknown, writing: boolean): CloudError {
  if (!object(error)) return writing ? 'uncertain' : 'network'
  const code = String(error.code ?? '')
  if (['42P01','42883','PGRST202','PGRST205'].includes(code)) return 'setup'
  if (['40001','23505'].includes(code)) return 'conflict'
  if (code.startsWith('22') || ['23514','23502','23503'].includes(code)) return 'invalid'
  if (['42501','PGRST301','PGRST302','PGRST303'].includes(code)) return 'unauthenticated'
  return writing ? 'uncertain' : 'network'
}
export const cloudErrors: readonly CloudError[] = ['unauthenticated','account-changed','invalid','conflict','network','uncertain','busy','setup']
