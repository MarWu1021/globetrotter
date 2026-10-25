"use client"
import {useEffect,useId,useMemo,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {useAirlineMenu} from './use-airline-menu'
import {searchAirlines,airlineValue,type Airline} from '@/lib/airlines/catalog'
import {useT} from '@/lib/i18n'
import {useTravelStore} from '@/lib/store'
export default function AirlineAutocomplete({value,onChange,className,compact=false}:{value:string;onChange:(value:string)=>void;className:string;compact?:boolean}){
 const id=useId(),t=useT(),locale=useTravelStore(s=>s.locale)
 const [open,setOpen]=useState(false),[active,setActive]=useState(-1)
 const input=useRef<HTMLInputElement>(null),list=useRef<HTMLUListElement>(null)
 const results=useMemo(()=>searchAirlines(value),[value])
 const layout=useAirlineMenu(input,list,open&&results.length>0,results.map(a=>a.iata).join(','))
 useEffect(()=>{
  const option=list.current?.children[active] as HTMLElement|undefined,menu=list.current
  if(!option||!menu||!layout?.ready)return
  const box=option.getBoundingClientRect(),bounds=menu.getBoundingClientRect()
  if(box.top<bounds.top)menu.scrollTop-=bounds.top-box.top
  else if(box.bottom>bounds.bottom)menu.scrollTop+=box.bottom-bounds.bottom
 },[active,layout])
 function choose(airline:Airline){onChange(airlineValue(airline));setOpen(false);setActive(-1)}
 return <div className="relative min-w-0" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node)&&!list.current?.contains(e.relatedTarget as Node))setOpen(false)}}>
   <input ref={input} title={value||undefined} role="combobox" aria-label={t('trip.airline')} aria-expanded={open&&!!layout?.ready&&!!layout.position} aria-autocomplete="list" aria-describedby={`${id}-hint`} aria-controls={`${id}-list`} aria-activedescendant={open&&!!layout?.ready&&!!layout.position&&active>=0?`${id}-${active}`:undefined}
     value={value} maxLength={200} autoComplete="off" className={className} placeholder={t('airline.hint')}
     onFocus={()=>setOpen(true)} onChange={e=>{onChange(e.target.value);setActive(-1);setOpen(true)}}
     onKeyDown={e=>{
       if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false)}
       if(e.key==='ArrowDown'&&results.length){e.preventDefault();e.stopPropagation();setOpen(true);setActive(i=>Math.min(i+1,results.length-1))}
       if(e.key==='ArrowUp'&&results.length){e.preventDefault();e.stopPropagation();setActive(i=>Math.max(0,i-1))}
       if(e.key==='Enter'&&open&&active>=0&&results[active]){e.preventDefault();e.stopPropagation();choose(results[active])}
     }}/>
   {open&&results.length>0&&layout&&createPortal(<ul ref={list} role="listbox" id={`${id}-list`} aria-label={t('airline.results')} data-airline-menu data-side={layout.position?.side}
     style={{position:'fixed',left:layout.position?.left??0,top:layout.position?.top??0,width:layout.position?.width??280,maxHeight:layout.position?.maxHeight??256,visibility:layout.ready&&layout.position?'visible':'hidden',overscrollBehavior:'contain'}}
     className="z-50 overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-[var(--panel)] shadow-lg">
     {results.map((a,i)=><li key={a.iata} role="option" id={`${id}-${i}`} aria-selected={i===active}>
       <button type="button" tabIndex={-1} className={`min-h-11 w-full break-words px-3 py-2 text-left text-sm ${i===active?'bg-[var(--panel-2)]':''}`} onPointerDown={e=>e.preventDefault()} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(a)}>
         <span className="font-semibold">{a.iata} · {locale==='zh-TW'?a.zhTW:a.name}</span>{locale==='zh-TW'&&<span className="block text-[var(--ink-dim)]">{a.name}</span>}
       </button>
     </li>)}
   </ul>,layout.host)}
   <p id={`${id}-hint`} className={compact?"sr-only":"mt-1 text-xs text-[var(--ink-dim)]"}>{t('airline.optional')}</p>
 </div>
}
