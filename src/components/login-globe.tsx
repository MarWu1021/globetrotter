'use client'
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react'
import Globe,{type GlobeMethods} from 'react-globe.gl'
import {MeshPhongMaterial} from 'three'
import {globeCountryFeatures} from '@/lib/geo'
import {useElementSize} from '@/lib/use-element-size'
const coverArcs=[{startLat:25,startLng:121,endLat:35,endLng:139},{startLat:35,startLng:139,endLat:1.3,endLng:103.8},{startLat:25,startLng:121,endLat:49,endLng:2.5}]
const coverPoints=[{lat:25,lng:121},{lat:35,lng:139},{lat:1.3,lng:103.8},{lat:49,lng:2.5}]
export default function LoginGlobe({fallback}:{fallback:ReactNode}) {
 const [ref,size]=useElementSize<HTMLDivElement>(),globe=useRef<GlobeMethods|undefined>(undefined)
 const [failed,setFailed]=useState(false),[ready,setReady]=useState(false)
 const material=useMemo(()=>new MeshPhongMaterial({color:'#8CB8C9',shininess:18}),[])
 useEffect(()=>()=>{globe.current?.pauseAnimation();material.dispose()},[material])
 useEffect(()=>{
  if(!ready)return
  const g=globe.current;if(!g)return
  g.renderer().setPixelRatio(1)
  const controls=g.controls();controls.autoRotate=true;controls.autoRotateSpeed=.22;controls.enableZoom=false;controls.enablePan=false;controls.enableRotate=false
  const canvas=g.renderer().domElement
  const lost=(e:Event)=>{e.preventDefault();g.pauseAnimation();setFailed(true)}
  canvas.addEventListener('webglcontextlost',lost)
  // Measured sustained slow rendering falls back instead of a hot render loop.
  let raf=0,start=0,frames=0
  const sample=(now:number)=>{if(!start)start=now;frames++;if(now-start>2500){if(frames<35){g.pauseAnimation();setFailed(true)}return}raf=requestAnimationFrame(sample)}
  raf=requestAnimationFrame(sample)
  return()=>{cancelAnimationFrame(raf);canvas.removeEventListener('webglcontextlost',lost);g.pauseAnimation()}
 },[ready])
 return <div ref={ref} className="relative h-full w-full" data-login-globe>
  {(!ready||failed)&&<div className="absolute inset-0">{fallback}</div>}
  {!failed&&size.width>0&&<div style={{opacity:ready?1:0}}><Globe ref={globe} width={size.width} height={size.height} animateIn={false} onGlobeReady={()=>{globe.current?.pointOfView({lat:22,lng:112,altitude:1.45},0);setReady(true)}} globeMaterial={material} backgroundColor="rgba(0,0,0,0)" showAtmosphere atmosphereColor="#D5ECF2" atmosphereAltitude={.065} polygonsData={globeCountryFeatures} polygonCapColor={()=> '#E8F0EC'} polygonSideColor={()=> '#C5DCE1'} polygonStrokeColor={()=> '#A1C2CA'} polygonAltitude={.005} polygonsTransitionDuration={0} enablePointerInteraction={false} arcsData={coverArcs} arcColor={()=> '#FFFBE8'} arcAltitudeAutoScale={.28} arcStroke={.35} arcDashLength={.3} arcDashGap={1.8} arcDashInitialGap={d=>coverArcs.indexOf(d as typeof coverArcs[number])*.8} arcDashAnimateTime={16000} arcCurveResolution={32} arcsTransitionDuration={0} pointsData={coverPoints} pointColor={()=> '#FFF8DC'} pointAltitude={.012} pointRadius={.35} pointResolution={8} pointsMerge/></div>}
 </div>
}
