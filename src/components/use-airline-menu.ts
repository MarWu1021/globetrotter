"use client"
import {useEffect,useState,type RefObject} from 'react'
import {placeAirlineMenu,type AirlineMenuPosition} from '@/lib/airlines/placement'
interface Layout {key:string;host:Element;position:AirlineMenuPosition|null;ready:boolean}
export function useAirlineMenu(input:RefObject<HTMLInputElement|null>,list:RefObject<HTMLUListElement|null>,enabled:boolean,contentKey:string){
 const [layout,setLayout]=useState<Layout|null>(null)
 const host=enabled?layout?.host:null
 useEffect(()=>{
  const field=input.current
  if(!enabled||!field)return
  const dialog=field.closest('dialog'),portal=dialog??document.body
  const scroller=field.closest<HTMLElement>('[data-editor-scroll]')
  const footer=dialog?.querySelector<HTMLElement>('[data-editor-footer]')
  const viewport=window.visualViewport
  let frame=0
  const update=()=>{
   cancelAnimationFrame(frame)
   frame=requestAnimationFrame(()=>{
    if(dialog&&!dialog.open){setLayout(null);return}
    const vLeft=viewport?.offsetLeft??0,vTop=viewport?.offsetTop??0
    const area=scroller?.getBoundingClientRect()??dialog?.getBoundingClientRect()
    const bounds={left:Math.max(vLeft,area?.left??0)+6,top:Math.max(vTop,area?.top??0)+6,
     right:Math.min(vLeft+(viewport?.width??window.innerWidth),area?.right??window.innerWidth)-6,
     bottom:Math.min(vTop+(viewport?.height??window.innerHeight),area?.bottom??window.innerHeight,footer?.getBoundingClientRect().top??Infinity)-6}
    const position=placeAirlineMenu(field.getBoundingClientRect(),bounds,list.current?.scrollHeight??256)
    const next={key:contentKey,host:portal,position,ready:!!list.current}
    setLayout(old=>old?.key===next.key&&old.host===next.host&&old.ready===next.ready&&JSON.stringify(old.position)===JSON.stringify(next.position)?old:next)
   })
  }
  const observer=new ResizeObserver(update)
  for(const element of [field,scroller,footer,dialog,list.current])if(element)observer.observe(element)
  window.addEventListener('resize',update)
  window.addEventListener('scroll',update,true)
  viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update)
  update()
  return ()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update)}
 },[enabled,contentKey,host,input,list])
 return enabled&&layout?{...layout,ready:layout.ready&&layout.key===contentKey}:null
}
