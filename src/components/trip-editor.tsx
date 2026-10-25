"use client"

import AirlineAutocomplete from "./airline-autocomplete"
import { useAccount } from "./account-provider"
import { useAuth } from "./auth-provider"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTripDraft } from "./trip-draft-provider"
import { useT } from "@/lib/i18n"
import { useTravelStore } from "@/lib/store"
import { countryDisplayName } from "@/lib/airport-data/countries"
import { airportChinese } from "@/lib/airport-data/localization"
import type { AirportSearchHit, CatalogAirport } from "@/lib/airport-data/types"
import type { Presence } from "@/lib/travel-core/models"
import { addDraftStop, previewTripDraft, type DraftLeg, type TripDraft } from "@/lib/trip-draft/core"
import { savedTripToken, type StorageError } from "@/lib/trip-storage/core"

import { appendReturnRoute, replaceDraftStopAirport, removeDraftSegment, moveDraftSegment } from "@/lib/trip-draft/segments"
import { draftGlobePreview } from "@/lib/trip-draft/globe"
import styles from "./trip-editor.module.css"
import { scrollEditorControl, useEditorViewport } from "./use-editor-viewport"

type Result = { hit: AirportSearchHit; airport: CatalogAirport }
const field = "min-h-11 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-base text-[var(--ink)]"
const button = "min-h-11 min-w-11 rounded-lg border border-[var(--border)] px-3 py-2 disabled:opacity-40"
const code = (a: CatalogAirport) => a.iata ?? a.icao ?? a.ident

/** Keep optional values mounted and initialize saved details expanded. Visibility
 * is UI state only, never a change to a flight's persisted shape. */
function OptionalFlightDetails({leg,onChange}:{leg:DraftLeg;onChange:(id:string,key:"flightNumber"|"notes",value:string)=>void}) {
  const t=useT()
  const filled=!!(leg.flightNumber?.trim()||leg.notes?.trim())
  const [expanded,setExpanded]=useState(filled)
  return <details className={styles.more} open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)} data-flight-more>
    <summary>{t("ticket.more")} {filled && <span className={styles.filled}>{leg.flightNumber||t("ticket.detailsFilled")}</span>}</summary>
    <div className={styles.extraFields}>
      <label><span>{t("trip.number")}</span><input aria-label={t("trip.number")} className={field} maxLength={200} value={leg.flightNumber??""} onChange={e=>onChange(leg.id,"flightNumber",e.target.value)} /></label>
      <label><span>{t("trip.notes")}</span><textarea aria-label={t("trip.notes")} className={field} maxLength={2000} rows={2} value={leg.notes??""} onChange={e=>onChange(leg.id,"notes",e.target.value)} /></label>
    </div>
  </details>
}

