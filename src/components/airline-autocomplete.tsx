"use client"
import {useId,useMemo,useState} from 'react'
import {searchAirlines,airlineValue,type Airline} from '@/lib/airlines/catalog'
import {useT} from '@/lib/i18n'
import {useTravelStore} from '@/lib/store'
export default function AirlineAutocomplete({value,onChange,className}:{value:string;onChange:(value:string)=>void;className:string}){
 const id=useId(),t=useT(),locale=useTravelStore(s=>s.locale)
 const [open,setOpen]=useState(false),[active,setActive]=useState(-1)
 const results=useMemo(()=>searchAirlines(value),[value])
 function choose(airline:Airline){onChange(airlineValue(airline));setOpen(false);setActive(-1)}
 return <div className="relative min-w-0" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false)}}>
   <input role="combobox" aria-label={t('trip.airline')} aria-expanded={open&&results.length>0} aria-autocomplete="list" aria-controls={`${id}-list`} aria-activedescendant={open&&active>=0?`${id}-${active}`:undefined}
     value={value} maxLength={200} autoComplete="off" className={className} placeholder={t('airline.hint')}
     onFocus={()=>setOpen(true)} onChange={e=>{onChange(e.target.value);setActive(-1);setOpen(true)}}
     onKeyDown={e=>{
       if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false)}
       if(e.key==='ArrowDown'&&results.length){e.preventDefault();setOpen(true);setActive(i=>Math.min(i+1,results.length-1))}
       if(e.key==='ArrowUp'&&results.length){e.preventDefault();setActive(i=>Math.max(0,i-1))}
       if(e.key==='Enter'&&open&&active>=0&&results[active]){e.preventDefault();choose(results[active])}
     }}/>
   {open&&results.length>0&&<ul role="listbox" id={`${id}-list`} aria-label={t('airline.results')} className="absolute inset-x-0 top-full z-40 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-[var(--panel)] shadow-lg">
     {results.map((a,i)=><li key={a.iata} role="option" id={`${id}-${i}`} aria-selected={i===active}>
       <button type="button" className={`min-h-11 w-full break-words px-3 py-2 text-left text-sm ${i===active?'bg-[var(--panel-2)]':''}`} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(a)}>
         <span className="font-semibold">{a.iata} · {locale==='zh-TW'?a.zhTW:a.name}</span>{locale==='zh-TW'&&<span className="block text-[var(--ink-dim)]">{a.name}</span>}
       </button>
     </li>)}
   </ul>}
   <p className="mt-1 text-xs text-[var(--ink-dim)]">{t('airline.optional')}</p>
 </div>
}
