'use client'
import {useState} from 'react'
import {useTripDraft} from './trip-draft-provider'
import {useTravelStore,type Locale} from '@/lib/store'
import {LOCALES,useT} from '@/lib/i18n'
import {AuthControls} from './auth-provider'
import {TravelTile} from './travel-illustration'
import ui from './world-ui.module.css'
import FlightMileageCard from './flight-mileage-card'
import PwaInstall from './pwa-install'
export default function MobileNavigation(){
 const t=useT(),session=useTripDraft(),locale=useTravelStore(s=>s.locale),setLocale=useTravelStore(s=>s.setLocale),cycleTheme=useTravelStore(s=>s.cycleTheme)
 const [panel,setPanel]=useState<'stats'|'settings'|null>(null)
 const close=()=>setPanel(null)
 const resume=()=>{useTravelStore.getState().select(null);session.skipJourney();session.setMode('idle');session.setOpened(false);session.setRecordsOpen(false);session.setDrawerOpen(false);close()}
 const items=[['globe','◎'],['records','≡'],['add','＋'],['stats','▥'],['settings','⚙']] as const
 const go=(id:typeof items[number][0])=>{
  resume()
  if(id==='globe')useTravelStore.getState().setView('globe')
  if(id==='records')session.setRecordsOpen(true)
  if(id==='add'){if(!session.draft.stops.length||session.savedDraftJSON===JSON.stringify(session.draft))session.newTrip();else{session.setStarted(true);session.setOpened(true)}}
  if(id==='stats'||id==='settings')setPanel(id)
 }
 // Editors own the entire safe-area footer; no navigation over their controls.
 if(session.opened||session.recordsOpen||session.previewActive||session.drawerOpen)return null
 return <>
  {panel&&<div className="fixed inset-0 z-40 flex items-end bg-[var(--scrim)] md:hidden" onClick={close}>
   <section role="dialog" aria-modal="true" aria-label={t(`nav.${panel}`)} className="glass-card w-full max-h-[70dvh] overflow-y-auto rounded-t-3xl p-5 pb-[calc(24px+env(safe-area-inset-bottom))]" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const controls=[...e.currentTarget.querySelectorAll<HTMLElement>('button,select,input,a[href],summary')].filter(n=>!n.matches(':disabled')&&n.getClientRects().length>0);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}}>
    <header className="flex items-center justify-between"><h2 className="font-semibold">{t(`nav.${panel}`)}</h2><button autoFocus onClick={close} className="min-h-11 min-w-11" aria-label={t('close')}>✕</button></header>
    {panel==='stats'?<div className="space-y-4 py-4"><FlightMileageCard /><dl data-mobile-statistics className="grid grid-cols-2 gap-3">{[['stat.visited',session.savedMap.countryCount],['stat.trips',session.savedMap.tripCount],['stat.flights',session.savedMap.flightCount],['stat.world',Math.min(100,Math.round(session.savedMap.countryCount/195*100))+'%']].map(([label,value])=><div key={label} className="rounded-xl bg-[var(--panel-2)] p-3"><dt className="text-sm text-[var(--ink-dim)]">{t(String(label))}</dt><dd className="text-2xl font-semibold">{value}</dd></div>)}</dl></div>:<div className="space-y-4 py-4">
     <label className="block">{t('language')}<select aria-label={t('language')} value={locale} onChange={e=>setLocale(e.target.value as Locale)} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3">{LOCALES.map(l=><option key={l.id} value={l.id}>{l.flag} {l.label}</option>)}</select></label>
     <button className="min-h-11 w-full rounded-xl border border-[var(--border)]" onClick={cycleTheme}>{t('theme.toggle')}</button><AuthControls/><PwaInstall/>
    </div>}
   </section>
  </div>}
  <nav data-mobile-navigation aria-label={t('nav.label')} className={`${ui.navigation} glass-card fixed inset-x-3 bottom-[calc(8px+env(safe-area-inset-bottom))] z-30 grid grid-cols-5 gap-1 rounded-2xl p-1.5 md:hidden`}>
   {items.map(([id])=><button key={id} aria-label={t(`nav.go.${id}`)} onClick={()=>go(id)} className={`flex min-h-12 min-w-0 flex-col items-center justify-center rounded-xl px-0.5 py-1 text-[10px] leading-tight ${id==='add'?'bg-[var(--accent)] text-[var(--accent-ink)]':'text-[var(--ink)]'}`}><TravelTile kind={id}/><span className="max-w-full break-words">{t(`nav.${id}`)}</span></button>)}
  </nav>
 </>
}