export default function TripEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {enabled:authEnabled}=useAuth()
  const account=useAccount()
  const storedView=useTravelStore(s=>s.view)
  const t = useT(), locale = useTravelStore(s => s.locale)
  const { savedMap,celebrate, draft, setDraft, insertion, setInsertion, setOpened, setPicking, setDrawerOpen, setSearchAirports, setFocusAirport, setMode, setPreviewView, setCandidate,repository,savedTrips,recordToken,setRecordToken,savedDraftJSON,setSavedDraftJSON,newTrip } = useTripDraft()
  const [saveError,setSaveError]=useState<StorageError|import('@/lib/cloud-trips/contracts').CloudError|null>(null)
  const saving=useRef(false)
  const isSaved=!savedTrips.error && savedDraftJSON===JSON.stringify(draft) && savedTrips.trips.some(r=>r.draft.id===draft.id && savedTripToken(r)===recordToken)
  const [query, setQuery] = useState(""), [results, setResults] = useState<Result[]>([])
  const [searchState, setSearchState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [target, setTarget] = useState<string | null>(null)
  const [undo, setUndo] = useState<TripDraft | null>(null)
  const [routeNotice, setRouteNotice] = useState(false)
  const arcs = useMemo(() => draftGlobePreview(draft).arcs, [draft])
  const searchRef = useRef<HTMLDetailsElement>(null)
  const [searchOpen,setSearchOpen]=useState(false)
  const selectAirport = (id: string | null) => {
    setTarget(id); setInsertion("end"); changeQuery("");setSearchOpen(true)
    requestAnimationFrame(()=>{scrollEditorControl(dialog.current,searchRef.current,true);dialog.current?.querySelector<HTMLInputElement>("#trip-airport-search")?.focus({preventScroll:true})})
  }
  const structural = (next: TripDraft) => { setUndo(structuredClone(draft)); setDraft(next); setRouteNotice(true);setInsertion("end") }
  const [retry, setRetry] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  useEditorViewport(dialog,open)
  const preview = useMemo(() => previewTripDraft(draft), [draft])
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])
  useEffect(() => {
    if (!open || query.trim().length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/airports?q=${encodeURIComponent(query.trim())}&locale=${locale}`, { signal: controller.signal })
        if (!response.ok) throw new Error("Search unavailable")
        const data = await response.json()
        if (!controller.signal.aborted) { setResults(data.results); setSearchAirports(data.results.map((r: Result) => r.airport)); setSearchState("ready") }
      } catch {
        if (!controller.signal.aborted) setSearchState("error")
      }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, locale, open, retry, setSearchAirports])
  const changeQuery = (value: string) => {
    setQuery(value); setResults([]); setSearchState(value.trim().length >= 2 ? "loading" : "idle")
  }
  const selectedPosition = insertion === "end" ? draft.stops.length : Math.min(Number(insertion), draft.stops.length)
  function add(airport: CatalogAirport) {
    const stopId = crypto.randomUUID()
    setDraft(d => target ? replaceDraftStopAirport(d, target, airport) : addDraftStop(d, airport, stopId, selectedPosition))
    setTarget(null);setSearchOpen(false)
    setFocusAirport(airport); setInsertion("end"); changeQuery("")
    const previousFocus=document.activeElement
    requestAnimationFrame(()=>{
      if(document.activeElement!==previousFocus && document.activeElement!==document.body)return
      const cards=dialog.current?.querySelectorAll<HTMLElement>("[data-flight-card]")
      const focus=cards?.length?cards[cards.length-1].querySelector<HTMLButtonElement>("[data-airport-endpoint=to]"):dialog.current?.querySelector<HTMLButtonElement>("[data-first-arrival]")
      focus?.focus({preventScroll:true});scrollEditorControl(dialog.current,focus??null)
    })
  }
  const updateLeg = (id: string, key: "date" | "airline" | "flightNumber" | "notes", value: string) =>
    setDraft(d => ({ ...d, legs: d.legs.map(l => l.id === id ? { ...l, [key]: value } : l) }))
  async function save() {
    if(saving.current)return
    saving.current=true
    const captured=structuredClone(draft),fromColors={...savedMap.colors}
    try {
      if(authEnabled){
        const expected=recordToken?JSON.parse(recordToken).revision:null
        const result=await account.session.saveTrip(captured,expected)
        if(!result.ok){setSaveError(result.error);return}
        setRecordToken(savedTripToken(result.value));setSavedDraftJSON(JSON.stringify(captured));setSaveError(null)
        celebrate(result.value.draft,expected===null,fromColors)
        if(expected===null){setOpened(false);setDrawerOpen(false)}
      }else{
        const result=repository.save(captured,recordToken)
        if(!result.ok){setSaveError(result.error);return}
        setRecordToken(savedTripToken(result.record));setSavedDraftJSON(JSON.stringify(captured));setSaveError(null)
      }
      setMode('idle');setCandidate(null)
    }catch{setSaveError(authEnabled?'uncertain':'unavailable')}
    finally{saving.current=false}
  }
  return <dialog ref={dialog} aria-labelledby="trip-editor-title" onCancel={onClose}
    onKeyDown={e => {
      if (e.key === "Escape") e.stopPropagation()
      if (e.key !== "Tab") return
      e.stopPropagation()
      const controls = [...e.currentTarget.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, summary, a[href], [tabindex="0"]',
      )].filter(control => !control.matches(":disabled") && control.tabIndex>=0 && control.getClientRects().length)
      const first = controls[0], last = controls.at(-1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }}
    className={`${styles.dialog} fixed inset-0 m-0 max-h-none w-screen max-w-none overflow-hidden border-0 bg-[var(--panel)] p-0 text-[var(--ink)] backdrop:bg-[var(--scrim)] md:m-auto md:max-w-[1180px] md:rounded-2xl md:border md:border-[var(--border)]`}>
    <div className="flex h-full min-w-0 flex-col pt-[env(safe-area-inset-top)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0"><h2 id="trip-editor-title" className="text-xl font-semibold">{t("trip.editor")}</h2>
          <p className="text-sm font-semibold text-[var(--accent)]">{t(isSaved?(authEnabled?"cloud.saved":"trip.saved"):"trip.unsaved")}</p></div>
        <button className={button} onClick={onClose} aria-label={t("trip.close")}>✕</button>
      </header>
      <div data-editor-scroll className={`${styles.scrollBody} min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4`}>
        <ol className={styles.steps} aria-label={t("ticket.basic")}>{[1,2,3,4,5].map(n=><li key={n}><b>{n}</b><span>{t(`ticket.step.${n}`)}</span></li>)}</ol>
        <p className="text-sm text-[var(--ink-dim)]">{t("ticket.confirmedOnly")}</p>
        <button className={`${button} w-full`} disabled={preview.kind!=="ready"} onClick={()=>{setCandidate(null);setPreviewView(storedView);setMode("preview");setOpened(false);setDrawerOpen(false)}}>{t("trip.viewPreview")}</button>
        <button className={`${button} w-full`} onClick={() => { setOpened(false); setDrawerOpen(false); setPicking(true) }}>{t("trip.globe")}</button>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="min-w-0 space-y-1"><span>{t("trip.title")}</span><input className={field} value={draft.title}
            maxLength={200} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} /></label>
        </div>
        <details ref={searchRef} open={searchOpen} onToggle={e=>setSearchOpen(e.currentTarget.open)} className="space-y-3 rounded-xl border border-[var(--border)] p-3">
          <summary id="trip-search-title" className="min-h-8 cursor-pointer font-semibold">{t("trip.search")}{target && ` · ${t("ticket.change")}`}</summary>
          <label className="block"><span className="sr-only">{t("trip.search")}</span>
            <input id="trip-airport-search" type="search" autoComplete="off" className={field} maxLength={80}
              value={query} onChange={e => changeQuery(e.target.value)} aria-describedby="trip-search-hint" /></label>
          <p id="trip-search-hint" className="text-sm text-[var(--ink-dim)]">{t("trip.searchHint")}</p>
          {target && <button className={button} onClick={()=>{setTarget(null);setSearchOpen(false)}}>{t("trip.close")} · {t("ticket.change")}</button>}
          <div aria-live="polite" aria-busy={searchState === "loading"}>
            {searchState === "loading" && <p>{t("trip.searching")}</p>}
            {searchState === "error" && <div role="alert"><p>{t("trip.searchError")}</p><button className={button}
              onClick={() => { setSearchState("loading"); setRetry(r => r + 1) }}>{t("trip.retry")}</button></div>}
            {searchState === "ready" && !results.length && <p>{t("trip.noResults")}</p>}
          </div>
          <ul className="space-y-2">{results.map(({ hit, airport }) => <li key={hit.id} className="min-w-0 rounded-xl border border-[var(--border)] p-3">
            <p className="break-words font-semibold">{code(airport)} · {hit.name}</p>
            <p className="break-words text-sm text-[var(--ink-dim)]">{hit.city ?? t("trip.cityUnknown")} · {hit.countryName}</p>
            {hit.requiresReview && <p className="mt-1 text-sm">{t("trip.review")}</p>}
            <button className={`${button} mt-2 w-full`} disabled={hit.requiresReview} onClick={() => add(airport)}>{t("trip.add")}</button>
            <button className={`${button} mt-2 w-full`} disabled={hit.requiresReview} onClick={()=>{setFocusAirport(airport);setOpened(false);setDrawerOpen(false);setPicking(true)}}>{t("trip.locateAirport")}</button>
          </li>)}</ul>
          {results.length > 0 && <p className="text-sm text-[var(--ink-dim)]">{t("trip.limited")}</p>}
        </details>
        <div className={styles.layout}>
        <section aria-labelledby="trip-flights-title" className="min-w-0 space-y-4">
          <h3 id="trip-flights-title" className="font-semibold">{t("ticket.flights")}</h3>
          <p className="text-xs text-[var(--ink-dim)]">{t("ticket.sharedStop")}</p>
          <p className="text-xs text-[var(--ink-dim)]">{t("trip.origin")}</p>
          {!draft.legs.length && <div className={styles.ticket}>
            <button className={button} onClick={()=>selectAirport(draft.stops[0]?.id??null)}>{draft.stops[0]?`${t("ticket.from")} · ${code(draft.stops[0].airport)}`:t("ticket.chooseFrom")}</button>
            <button data-first-arrival className={button} disabled={!draft.stops.length} onClick={()=>selectAirport(null)}>{t("ticket.chooseTo")}</button>
          </div>}
          {draft.legs.map((leg,i)=><fieldset key={leg.id} className={styles.ticket} data-flight-card={i}>
            <legend className="sr-only">{t("trip.leg",{n:i+1})}</legend>
            <div className={styles.ticketHeader}><h4>{t("trip.leg",{n:i+1})}</h4><div className={styles.actions}>
              <button className={styles.iconButton} title={`${t("ticket.up")} ${i+1}`} disabled={!i} aria-label={`${t("ticket.up")} ${i+1}`} onClick={()=>{if(window.confirm(t("ticket.reorderHint")))structural(moveDraftSegment(draft,leg.id,i-1))}}>↑</button>
              <button className={styles.iconButton} title={`${t("ticket.down")} ${i+1}`} disabled={i===draft.legs.length-1} aria-label={`${t("ticket.down")} ${i+1}`} onClick={()=>{if(window.confirm(t("ticket.reorderHint")))structural(moveDraftSegment(draft,leg.id,i+1))}}>↓</button>
              <button className={styles.iconButton} title={`${t("ticket.remove")} ${i+1}`} aria-label={`${t("ticket.remove")} ${i+1}`} onClick={()=>{if(window.confirm(t("ticket.removeConfirm")))structural(removeDraftSegment(draft,leg.id))}}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" /></svg></button>
            </div></div>
            <div className={styles.endpoints}>{[i,i+1].map((index,j)=>{
              const stop=draft.stops[index], a=stop.airport
              const fullName=locale==="zh-TW"?airportChinese[a.sourceId]?.name??a.name:a.name
              const shortName=fullName.replace(/國際機場|機場|\bInternational Airport\b|\bAirport\b/gi,"").trim()||fullName
              return <button key={j} className={styles.airport} onClick={()=>selectAirport(stop.id)} data-airport-endpoint={j===0?"from":"to"}
                title={`${fullName} · ${a.city??t("trip.cityUnknown")} · ${countryDisplayName(a.sourceCountryCode,locale)}`}
                aria-label={`${t(j===0?"ticket.from":"ticket.to")} ${code(a)} · ${fullName} · ${countryDisplayName(a.sourceCountryCode,locale)}`}>
                <small>{t(j===0?"ticket.from":"ticket.to")}</small><strong>{code(a)}</strong><span>{shortName}</span>
              </button>
            })}<span className={styles.routeArrow} aria-hidden="true">→</span></div>
            <div className={styles.essentialFields}>
              <label><span>{t("trip.date")}</span><input className={`${field} ${styles.dateInput}`} type="date" value={leg.date??""} onChange={e=>updateLeg(leg.id,"date",e.target.value)} /></label>
              <label><span>{t("trip.airline")}</span><AirlineAutocomplete compact className={field} value={leg.airline??""} onChange={value=>updateLeg(leg.id,"airline",value)} /></label>
            </div>
            <label className={styles.presence}><span><i aria-hidden="true" style={{background:draft.stops[i+1].countryPresence==="transit"?"#8BB6CE":"#6F9E91"}} />{t("trip.presence")} · {code(draft.stops[i+1].airport)}</span>
              <select className={field} aria-label={`${t("trip.presence")} ${code(draft.stops[i+1].airport)}`} value={draft.stops[i+1].countryPresence} onChange={e=>setDraft(d=>({...d,stops:d.stops.map((stop,n)=>n===i+1?{...stop,countryPresence:e.target.value as Presence}:stop)}))}>
                <option value="visited">{t("trip.visited")}</option><option value="transit">{t("trip.transit")}</option>
              </select>
            </label>
            <OptionalFlightDetails leg={leg} onChange={updateLeg} />
          </fieldset>)}
          <div className={styles.routeActions}>
            <button className={button} disabled={!draft.stops.length||draft.stops.length>=100} onClick={()=>selectAirport(null)}>＋ {t("ticket.next")}</button>
            <button className={button} disabled={preview.kind!=="ready"||draft.stops.length>50||draft.stops[0]?.airport.id===draft.stops.at(-1)?.airport.id} onClick={()=>{if(window.confirm(t("ticket.returnConfirm"))){structural(appendReturnRoute(draft,()=>crypto.randomUUID()))}}}>↩ {t("ticket.return")}</button>
          </div>
          {draft.stops.length>2 && draft.stops[0].airport.id===draft.stops.at(-1)?.airport.id && draft.legs.some(l=>!l.date) && <p className="text-sm text-[var(--ink-dim)]">{t("ticket.returnDates")}</p>}
          {routeNotice && <p role="status">{t("ticket.routeAdjust")}</p>}
          {undo && <button className={button} onClick={()=>{if(window.confirm(t("trip.replaceConfirm"))){setDraft(undo);setUndo(null);setRouteNotice(false)}}}>↶ {t("ticket.undo")}</button>}
        </section>
        <aside className={styles.timeline} aria-label={t("ticket.timeline")}>
          <h3 className="font-semibold">{t("ticket.timeline")}</h3>
          {!draft.legs.length && <p>{t("ticket.emptyTimeline")}</p>}
          <ol className={styles.events}>{draft.legs.map((leg,i)=><li key={leg.id}>
            <p className="text-sm">{leg.date||t("ticket.undated")}</p>
            <strong>{code(draft.stops[i].airport)} → {code(draft.stops[i+1].airport)}</strong>
            <p className="break-words text-sm">✈ {leg.airline||t("ticket.airlineMissing")}</p>
            <p className="text-sm">{t(draft.stops[i+1].countryPresence==="transit"?"trip.transit":"trip.visited")}</p>
          </li>)}</ol>
          <h3 className="font-semibold">{t("ticket.summary")}</h3>
          <p>{t("ticket.segments",{n:draft.legs.length})} · {t("ticket.airports",{n:new Set(draft.stops.map(s=>s.airport.id)).size})}</p>
          <p>{t("ticket.distance")}: {arcs.length===draft.legs.length&&arcs.length?`${Math.round(arcs.reduce((sum,a)=>sum+a.distanceKm,0)).toLocaleString(locale)} km`:t("ticket.distanceUnavailable")}</p>
          <p className="text-xs text-[var(--ink-dim)]">{t("ticket.distanceHint")}</p>
        <details className={styles.calculations} data-flight-calculations><summary>{t("trip.preview")}</summary>
        <section aria-labelledby="trip-preview-title" className="space-y-2 rounded-xl bg-[var(--panel-2)] p-4" aria-live="polite">
          <h3 id="trip-preview-title" className="font-semibold">{t("trip.preview")}</h3>
          <p>{t("trip.counts", { flights: draft.legs.length, stops: draft.stops.length })}</p>
          <p className="text-sm text-[var(--ink-dim)]">{t("trip.scope")}</p>
          {preview.kind !== "ready" ? <p role={preview.kind === "empty" ? undefined : "alert"}>{t(`trip.${preview.kind}`)}</p> : <>
            <p>{t("trip.totals", preview.footprint.countryTotals)}</p>
            <p>{t("trip.airportTotals", preview.footprint.airportTotals)}</p>
            <p className="text-sm">{t(draft.status === "completed" ? "trip.completedHint" : "trip.notCompleted")}</p>
            <ul className="space-y-1">{preview.footprint.countries.map(c => <li key={c.countryCode} className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden="true" />
              <span>{countryDisplayName(c.countryCode, locale)} · {t(c.presence === "visited" ? "trip.visited" : "trip.transit")}</span>
            </li>)}</ul>
          </>}
        </section></details>
        </aside></div>
        <button className={`${button} w-full`} onClick={() => {
          if (window.confirm(t("trip.clearConfirm"))) { newTrip();changeQuery("");setSaveError(null) }
        }}>{t("trip.clear")}</button>
      </div>
      <footer data-editor-footer className={`${styles.footer} shrink-0 space-y-2 border-t border-[var(--border)] bg-[var(--panel)] px-4 pt-3`} aria-live="polite">
        {(saveError || savedTrips.error) && <p role="alert" className="text-sm">{t(`${authEnabled?"cloud.error":"trip.storage"}.${saveError??savedTrips.error}`)}</p>}
        {authEnabled && <p className="text-sm" role="status">{t(!account.snapshot.userId?"cloud.loginRequired":account.snapshot.busy?"cloud.syncing":"cloud.accountOnly")}</p>}
        {isSaved && <p className="text-sm">{t(authEnabled?"cloud.saved":"trip.saved")}</p>}
        <button className={`${button} w-full bg-[var(--accent)] font-semibold text-[var(--accent-ink)]`} disabled={preview.kind!=="ready" || !savedTrips.ready || savedTrips.busy || isSaved || (authEnabled?!!savedTrips.error && !["uncertain","network","conflict"].includes(savedTrips.error):!!savedTrips.error)} onClick={()=>void save()}>{t("trip.save")}</button>
        {savedTrips.error && <button className={`${button} w-full`} onClick={()=>{if(authEnabled)void account.reload();else repository.reload();setSaveError(null)}}>{t("trip.retry")}</button>}
      </footer>
    </div>
  </dialog>
}
