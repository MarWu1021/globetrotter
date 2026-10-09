"use client"
import { createContext, useContext, useMemo, useState, type Dispatch, type SetStateAction, type ReactNode } from 'react'
import { createTripDraft, type TripDraft } from '@/lib/trip-draft/core'
import type { CatalogAirport } from '@/lib/airport-data/types'
type Session = {
  drawerOpen:boolean; setDrawerOpen:Dispatch<SetStateAction<boolean>>
  started:boolean; setStarted:Dispatch<SetStateAction<boolean>>
  insertion:string; setInsertion:Dispatch<SetStateAction<string>>
  draft:TripDraft; setDraft:Dispatch<SetStateAction<TripDraft>>
  opened:boolean; setOpened:Dispatch<SetStateAction<boolean>>
  picking:boolean; setPicking:Dispatch<SetStateAction<boolean>>
  candidate:CatalogAirport|null; setCandidate:Dispatch<SetStateAction<CatalogAirport|null>>
  searchAirports:CatalogAirport[]; setSearchAirports:Dispatch<SetStateAction<CatalogAirport[]>>
  focusAirport:CatalogAirport|null; setFocusAirport:Dispatch<SetStateAction<CatalogAirport|null>>
}
const Context=createContext<Session|null>(null)
export function TripDraftProvider({children}:{children:ReactNode}) {
  const [drawerOpen,setDrawerOpen]=useState(false),[started,setStarted]=useState(false)
  const [draft,setDraft]=useState(()=>createTripDraft('temporary-trip'))
  const [insertion,setInsertion]=useState("end")
  const [opened,setOpened]=useState(false),[picking,setPicking]=useState(false)
  const [candidate,setCandidate]=useState<CatalogAirport|null>(null)
  const [searchAirports,setSearchAirports]=useState<CatalogAirport[]>([])
  const [focusAirport,setFocusAirport]=useState<CatalogAirport|null>(null)
  const session=useMemo(()=>({drawerOpen,setDrawerOpen,started,setStarted,insertion,setInsertion,draft,setDraft,opened,setOpened,picking,setPicking,candidate,setCandidate,searchAirports,setSearchAirports,focusAirport,setFocusAirport}),
    [drawerOpen,started,insertion,draft,opened,picking,candidate,searchAirports,focusAirport])
  return <Context.Provider value={session}>{children}</Context.Provider>
}
export function useTripDraft() { const session=useContext(Context); if(!session) throw new Error('Missing draft provider');return session }
