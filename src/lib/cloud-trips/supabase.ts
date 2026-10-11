import type { SupabaseClient } from '@supabase/supabase-js'
import type { CloudTrip, CountryRecord, CloudTripRepository, CloudCountryRepository, Result } from './contracts'
import { validSavedDraft } from '../trip-storage/core'
import { cloudError, object, revision, validCountry, validMutation, validCollection } from './validation'

const failure = <T>(error: unknown, writing: boolean): Result<T> => ({ok:false,error:cloudError(error,writing)})
const iso = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null
const unwrap=(v:unknown)=>Array.isArray(v)&&v.length===1?v[0]:v
function tripRow(v: unknown, userId: string, deleted = false): CloudTrip | null {
  v=unwrap(v)
  if (!object(v) || v.user_id !== userId || v.schema_version !== 1 || !revision(v.revision) || !validSavedDraft(v.payload) ||
    v.id !== v.payload.id || (deleted ? !iso(v.deleted_at) : v.deleted_at !== null)) return null
  const createdAt=iso(v.created_at),updatedAt=iso(v.updated_at)
  if (!createdAt || !updatedAt || updatedAt < createdAt) return null
  return {draft:structuredClone(v.payload),revision:v.revision,createdAt,updatedAt}
}
function countryRow(v: unknown, userId: string, deleted = false): CountryRecord | null {
  v=unwrap(v)
  if (!object(v) || v.user_id !== userId || !revision(v.revision) || (deleted ? !iso(v.deleted_at) : v.deleted_at !== null)) return null
  const record={geoId:v.geo_id,status:v.status,notes:v.notes,review:v.review}
  return validCountry(record) ? {...structuredClone(record),revision:v.revision} as CountryRecord : null
}
function acknowledged(v:unknown,c:{requestId:string;expectedRevision:number|null},operation:string):boolean {
  v=unwrap(v)
  return object(v) && v.last_mutation_id===c.requestId && v.last_expected_revision===c.expectedRevision && v.last_operation===operation
}
/** Only call after server auth.getUser() verification. No secret key or local storage. */
export function supabaseRepositories(client: SupabaseClient, verifiedUserId: string) {
  const listRows = async (table: 'trips'|'country_records', select: string): Promise<Result<unknown[]>> => {
    if (!verifiedUserId) return {ok:false,error:'unauthenticated'}
    const rows: unknown[] = []
    try {
      // Stable ID ordering and explicit pagination avoid PostgREST's row-limit truncation.
      for (let offset=0;offset<20000;offset+=200) {
        const response = await client.from(table).select(select).eq('user_id',verifiedUserId).is('deleted_at',null)
          .order(table==='trips'?'id':'geo_id').range(offset,offset+199)
        if (response.error) return failure(response.error,false)
        if (!Array.isArray(response.data)) return {ok:false,error:'invalid'}
        rows.push(...response.data)
        if (response.data.length<200) return {ok:true,value:rows}
      }
      return {ok:false,error:'invalid'} // never silently show a truncated account
    } catch (e) { return failure(e,false) }
  }
  const tripFields='user_id,id,payload,schema_version,revision,created_at,updated_at,deleted_at'
  const countryFields='user_id,geo_id,status,notes,review,revision,deleted_at'
  const trips: CloudTripRepository = {
    async list() {
      const result=await listRows('trips',tripFields);if(!result.ok)return result
      const rows=result.value.map(v=>tripRow(v,verifiedUserId))
      return rows.every((v):v is CloudTrip=>!!v) && validCollection(rows) ? {ok:true,value:rows} : {ok:false,error:'invalid'}
    },
    async save(c) {
      if(!validMutation(c) || !validSavedDraft(c.draft) || c.id!==c.draft.id)return {ok:false,error:'invalid'}
      try {
        const r=await client.rpc('d1_write_trip',{p_id:c.id,p_payload:c.draft,p_expected_revision:c.expectedRevision,p_mutation_id:c.requestId})
        if(r.error)return failure(r.error,true)
        if(!acknowledged(r.data,c,'save'))return {ok:false,error:'uncertain'}
        const row=tripRow(r.data,verifiedUserId)
        if(!row || row.revision!==(c.expectedRevision===null?1:c.expectedRevision+1) || row.draft.id!==c.id || JSON.stringify(row.draft)!==JSON.stringify(c.draft)) {
          // JSONB may reorder keys: compare semantics without requiring key order.
          if(!row || row.revision!==(c.expectedRevision===null?1:c.expectedRevision+1) || row.draft.id!==c.id || !sameJSON(row.draft,c.draft))return {ok:false,error:'uncertain'}
        }
        return {ok:true,value:row}
      } catch(e){return failure(e,true)}
    },
    async remove(c) {
      if(!validMutation(c) || c.expectedRevision===null)return {ok:false,error:'invalid'}
      try {
        const r=await client.rpc('d1_write_trip',{p_id:c.id,p_payload:null,p_expected_revision:c.expectedRevision,p_mutation_id:c.requestId})
        if(r.error)return failure(r.error,true)
        if(!acknowledged(r.data,c,'delete'))return {ok:false,error:'uncertain'}
        const row=tripRow(r.data,verifiedUserId,true)
        return row?.draft.id===c.id && row.revision===c.expectedRevision+1 ? {ok:true,value:null} : {ok:false,error:'uncertain'}
      } catch(e){return failure(e,true)}
    }
  }
  const countries: CloudCountryRepository = {
    async list() {
      const result=await listRows('country_records',countryFields);if(!result.ok)return result
      const rows=result.value.map(v=>countryRow(v,verifiedUserId))
      return rows.every((v):v is CountryRecord=>!!v) && new Set(rows.map(v=>v.geoId)).size===rows.length ? {ok:true,value:rows} : {ok:false,error:'invalid'}
    },
    async save(c) {
      if(!validMutation(c) || !validCountry(c.record) || c.record.geoId!==c.id)return {ok:false,error:'invalid'}
      try {
        const r=await client.rpc('d1_write_country',{p_geo_id:c.id,p_status:c.record.status,p_notes:c.record.notes,p_review:c.record.review,p_delete:false,p_expected_revision:c.expectedRevision,p_mutation_id:c.requestId})
        if(r.error)return failure(r.error,true)
        if(!acknowledged(r.data,c,'save'))return {ok:false,error:'uncertain'}
        const row=countryRow(r.data,verifiedUserId)
        return row && row.revision===(c.expectedRevision===null?1:c.expectedRevision+1) && sameJSON({...c.record,revision:row.revision},row) ? {ok:true,value:row} : {ok:false,error:'uncertain'}
      }catch(e){return failure(e,true)}
    },
    async remove(c) {
      if(!validMutation(c) || c.expectedRevision===null)return {ok:false,error:'invalid'}
      try {
        const r=await client.rpc('d1_write_country',{p_geo_id:c.id,p_status:null,p_notes:'',p_review:{},p_delete:true,p_expected_revision:c.expectedRevision,p_mutation_id:c.requestId})
        if(r.error)return failure(r.error,true)
        if(!acknowledged(r.data,c,'delete'))return {ok:false,error:'uncertain'}
        const row=countryRow(r.data,verifiedUserId,true)
        return row?.geoId===c.id && row.revision===c.expectedRevision+1 ? {ok:true,value:null} : {ok:false,error:'uncertain'}
      }catch(e){return failure(e,true)}
    },
    async restore(c) {
      if(!validMutation(c) || c.expectedRevision===null)return {ok:false,error:'invalid'}
      try {
        const r=await client.rpc('d1_restore_country',{p_geo_id:c.id,p_expected_revision:c.expectedRevision,p_mutation_id:c.requestId})
        if(r.error)return failure(r.error,true)
        if(!acknowledged(r.data,c,'restore'))return {ok:false,error:'uncertain'}
        const row=countryRow(r.data,verifiedUserId)
        return row?.geoId===c.id && row.revision===c.expectedRevision+1 ? {ok:true,value:row} : {ok:false,error:'uncertain'}
      }catch(e){return failure(e,true)}
    }
  }
  return {trips,countries}
}
export function sameJSON(a: unknown,b: unknown): boolean {
  if(a===b)return true
  if(Array.isArray(a) && Array.isArray(b))return a.length===b.length && a.every((v,i)=>sameJSON(v,b[i]))
  return object(a) && object(b) && Object.keys(a).length===Object.keys(b).length && Object.keys(a).every(k=>Object.hasOwn(b,k)&&sameJSON(a[k],b[k]))
}
