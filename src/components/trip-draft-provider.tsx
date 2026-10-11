"use client"
import { useAccount, useCountryData } from "./account-provider"
import { useTravelStore } from "@/lib/store"
import { useAuth } from "./auth-provider"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type Dispatch, type SetStateAction, type ReactNode } from 'react'
import { createTripDraft, type TripDraft } from '@/lib/trip-draft/core'
import { draftGlobePreview } from '@/lib/trip-draft/globe'
import type { CatalogAirport } from '@/lib/airport-data/types'
import { savedTripMap } from '@/lib/trip-map/core'
import { TripRepository } from '@/lib/trip-storage/repository'
import { TRIPS_KEY, savedTripToken, type SavedTrip } from '@/lib/trip-storage/core'
import { acknowledgedJourney, journeyFrame } from '@/lib/presentation/journey'
import { useMotionPolicy } from '@/lib/presentation/use-motion-policy'
type Journey=NonNullable<ReturnType<typeof acknowledgedJourney>> & {fromColors:Readonly<Record<string,string>>}
type Session = {
  journey:Journey|null; journeyReady:boolean; markJourneyReady:()=>void; journeyElapsed:number; skipJourney:()=>void; celebrate:(draft:TripDraft,creating:boolean,fromColors:Readonly<Record<string,string>>)=>void
  savedNotice:boolean; setSavedNotice:Dispatch<SetStateAction<boolean>>
  mode:"idle"|"preview"|"picking"; setMode:Dispatch<SetStateAction<"idle"|"preview"|"picking">>
  savedMap:ReturnType<typeof savedTripMap>
  previewActive:boolean; mapPreview:ReturnType<typeof draftGlobePreview>
  previewView:"map"|"globe"; setPreviewView:Dispatch<SetStateAction<"map"|"globe">>
  drawerOpen:boolean; setDrawerOpen:Dispatch<SetStateAction<boolean>>
  started:boolean; setStarted:Dispatch<SetStateAction<boolean>>
  insertion:string; setInsertion:Dispatch<SetStateAction<string>>
  draft:TripDraft; setDraft:Dispatch<SetStateAction<TripDraft>>
  opened:boolean; setOpened:Dispatch<SetStateAction<boolean>>
  picking:boolean; setPicking:(value:boolean)=>void
  candidate:CatalogAirport|null; setCandidate:Dispatch<SetStateAction<CatalogAirport|null>>
  searchAirports:CatalogAirport[]; setSearchAirports:Dispatch<SetStateAction<CatalogAirport[]>>
  focusAirport:CatalogAirport|null; setFocusAirport:Dispatch<SetStateAction<CatalogAirport|null>>
  repository:TripRepository; savedTrips:{ready:boolean;trips:readonly SavedTrip[];error:import('@/lib/cloud-trips/contracts').CloudError|import('@/lib/trip-storage/core').StorageError|null;busy?:boolean}
  recordToken:string|null; setRecordToken:Dispatch<SetStateAction<string|null>>
  savedDraftJSON:string|null; setSavedDraftJSON:Dispatch<SetStateAction<string|null>>
  recordsOpen:boolean; setRecordsOpen:Dispatch<SetStateAction<boolean>>
  editorVersion:number
  loadSaved:(record:SavedTrip)=>void; newTrip:()=>void
}
const Context=createContext<Session|null>(null)
export function TripDraftProvider({children}:{children:ReactNode}) {
  const {enabled:authEnabled}=useAuth()
  const policy=useMotionPolicy()
  const [journeyReady,setJourneyReady]=useState(false)
  const markJourneyReady=useCallback(()=>setJourneyReady(true),[])
  const [journey,setJourney]=useState<Journey|null>(null),[journeyElapsed,setJourneyElapsed]=useState(0),[savedNotice,setSavedNotice]=useState(false)
  const skipJourney=useCallback(()=>setJourney(null),[])
  const celebrate=useCallback((saved:TripDraft,creating:boolean,fromColors:Readonly<Record<string,string>>)=>{
    setSavedNotice(true)
    const plan=acknowledgedJourney(saved,true,creating)
    if(plan)useTravelStore.getState().setView('globe')
    if(plan&&!policy.reduced&&!policy.hidden&&!policy.lowPower){setJourneyReady(false);setJourneyElapsed(0);setJourney({...plan,fromColors:{...fromColors}})}
  },[policy])
  useEffect(()=>{
    if(!journey)return
    if(policy.reduced||policy.hidden||policy.lowPower){const cancel=setTimeout(()=>setJourney(null),0);return()=>clearTimeout(cancel)}
    if(!journeyReady)return
    let raf=0,previous=0,elapsed=0,last=-100
    const tick=(now:number)=>{if(previous)elapsed+=Math.min(100,now-previous);previous=now;if(elapsed-last>=80){last=elapsed;setJourneyElapsed(elapsed)};if(journeyFrame(journey.arcs,elapsed).done)setJourney(null);else raf=requestAnimationFrame(tick)}
    raf=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(raf)
  },[journey,journeyReady,policy.reduced,policy.hidden,policy.lowPower])
  useEffect(()=>{if(!savedNotice || journey)return;const timer=setTimeout(()=>setSavedNotice(false),7000);return()=>clearTimeout(timer)},[savedNotice,journey])
  const [drawerOpen,setDrawerOpen]=useState(false),[started,setStarted]=useState(false)
  const [draft,setDraft]=useState<TripDraft>(()=>({...createTripDraft('temporary-trip'),status:'completed'}))
  const [repository]=useState(()=>new TripRepository(()=>window.localStorage, !authEnabled))
  const localTrips=useSyncExternalStore(repository.subscribe,repository.getSnapshot,repository.getServerSnapshot)
  const account=useAccount()
  const savedTrips=authEnabled?account.snapshot:localTrips
  const {statuses}=useCountryData()
  const savedMap=useMemo(()=>savedTripMap(savedTrips.trips,statuses),[savedTrips.trips,statuses])
  const [recordToken,setRecordToken]=useState<string|null>(null),[savedDraftJSON,setSavedDraftJSON]=useState<string|null>(null)
  const [recordsOpen,setRecordsOpen]=useState(false)
  const [editorVersion,setEditorVersion]=useState(0)
  useEffect(()=>{
    const refresh=(event:StorageEvent)=>{if(!authEnabled && (event.key===TRIPS_KEY || event.key===null))repository.reload()}
    window.addEventListener('storage',refresh)
    return ()=>window.removeEventListener('storage',refresh)
  },[repository,authEnabled])
  const [insertion,setInsertion]=useState("end")
  const [opened,setOpened]=useState(false)
  const [mode,setMode]=useState<Session["mode"]>("idle")
  const [previewView,setPreviewView]=useState<"map"|"globe">("globe")
  const picking=mode==="picking",previewActive=mode!=="idle"
  const setPicking=useCallback((value:boolean)=>setMode(value?"picking":"idle"),[])
  const mapPreview=useMemo(()=>draftGlobePreview(draft),[draft])
  const [candidate,setCandidate]=useState<CatalogAirport|null>(null)
  const [searchAirports,setSearchAirports]=useState<CatalogAirport[]>([])
  const [focusAirport,setFocusAirport]=useState<CatalogAirport|null>(null)
  const newTrip=useCallback(()=>{
    setJourney(null);setSavedNotice(false);setEditorVersion(v=>v+1)
    setDraft({...createTripDraft(crypto.randomUUID()),status:'completed'});setRecordToken(null);setSavedDraftJSON(null)
    setInsertion('end');setCandidate(null);setSearchAirports([]);setFocusAirport(null);setMode('idle');setStarted(true);setOpened(true)
  },[])
  const loadSaved=useCallback((record:SavedTrip)=>{
    setJourney(null);setSavedNotice(false);setEditorVersion(v=>v+1)
    setDraft(structuredClone(record.draft));setRecordToken(savedTripToken(record));setSavedDraftJSON(JSON.stringify(record.draft))
    setInsertion('end');setCandidate(null);setSearchAirports([]);setFocusAirport(null);setMode('idle');setRecordsOpen(false);setStarted(true);setOpened(true)
  },[])
  const session=useMemo(()=>({journey,journeyReady,markJourneyReady,journeyElapsed,skipJourney,celebrate,savedNotice,setSavedNotice,savedMap,mode,setMode,previewActive,mapPreview,previewView,setPreviewView,drawerOpen,setDrawerOpen,started,setStarted,insertion,setInsertion,draft,setDraft,opened,setOpened,picking,setPicking,candidate,setCandidate,searchAirports,setSearchAirports,focusAirport,setFocusAirport,repository,savedTrips,recordToken,setRecordToken,savedDraftJSON,setSavedDraftJSON,recordsOpen,setRecordsOpen,editorVersion,loadSaved,newTrip}),
    [journey,journeyReady,markJourneyReady,journeyElapsed,skipJourney,celebrate,savedNotice,savedMap,mode,previewActive,mapPreview,previewView,drawerOpen,started,insertion,draft,opened,picking,setPicking,candidate,searchAirports,focusAirport,repository,savedTrips,recordToken,savedDraftJSON,recordsOpen,editorVersion,loadSaved,newTrip])
  return <Context.Provider value={session}>{children}</Context.Provider>
}
export function useTripDraft() { const session=useContext(Context); if(!session) throw new Error('Missing draft provider');return session }
