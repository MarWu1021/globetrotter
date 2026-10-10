"use client"
import { useTripDraft } from './trip-draft-provider'
import { useT } from '@/lib/i18n'
import { useTravelStore } from '@/lib/store'
import { countryDisplayName } from '@/lib/airport-data/countries'
import { airportChinese } from '@/lib/airport-data/localization'
import { addDraftStop, previewTripDraft } from '@/lib/trip-draft/core'
import { savedTripToken } from '@/lib/trip-storage/core'
const button='min-h-11 rounded-lg border border-[var(--border)] px-3 py-2'
export default function TripGlobeControls() {
  const {draft,setDraft,setOpened,setPicking,candidate,setCandidate,insertion,setInsertion,picking,previewView,setFocusAirport,savedDraftJSON,savedTrips,recordToken}=useTripDraft()
  const t=useT(),locale=useTravelStore(s=>s.locale)
  const preview=previewTripDraft(draft)
  const isSaved=!savedTrips.error && savedDraftJSON===JSON.stringify(draft)&&savedTrips.trips.some(r=>r.draft.id===draft.id&&savedTripToken(r)===recordToken)
  return <section aria-label={t(picking?'trip.globe':'trip.viewPreview')} className={`${picking ? "absolute inset-x-3 bottom-[calc(78px+env(safe-area-inset-bottom))] mx-auto md:bottom-4" : "relative mx-3 mb-3 shrink-0 md:absolute md:right-3 md:bottom-4 md:mx-0 md:mb-0 md:w-64"} z-20 max-w-lg space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 text-[var(--ink)] shadow-xl`}>
    <p className="font-semibold">{t(isSaved?'trip.saved':'trip.unsaved')}</p>
    <p className="text-sm">{t(picking?'trip.globeHint':'trip.viewPreviewHint')}</p>
    {picking && candidate && <div className="space-y-2 border-t border-[var(--border)] pt-2" data-testid="airport-confirmation">
      <p className="break-words font-semibold">{candidate.iata??candidate.icao??candidate.ident} · {locale==='zh-TW'?airportChinese[candidate.sourceId]?.name??candidate.name:candidate.name}</p>
      <p className="text-sm">{locale==='zh-TW'?airportChinese[candidate.sourceId]?.city??candidate.city??t("trip.cityUnknown"):candidate.city??t("trip.cityUnknown")} · {countryDisplayName(candidate.sourceCountryCode,locale)}</p>
      <div className="flex flex-wrap gap-2"><button className={button} onClick={()=>{
        const id=crypto.randomUUID(),position=insertion==='end'?draft.stops.length:Math.min(Number(insertion),draft.stops.length)
        setDraft(d=>addDraftStop(d,candidate,id,position));setInsertion('end');setCandidate(null)
      }}>{t('trip.confirmAirport')}</button><button className={button} onClick={()=>setCandidate(null)}>{t('trip.cancelAirport')}</button></div>
    </div>}
    <p className="text-sm">{t('trip.counts',{flights:draft.legs.length,stops:draft.stops.length})}</p>
    {!picking && previewView === 'globe' && preview.kind === 'ready' && <div className="flex flex-wrap gap-2">
      {preview.footprint.countries.map(country => <button key={country.countryCode} className={button}
        aria-label={`${t('trip.viewPreview')} · ${countryDisplayName(country.countryCode,locale)}`}
        onClick={()=>{const stop=draft.stops.find(s=>s.airport.isoCountryCode===country.countryCode);if(stop)setFocusAirport(structuredClone(stop.airport))}}>
        <span className="mr-1 inline-block h-3 w-3 rounded-full" style={{background:country.color}} aria-hidden="true" />
        {countryDisplayName(country.countryCode,locale)}<span className="hidden md:inline"> · {t(country.presence==='visited'?'trip.visited':'trip.transit')}</span>
      </button>)}
    </div>}
    <p className="text-xs text-[var(--ink-dim)]">{t('trip.schematic')}</p>
    {preview.kind!=='ready' && <p className="text-sm" role="status">{t(`trip.${preview.kind}`)}</p>}
    <div className="flex flex-wrap gap-2"><button className={button} onClick={()=>{setPicking(false);setOpened(true);setCandidate(null)}}>{t('trip.returnEditor')}</button>
      <button className={button} onClick={()=>{setPicking(false);setCandidate(null)}}>{t('trip.exitPreview')}</button></div>
  </section>
}
