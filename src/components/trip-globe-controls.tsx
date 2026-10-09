"use client"
import { useTripDraft } from './trip-draft-provider'
import { useT } from '@/lib/i18n'
import { useTravelStore } from '@/lib/store'
import { countryDisplayName } from '@/lib/airport-data/countries'
import { airportChinese } from '@/lib/airport-data/localization'
import { addDraftStop, previewTripDraft } from '@/lib/trip-draft/core'
const button='min-h-11 rounded-lg border border-[var(--border)] px-3 py-2'
export default function TripGlobeControls() {
  const {draft,setDraft,setOpened,setPicking,candidate,setCandidate,insertion,setInsertion}=useTripDraft()
  const t=useT(),locale=useTravelStore(s=>s.locale)
  const preview=previewTripDraft(draft)
  return <section aria-label={t('trip.globe')} className="absolute inset-x-3 bottom-[calc(78px+env(safe-area-inset-bottom))] z-20 mx-auto max-w-lg space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 text-[var(--ink)] shadow-xl md:bottom-4">
    <p className="font-semibold">{t('trip.unsaved')}</p>
    <p className="text-sm">{t('trip.globeHint')}</p>
    {candidate && <div className="space-y-2 border-t border-[var(--border)] pt-2" data-testid="airport-confirmation">
      <p className="break-words font-semibold">{candidate.iata??candidate.icao??candidate.ident} · {locale==='zh-TW'?airportChinese[candidate.sourceId]?.name??candidate.name:candidate.name}</p>
      <p className="text-sm">{locale==='zh-TW'?airportChinese[candidate.sourceId]?.city??candidate.city??t("trip.cityUnknown"):candidate.city??t("trip.cityUnknown")} · {countryDisplayName(candidate.sourceCountryCode,locale)}</p>
      <div className="flex flex-wrap gap-2"><button className={button} onClick={()=>{
        const id=crypto.randomUUID(),position=insertion==='end'?draft.stops.length:Math.min(Number(insertion),draft.stops.length)
        setDraft(d=>addDraftStop(d,candidate,id,position));setInsertion('end');setCandidate(null)
      }}>{t('trip.confirmAirport')}</button><button className={button} onClick={()=>setCandidate(null)}>{t('trip.cancelAirport')}</button></div>
    </div>}
    <p className="text-sm">{t('trip.counts',{flights:draft.legs.length,stops:draft.stops.length})}</p>
    <p className="text-xs text-[var(--ink-dim)]">{t('trip.schematic')}</p>
    {preview.kind!=='ready' && <p className="text-sm" role="status">{t(`trip.${preview.kind}`)}</p>}
    <div className="flex flex-wrap gap-2"><button className={button} onClick={()=>{setPicking(false);setOpened(true);setCandidate(null)}}>{t('trip.returnEditor')}</button>
      <button className={button} onClick={()=>{setPicking(false);setCandidate(null)}}>{t('trip.exitPreview')}</button></div>
  </section>
}
