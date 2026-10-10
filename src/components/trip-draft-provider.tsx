"use client"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type Dispatch, type SetStateAction, type ReactNode } from 'react'
import { createTripDraft, type TripDraft } from '@/lib/trip-draft/core'
import { draftGlobePreview } from '@/lib/trip-draft/globe'
import type { CatalogAirport } from '@/lib/airport-data/types'
import { TripRepository } from '@/lib/trip-storage/repository'
import { TRIPS_KEY, savedTripToken, type SavedTrip } from '@/lib/trip-storage/core'
type Session = {
  mode:"idle"|"preview"|"picking"; setMode:Dispatch<SetStateAction<"idle"|"preview"|"picking">>
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
  repository:TripRepository; savedTrips:ReturnType<TripRepository['getSnapshot']>
  recordToken:string|null; setRecordToken:Dispatch<SetStateAction<string|null>>
  savedDraftJSON:string|null; setSavedDraftJSON:Dispatch<SetStateAction<string|null>>
  recordsOpen:boolean; setRecordsOpen:Dispatch<SetStateAction<boolean>>
  editorVersion:number
  loadSaved:(record:SavedTrip)=>void; newTrip:()=>void
}
const Context=createContext<Session|null>(null)
export function TripDraftProvider({children}:{children:ReactNode}) {
  const [drawerOpen,setDrawerOpen]=useState(false),[started,setStarted]=useState(false)
  const [draft,setDraft]=useState<TripDraft>(()=>({...createTripDraft('temporary-trip'),status:'completed'}))
  const [repository]=useState(()=>new TripRepository(()=>window.localStorage))
  const savedTrips=useSyncExternalStore(repository.subscribe,repository.getSnapshot,repository.getServerSnapshot)
  const [recordToken,setRecordToken]=useState<string|null>(null),[savedDraftJSON,setSavedDraftJSON]=useState<string|null>(null)
  const [recordsOpen,setRecordsOpen]=useState(false)
  const [editorVersion,setEditorVersion]=useState(0)
  useEffect(()=>{
    const refresh=(event:StorageEvent)=>{if(event.key===TRIPS_KEY || event.key===null)repository.reload()}
    window.addEventListener('storage',refresh)
    return ()=>window.removeEventListener('storage',refresh)
  },[repository])
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
    setEditorVersion(v=>v+1)
    setDraft({...createTripDraft(crypto.randomUUID()),status:'completed'});setRecordToken(null);setSavedDraftJSON(null)
    setInsertion('end');setCandidate(null);setSearchAirports([]);setFocusAirport(null);setMode('idle');setStarted(true);setOpened(true)
  },[])
  const loadSaved=useCallback((record:SavedTrip)=>{
    setEditorVersion(v=>v+1)
    setDraft(structuredClone(record.draft));setRecordToken(savedTripToken(record));setSavedDraftJSON(JSON.stringify(record.draft))
    setInsertion('end');setCandidate(null);setSearchAirports([]);setFocusAirport(null);setMode('idle');setRecordsOpen(false);setStarted(true);setOpened(true)
  },[])
  const session=useMemo(()=>({mode,setMode,previewActive,mapPreview,previewView,setPreviewView,drawerOpen,setDrawerOpen,started,setStarted,insertion,setInsertion,draft,setDraft,opened,setOpened,picking,setPicking,candidate,setCandidate,searchAirports,setSearchAirports,focusAirport,setFocusAirport,repository,savedTrips,recordToken,setRecordToken,savedDraftJSON,setSavedDraftJSON,recordsOpen,setRecordsOpen,editorVersion,loadSaved,newTrip}),
    [mode,previewActive,mapPreview,previewView,drawerOpen,started,insertion,draft,opened,picking,setPicking,candidate,searchAirports,focusAirport,repository,savedTrips,recordToken,savedDraftJSON,recordsOpen,editorVersion,loadSaved,newTrip])
  return <Context.Provider value={session}>{children}</Context.Provider>
}
export function useTripDraft() { const session=useContext(Context); if(!session) throw new Error('Missing draft provider');return session }
