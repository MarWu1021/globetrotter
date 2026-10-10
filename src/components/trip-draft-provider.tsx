"use client"
import { createContext, useCallback, useContext, useMemo, useState, type Dispatch, type SetStateAction, type ReactNode } from 'react'
import { createTripDraft, type TripDraft } from '@/lib/trip-draft/core'
import { draftGlobePreview } from '@/lib/trip-draft/globe'
import type { CatalogAirport } from '@/lib/airport-data/types'
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
}
const Context=createContext<Session|null>(null)
export function TripDraftProvider({children}:{children:ReactNode}) {
  const [drawerOpen,setDrawerOpen]=useState(false),[started,setStarted]=useState(false)
  const [draft,setDraft]=useState(()=>createTripDraft('temporary-trip'))
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
  const session=useMemo(()=>({mode,setMode,previewActive,mapPreview,previewView,setPreviewView,drawerOpen,setDrawerOpen,started,setStarted,insertion,setInsertion,draft,setDraft,opened,setOpened,picking,setPicking,candidate,setCandidate,searchAirports,setSearchAirports,focusAirport,setFocusAirport}),
    [mode,previewActive,mapPreview,previewView,drawerOpen,started,insertion,draft,opened,picking,setPicking,candidate,searchAirports,focusAirport])
  return <Context.Provider value={session}>{children}</Context.Provider>
}
export function useTripDraft() { const session=useContext(Context); if(!session) throw new Error('Missing draft provider');return session }
