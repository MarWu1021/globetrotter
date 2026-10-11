import type { CloudTripRepository, CloudCountryRepository, CloudError, Result } from './contracts'
import { cloudErrors, object, validCloudTrip, validCollection, validCountry, revision } from './validation'

/** Same-origin cookies; the server verifies identity and uses the publishable SDK. */
export function httpRepositories(verifiedUserId:string, request:typeof fetch=fetch) {
  async function call<T>(path:string,command?:{operation:string;command:unknown}):Promise<Result<T>> {
    try {
      if(!command)path+=`${path.includes('?')?'&':'?'}expectedUserId=${encodeURIComponent(verifiedUserId)}`
      const response=await request(path,{cache:'no-store',credentials:'same-origin',
        ...(command?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...command,expectedUserId:verifiedUserId})}:{})})
      const body:unknown=await response.json()
      if(!object(body) || !object(body.result))return {ok:false,error:command?'uncertain':'network'}
      const result=body.result
      if(result.ok===false && cloudErrors.includes(result.error as CloudError))return {ok:false,error:result.error as CloudError}
      if(!response.ok || body.userId!==verifiedUserId || result.ok!==true)return {ok:false,error:body.userId!==verifiedUserId?'account-changed':command?'uncertain':'network'}
      return {ok:true,value:result.value as T}
    }catch{return {ok:false,error:command?'uncertain':'network'}}
  }
  const countries:CloudCountryRepository={
    list:async()=>{const r=await call<unknown[]>('/api/account?kind=countries');return r.ok?Array.isArray(r.value)&&r.value.every(v=>object(v)&&revision(v.revision)&&validCountry(v))?r as Awaited<ReturnType<CloudCountryRepository['list']>>:{ok:false,error:'invalid'}:r},
    save:c=>call('/api/account',{operation:'save-country',command:c}),
    remove:c=>call('/api/account',{operation:'remove-country',command:c}),
    restore:c=>call('/api/account',{operation:'restore-country',command:c})
  }
  const trips:CloudTripRepository={
    list:async()=>{const r=await call<unknown[]>('/api/account?kind=trips');return r.ok?Array.isArray(r.value)&&r.value.every(validCloudTrip)&&validCollection(r.value)?{ok:true,value:r.value}:{ok:false,error:'invalid'}:r},
    save:c=>call('/api/account',{operation:'save-trip',command:c}),
    remove:c=>call('/api/account',{operation:'remove-trip',command:c})
  }
  return {trips,countries}
}
