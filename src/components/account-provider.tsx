"use client"
import {createContext,useContext,useEffect,useMemo,useRef,useState,useSyncExternalStore,type ReactNode} from 'react'
import {useAuth} from './auth-provider'
import {AccountSession,type AccountSnapshot} from '@/lib/cloud-trips/account'
import {httpRepositories} from '@/lib/cloud-trips/http'
import type {CountryRecord} from '@/lib/cloud-trips/contracts'
import {useTravelStore,type TravelData,type Status,type Review} from '@/lib/store'
import {sameJSON} from '@/lib/cloud-trips/supabase'

const empty:TravelData={statuses:{},notes:{},reviews:{}}
type CountryDraft={record:Omit<CountryRecord,'revision'>;expectedRevision:number|null}
type ContextValue={enabled:boolean;session:AccountSession;snapshot:AccountSnapshot;data:TravelData;draftData:TravelData;
  countryDrafts:Record<string,CountryDraft>;changeCountry:(id:string,patch:Partial<Omit<CountryRecord,'revision'>>)=>void;
  discardCountry:(id:string)=>void;saveCountry:(id:string)=>Promise<boolean>;reload:()=>Promise<void>}
const Context=createContext<ContextValue|null>(null)
function countryData(records:readonly Omit<CountryRecord,'revision'>[]):TravelData{
  const data:TravelData={statuses:{},notes:{},reviews:{}}
  for(const r of records){if(r.status)data.statuses[r.geoId]=r.status;if(r.notes)data.notes[r.geoId]=r.notes;if(Object.keys(r.review).length)data.reviews[r.geoId]=r.review as Review}
  return data
}
export function AccountProvider({children}:{children:ReactNode}){
  const {enabled,state,invalidateSession}=useAuth()
  const [session]=useState(()=>new AccountSession(httpRepositories(state.user?.id??'')))
  const current=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getServerSnapshot)
  const [countryDrafts,setCountryDrafts]=useState<Record<string,CountryDraft>>({})
  const editingCountry=useRef(false)
  useEffect(()=>{editingCountry.current=Object.keys(countryDrafts).length>0},[countryDrafts])
  const userId=state.phase==='ready'?state.user?.id??null:null
  const active=enabled && state.phase==='ready' && !!state.user && current.userId===state.user.id
  const snapshot=active?current:session.getServerSnapshot()
  useEffect(()=>{
    if(!enabled || !userId)return
    const id=userId
    const reload=()=>{if(document.visibilityState==='visible' && !editingCountry.current)void session.load(id)}
    void session.load(id)
    window.addEventListener('focus',reload);window.addEventListener('pageshow',reload);document.addEventListener('visibilitychange',reload)
    const timer=window.setInterval(reload,60000)
    return()=>{clearInterval(timer);window.removeEventListener('focus',reload);window.removeEventListener('pageshow',reload);document.removeEventListener('visibilitychange',reload);session.clear()}
  },[enabled,userId,session])
  useEffect(()=>session.subscribe(()=>{if(session.getSnapshot().error==='unauthenticated')invalidateSession();else if(session.getSnapshot().error==='account-changed')invalidateSession(true)}),[session,invalidateSession])
  const data=useMemo(()=>active?countryData(snapshot.countries):empty,[active,snapshot.countries])
  const draftData=useMemo(()=>active?countryData([...snapshot.countries.filter(r=>!countryDrafts[r.geoId]),...Object.values(countryDrafts).map(d=>d.record)]):empty,[active,snapshot.countries,countryDrafts])
  const value:ContextValue={enabled,session,snapshot,data,draftData,countryDrafts,
    changeCountry(id,patch){
      if(!active || !snapshot.ready || snapshot.busy)return
      setCountryDrafts(previous=>{
        const stored=snapshot.countries.find(r=>r.geoId===id)
        const base=previous[id]??{record:{geoId:id,status:stored?.status??null,notes:stored?.notes??'',review:stored?.review??{}},expectedRevision:stored?.revision??null}
        return {...previous,[id]:{...base,record:{...base.record,...patch,geoId:id}}}
      })
    },
    discardCountry(id){setCountryDrafts(previous=>{const next={...previous};delete next[id];return next})},
    async saveCountry(id){
      const draft=countryDrafts[id];if(!draft || !active)return false
      const result=await session.saveCountry(draft.record,draft.expectedRevision)
      if(!result.ok)return false
      // Do not discard edits typed while an earlier acknowledgement was in flight.
      setCountryDrafts(previous=>{
        const now=previous[id]
        if(!now)return previous
        if(!sameJSON(now.record,draft.record))return {...previous,[id]:{...now,expectedRevision:result.value.revision}}
        const next={...previous};delete next[id];return next
      })
      return true
    },
    reload:async()=>{if(state.user && state.phase==='ready')await session.load(state.user.id)}
  }
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useAccount(){const value=useContext(Context);if(!value)throw new Error('Missing AccountProvider');return value}
/** Map/sidebar read confirmed data only; the country editor can opt into unsaved fields. */
export function useCountryData(editing=false){
  const account=useAccount()
  const legacyStatuses=useTravelStore(s=>s.statuses),legacyNotes=useTravelStore(s=>s.notes),legacyReviews=useTravelStore(s=>s.reviews)
  const legacySetStatus=useTravelStore(s=>s.setStatus),legacySetNote=useTravelStore(s=>s.setNote),legacySetReview=useTravelStore(s=>s.setReview),legacyCycle=useTravelStore(s=>s.cycle)
  const data=account.enabled?(editing?account.draftData:account.data):{statuses:legacyStatuses,notes:legacyNotes,reviews:legacyReviews}
  return {...data,
    setStatus:(id:string,status:Status|null)=>account.enabled?account.changeCountry(id,{status}):legacySetStatus(id,status),
    setNote:(id:string,notes:string)=>account.enabled?account.changeCountry(id,{notes}):legacySetNote(id,notes),
    setReview:(id:string,patch:Partial<Review>)=>{
      if(!account.enabled){legacySetReview(id,patch);return}
      const review=Object.fromEntries(Object.entries({...account.draftData.reviews[id],...patch}).filter(([,v])=>v!==undefined&&v!==''))
      account.changeCountry(id,{review})
    },
    cycle:(id:string)=>{
      if(!account.enabled){legacyCycle(id);return}
      const cycle:{[key:string]:Status|null}={none:'wishlist',wishlist:'visited',visited:'blocked',blocked:null}
      useTravelStore.getState().flyTo(id);account.changeCountry(id,{status:cycle[data.statuses[id]??'none']})
    }
  }
}
