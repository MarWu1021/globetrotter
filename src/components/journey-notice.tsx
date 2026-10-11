'use client'
import {useTripDraft} from './trip-draft-provider'
import {useT} from '@/lib/i18n'
export default function JourneyNotice(){const {savedNotice,journey,skipJourney,setSavedNotice}=useTripDraft(),t=useT()
 if(!savedNotice)return null
 return <div data-journey-notice role="status" className="glass-card transition-none absolute left-3 right-3 top-[calc(160px+env(safe-area-inset-top))] z-30 md:top-20 flex flex-wrap items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm md:left-1/2 md:right-auto md:w-[360px] md:-translate-x-1/2">
  <span>{t('journey.saved')}</span>
  {journey&&<button data-skip-journey className="min-h-11 transition-none rounded-lg border border-[var(--border)] px-3" onClick={skipJourney}>{t('journey.skip')}</button>}
  <button aria-label={t('close')} className="min-h-11 min-w-11" onClick={()=>{skipJourney();setSavedNotice(false)}}>✕</button>
 </div>
}
