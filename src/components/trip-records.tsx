"use client"
import { useEffect, useRef, useState } from "react"
import { useTripDraft } from "./trip-draft-provider"
import { useT } from "@/lib/i18n"
import { useTravelStore } from "@/lib/store"
import { countryDisplayName } from "@/lib/airport-data/countries"
import { airportChinese } from "@/lib/airport-data/localization"
import { previewTripDraft } from "@/lib/trip-draft/core"
import { savedTripToken, type StorageError } from "@/lib/trip-storage/core"

const button="min-h-11 rounded-lg border border-[var(--border)] px-3 py-2"
export default function TripRecords({onClose}:{onClose:()=>void}) {
  const {savedTrips,repository,loadSaved,draft,savedDraftJSON,setRecordToken,setSavedDraftJSON,setMode}=useTripDraft()
  const t=useT(),locale=useTravelStore(s=>s.locale)
  const dialog=useRef<HTMLDialogElement>(null)
  const [selected,setSelected]=useState<string|null>(null),[error,setError]=useState<StorageError|null>(null)
  useEffect(()=>{dialog.current?.showModal()},[])
  const records=[...savedTrips.trips].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
  const record=records.find(r=>r.draft.id===selected)
  const details=record && previewTripDraft(record.draft)
  return <dialog ref={dialog} aria-labelledby="trip-records-title" onCancel={onClose}
    onKeyDown={e=>{
      if(e.key==='Escape'){e.stopPropagation();return}
      if(e.key!=='Tab')return
      e.stopPropagation()
      const controls=[...e.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex="0"]')].filter(c=>!c.matches(':disabled')&&c.getClientRects().length)
      const first=controls[0],last=controls.at(-1)
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
    }}
    className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-[var(--panel)] p-0 text-[var(--ink)] backdrop:bg-[var(--scrim)] md:m-auto md:h-[90dvh] md:max-w-3xl md:rounded-2xl">
    <div className="flex h-full min-w-0 flex-col pt-[env(safe-area-inset-top)]">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] p-4">
        <h2 id="trip-records-title" className="text-xl font-semibold">{t("trip.records")}</h2>
        <button className={button} aria-label={t("trip.closeRecords")} onClick={onClose}>✕</button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <p>{t("trip.localOnly")}</p><p className="text-sm">{t("trip.mapsLater")}</p>
        {(error||savedTrips.error) && <div role="alert"><p>{t(`trip.storage.${error??savedTrips.error}`)}</p><button className={button} onClick={()=>{repository.reload();setError(null)}}>{t("trip.retry")}</button></div>}
        {savedTrips.ready && !records.length && !savedTrips.error && <p>{t("trip.noTrips")}</p>}
        <ul className="space-y-3">{records.map(r=><li key={r.draft.id} className="space-y-2 rounded-xl border border-[var(--border)] p-3">
          <h3 className="break-words font-semibold">{r.draft.title||t("trip.untitled")}</h3>
          <p className="break-words">{r.draft.stops.map(s=>s.airport.iata??s.airport.icao??s.airport.ident).join(' → ')}</p>
          <p className="text-sm">{t("trip.counts",{flights:r.draft.legs.length,stops:r.draft.stops.length})}</p>
          <div className="flex flex-wrap gap-2">
            <button className={button} onClick={()=>setSelected(r.draft.id)}>{t("trip.view")}</button>
            <button className={button} disabled={!!savedTrips.error} onClick={()=>{
              if(draft.stops.length && savedDraftJSON!==JSON.stringify(draft) && !window.confirm(t("trip.replaceConfirm")))return
              loadSaved(r)
            }}>{t("trip.edit")}</button>
            <button className={button} disabled={!!savedTrips.error} onClick={()=>{
              if(!window.confirm(t("trip.deleteConfirm")))return
              const result=repository.remove(r.draft.id,savedTripToken(r)!)
              if(!result.ok){setError(result.error);return}
              setError(null);if(selected===r.draft.id)setSelected(null)
              // Keep any open editing copy, but detach it from the deleted stored record.
              if(draft.id===r.draft.id){setRecordToken(null);setSavedDraftJSON(null);setMode('idle')}
            }}>{t("trip.delete")}</button>
          </div>
        </li>)}</ul>
        {record && <section aria-label={t("trip.details")} className="space-y-3 rounded-xl bg-[var(--panel-2)] p-4">
          <h3 className="break-words font-semibold">{record.draft.title||t("trip.untitled")}</h3>
          <ol className="space-y-2">{record.draft.stops.map((s,i)=><li key={s.id} className="break-words">{i+1}. {s.airport.iata??s.airport.icao??s.airport.ident} · {locale==='zh-TW'?airportChinese[s.airport.sourceId]?.name??s.airport.name:s.airport.name} · {countryDisplayName(s.airport.sourceCountryCode,locale)} · {t(i===0||s.countryPresence==='visited'?'trip.visited':'trip.transit')}</li>)}</ol>
          {record.draft.legs.map((l,i)=><div key={l.id} className="space-y-1 border-t border-[var(--border)] pt-2">
            <p>{t("trip.leg",{n:i+1})}</p>
            {(['date','airline','flightNumber','notes'] as const).map(k=><p key={k} className="whitespace-pre-wrap break-words">{t(`trip.${k==='flightNumber'?'number':k}`)}: {l[k]||'—'}</p>)}
          </div>)}
          {details?.kind==='ready' && <p>{t("trip.totals",details.footprint.countryTotals)}</p>}
        </section>}
      </div>
    </div>
  </dialog>
}
