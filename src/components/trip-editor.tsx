"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTripDraft } from "./trip-draft-provider"
import { useT } from "@/lib/i18n"
import { useTravelStore } from "@/lib/store"
import { countryDisplayName } from "@/lib/airport-data/countries"
import { airportChinese } from "@/lib/airport-data/localization"
import type { AirportSearchHit, CatalogAirport } from "@/lib/airport-data/types"
import type { Presence, TripStatus } from "@/lib/travel-core/models"
import { addDraftStop, createTripDraft, moveDraftStop, previewTripDraft, removeDraftStop } from "@/lib/trip-draft/core"

type Result = { hit: AirportSearchHit; airport: CatalogAirport }
const field = "min-h-11 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-base text-[var(--ink)]"
const button = "min-h-11 min-w-11 rounded-lg border border-[var(--border)] px-3 py-2 disabled:opacity-40"
const code = (a: CatalogAirport) => a.iata ?? a.icao ?? a.ident

export default function TripEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT(), locale = useTravelStore(s => s.locale)
  const { draft, setDraft, insertion, setInsertion, setOpened, setPicking, setDrawerOpen, setSearchAirports, setFocusAirport } = useTripDraft()
  const [query, setQuery] = useState(""), [results, setResults] = useState<Result[]>([])
  const [searchState, setSearchState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [retry, setRetry] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
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
    setDraft(d => addDraftStop(d, airport, stopId, selectedPosition))
    setFocusAirport(airport); setInsertion("end"); changeQuery("")
    dialog.current?.querySelector<HTMLInputElement>("#trip-airport-search")?.focus()
  }
  const updateLeg = (id: string, key: "date" | "airline" | "flightNumber" | "notes", value: string) =>
    setDraft(d => ({ ...d, legs: d.legs.map(l => l.id === id ? { ...l, [key]: value } : l) }))
  return <dialog ref={dialog} aria-labelledby="trip-editor-title" onCancel={onClose}
    onKeyDown={e => {
      if (e.key === "Escape") e.stopPropagation()
      if (e.key !== "Tab") return
      e.stopPropagation()
      const controls = [...e.currentTarget.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex="0"]',
      )].filter(control => !control.matches(":disabled") && control.getClientRects().length)
      const first = controls[0], last = controls.at(-1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }}
    className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-[var(--panel)] p-0 text-[var(--ink)] backdrop:bg-black/60 md:m-auto md:h-[90dvh] md:max-w-3xl md:rounded-2xl md:border md:border-[var(--border)]">
    <div className="flex h-full min-w-0 flex-col pt-[env(safe-area-inset-top)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0"><h2 id="trip-editor-title" className="text-xl font-semibold">{t("trip.editor")}</h2>
          <p className="text-sm font-semibold text-[var(--accent)]">{t("trip.unsaved")}</p></div>
        <button className={button} onClick={onClose} aria-label={t("trip.close")}>✕</button>
      </header>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
        <p className="text-sm text-[var(--ink-dim)]">{t("trip.temporary")}</p>
        <button className={`${button} w-full`} onClick={() => { setOpened(false); setDrawerOpen(false); setPicking(true) }}>{t("trip.globe")}</button>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="min-w-0 space-y-1"><span>{t("trip.title")}</span><input className={field} value={draft.title}
            maxLength={200} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} /></label>
          <label className="min-w-0 space-y-1"><span>{t("trip.status")}</span><select className={field} value={draft.status} aria-label={t("trip.status")}
            onChange={e => setDraft(d => ({ ...d, status: e.target.value as TripStatus }))}>
            {(["draft", "planned", "in_progress", "completed"] as const).map(s => <option key={s} value={s}>{t(`trip.${s}`)}</option>)}
          </select></label>
        </div>
        <section aria-labelledby="trip-search-title" className="space-y-3">
          <h3 id="trip-search-title" className="font-semibold">{t("trip.search")}</h3>
          <label className="block"><span className="sr-only">{t("trip.search")}</span>
            <input id="trip-airport-search" type="search" autoComplete="off" className={field} maxLength={80}
              value={query} onChange={e => changeQuery(e.target.value)} aria-describedby="trip-search-hint" /></label>
          <p id="trip-search-hint" className="text-sm text-[var(--ink-dim)]">{t("trip.searchHint")}</p>
          <label className="block space-y-1"><span>{t("trip.insert")}</span><select className={field} value={insertion} aria-label={t("trip.insert")}
            onChange={e => setInsertion(e.target.value)}>
            <option value="end">{t("trip.end")}</option>
            {draft.stops.map((s, i) => <option key={s.id} value={i}>{t("trip.position", { n: i + 1 })} · {code(s.airport)}</option>)}
          </select></label>
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
        </section>
        <section aria-labelledby="trip-route-title" className="space-y-3">
          <h3 id="trip-route-title" className="font-semibold">{t("trip.route")}</h3>
          <p className="text-sm text-[var(--ink-dim)]">{t("trip.routeHint")}</p>
          <p className="text-sm text-[var(--ink-dim)]">{t("trip.detailsWarning")}</p>
          <ol className="space-y-3">{draft.stops.map((s, i) => <li key={s.id} className="min-w-0 space-y-2 rounded-xl border border-[var(--border)] p-3">
            <p className="break-words font-semibold">{i + 1}. {code(s.airport)} · {locale === "zh-TW" ? airportChinese[s.airport.sourceId]?.name ?? s.airport.name : s.airport.name}</p>
            <p className="text-sm">{countryDisplayName(s.airport.sourceCountryCode, locale)}</p>
            <div className="flex flex-wrap gap-2">
              <button className={button} disabled={i === 0} aria-label={`${t("trip.up")} ${code(s.airport)}`} onClick={() => setDraft(d => moveDraftStop(d,s.id,i-1))}>↑</button>
              <button className={button} disabled={i === draft.stops.length - 1} aria-label={`${t("trip.down")} ${code(s.airport)}`} onClick={() => setDraft(d => moveDraftStop(d,s.id,i+1))}>↓</button>
              <button className={button} aria-label={`${t("trip.remove")} ${code(s.airport)}`} onClick={() => { setDraft(d => removeDraftStop(d,s.id)); setInsertion("end") }}>{t("trip.remove")}</button>
            </div>
            {i === 0 ? <p className="text-sm">{t("trip.origin")}</p> : <label className="block space-y-1"><span>{t("trip.presence")}</span>
              <select className={field} value={s.countryPresence} aria-label={`${t("trip.presence")} ${code(s.airport)}`}
                onChange={e => setDraft(d => ({ ...d, stops: d.stops.map(stop => stop.id === s.id ? { ...stop, countryPresence: e.target.value as Presence } : stop) }))}>
                <option value="visited">{t("trip.visited")}</option><option value="transit">{t("trip.transit")}</option>
              </select></label>}
          </li>)}</ol>
        </section>
        {draft.legs.length > 0 && <section aria-labelledby="trip-flights-title" className="space-y-3">
          <h3 id="trip-flights-title" className="font-semibold">{t("trip.flights")}</h3>
          {draft.legs.map((leg, i) => <fieldset key={leg.id} className="min-w-0 space-y-3 rounded-xl border border-[var(--border)] p-3">
            <legend className="break-words px-1 font-semibold">{t("trip.leg", { n: i+1 })}: {code(draft.stops[i].airport)} → {code(draft.stops[i+1].airport)}</legend>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {([['date','date'],['airline','airline'],['number','flightNumber'],['notes','notes']] as const).map(([label,key]) =>
                <label key={key} className="min-w-0 space-y-1"><span>{t(`trip.${label}`)}</span>
                  {key === 'notes' ? <textarea className={field} maxLength={2000} rows={2} value={leg[key] ?? ""} onChange={e => updateLeg(leg.id,key,e.target.value)} />
                    : <input className={field} type={key === 'date' ? 'date' : 'text'} maxLength={key === 'date' ? undefined : 200}
                      value={leg[key] ?? ""} onChange={e => updateLeg(leg.id,key,e.target.value)} />}
                </label>)}
            </div>
          </fieldset>)}
        </section>}
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
        </section>
        <button className={`${button} w-full`} onClick={() => {
          if (window.confirm(t("trip.clearConfirm"))) { setDraft(createTripDraft(crypto.randomUUID())); setInsertion("end"); changeQuery("") }
        }}>{t("trip.clear")}</button>
      </div>
    </div>
  </dialog>
}
