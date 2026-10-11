'use client'
import {useEffect,useState} from 'react'
export function useMotionPolicy() {
  const [policy,setPolicy]=useState({reduced:true,hidden:true,lowPower:true})
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)')
    const n=navigator as Navigator & {deviceMemory?:number;connection?:{saveData?:boolean}}
    const update=()=>setPolicy({reduced:media.matches,hidden:document.hidden,lowPower:!!n.connection?.saveData || (n.deviceMemory!==undefined&&n.deviceMemory<4) || (n.hardwareConcurrency>0&&n.hardwareConcurrency<4)})
    update();media.addEventListener('change',update);document.addEventListener('visibilitychange',update)
    return()=>{media.removeEventListener('change',update);document.removeEventListener('visibilitychange',update)}
  },[])
  return policy
}
