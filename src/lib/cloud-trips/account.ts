import type { CloudTrip, CountryRecord, CloudTripRepository, CloudCountryRepository, CloudError, Result } from './contracts'
import { validCollection, validCountry, revision } from './validation'
import type { TripDraft } from '../trip-draft/core'

export interface AccountSnapshot {
  userId:string|null;ready:boolean;busy:boolean;trips:readonly CloudTrip[];countries:readonly CountryRecord[];error:CloudError|null
}
const EMPTY:AccountSnapshot=Object.freeze({userId:null,ready:false,busy:false,trips:[],countries:[],error:null})
const freeze=(s:AccountSnapshot):AccountSnapshot=>{
  const copy=structuredClone(s)
  function walk(v:unknown){if(v&&typeof v==='object'){Object.values(v).forEach(walk);Object.freeze(v)}}
  walk(copy);return copy
}
/** Account-scoped memory only. No localStorage, persisted Zustand, optimistic maps or tokens. */
export class AccountSession {
  private state=EMPTY
  private epoch=0
  private listeners=new Set<()=>void>()
  private pending:{fingerprint:string;requestId:string}|null=null
  constructor(private repos:{trips:CloudTripRepository;countries:CloudCountryRepository},private uuid:()=>string=()=>crypto.randomUUID()){}
  getSnapshot=()=>this.state
  getServerSnapshot=()=>EMPTY
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
  private publish(s:AccountSnapshot){this.state=freeze(s);this.listeners.forEach(f=>f())}
  clear=()=>{this.epoch++;this.pending=null;this.publish(EMPTY)}
  private expired(userId:string|null,error:'unauthenticated'|'account-changed'='unauthenticated'){this.clear();this.publish({...EMPTY,userId,error})}
  async load(userId:string):Promise<void>{
    if(this.state.busy)return
    const same=this.state.userId===userId,epoch=++this.epoch
    if(!same)this.pending=null
    const before=same?this.state:EMPTY
    this.publish({...before,userId,busy:true,error:null})
    try {
      const [trips,countries]=await Promise.all([this.repos.trips.list(),this.repos.countries.list()])
      if(epoch!==this.epoch)return
      if(!trips.ok||!countries.ok){const error=!trips.ok?trips.error:!countries.ok?countries.error:'invalid'
        if(error==='unauthenticated'||error==='account-changed'){this.expired(userId,error);return}
        this.publish({...before,userId,busy:false,error});return
      }
      if(!validCollection(trips.value) || !countries.value.every(c=>validCountry(c)&&revision(c.revision)) || new Set(countries.value.map(c=>c.geoId)).size!==countries.value.length){this.publish({...before,userId,busy:false,error:'invalid'});return}
      this.publish({userId,ready:true,busy:false,trips:trips.value,countries:countries.value,error:null})
    }catch{if(epoch===this.epoch)this.publish({...before,userId,busy:false,error:'network'})}
  }
  saveTrip=(draft:TripDraft,expectedRevision:number|null):Promise<Result<CloudTrip>>=>this.write('save-trip',draft.id,expectedRevision,draft)
  removeTrip=(id:string,expectedRevision:number):Promise<Result<null>>=>this.write('remove-trip',id,expectedRevision)
  saveCountry=(record:Omit<CountryRecord,'revision'>,expectedRevision:number|null):Promise<Result<CountryRecord>>=>this.write('save-country',record.geoId,expectedRevision,record)
  private async write<T>(operation:'save-trip'|'remove-trip'|'save-country',id:string,expectedRevision:number|null,payload?:TripDraft|Omit<CountryRecord,'revision'>):Promise<Result<T>> {
    const before=this.state,epoch=this.epoch
    if(!before.userId)return {ok:false,error:'unauthenticated'}
    if(!before.ready || before.busy)return {ok:false,error:'busy'}
    const captured=structuredClone(payload)
    if(operation==='save-trip'&&!validCollection([...before.trips.filter(t=>t.draft.id!==id),{draft:captured as TripDraft,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),revision:1}]))return {ok:false,error:'invalid'}
    const fingerprint=JSON.stringify([operation,id,expectedRevision,captured])
    if(this.pending && this.pending.fingerprint!==fingerprint)return {ok:false,error:'uncertain'}
    const command={id,expectedRevision,requestId:this.pending?.requestId??this.uuid()}
    this.pending={fingerprint,requestId:command.requestId}
    this.publish({...before,busy:true,error:null})
    try {
      const result=operation==='save-trip'?await this.repos.trips.save({...command,draft:captured as TripDraft}):operation==='remove-trip'?await this.repos.trips.remove(command):await this.repos.countries.save({...command,record:captured as Omit<CountryRecord,'revision'>})
      if(epoch!==this.epoch)return {ok:false,error:'unauthenticated'}
      if(!result.ok){
        if(result.error==='unauthenticated'||result.error==='account-changed'){this.expired(before.userId,result.error);return result}
        if(!['uncertain','network'].includes(result.error))this.pending=null
        this.publish({...before,busy:false,error:result.error});return result
      }
      let next=before
      if(operation==='save-trip'){
        const record=result.value as CloudTrip
        const trips=[...before.trips.filter(t=>t.draft.id!==id),record]
        if(record?.draft?.id!==id || !validCollection(trips))throw new Error('Invalid acknowledgement')
        next={...before,trips}
      }else if(operation==='remove-trip')next={...before,trips:before.trips.filter(t=>t.draft.id!==id)}
      else {
        const record=result.value as CountryRecord
        if(!validCountry(record)||!revision(record.revision)||record.geoId!==id)throw new Error('Invalid acknowledgement')
        next={...before,countries:[...before.countries.filter(c=>c.geoId!==id),record]}
      }
      this.pending=null;this.publish({...next,busy:false,error:null})
      return result as Result<T>
    }catch{
      if(epoch!==this.epoch)return {ok:false,error:'unauthenticated'}
      this.publish({...before,busy:false,error:'uncertain'});return {ok:false,error:'uncertain'}
    }
  }
}
