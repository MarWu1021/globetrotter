'use client'
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react'
import Globe,{type GlobeMethods} from 'react-globe.gl'
import {MeshPhongMaterial} from 'three'
import {globeCountryFeatures} from '@/lib/geo'
import {useElementSize} from '@/lib/use-element-size'
const coverArcs=[{startLat:25,startLng:121,endLat:35,endLng:139},{startLat:25,startLng:55,endLat:38,endLng:23},{startLat:51,startLng:0,endLat:41,endLng:-74}]
export default function LoginGlobe({fallback}:{fallback:ReactNode}) {
 const [ref,size]=useElementSize<HTMLDivElement>(),globe=useRef<GlobeMethods|undefined>(undefined)
 const [failed,setFailed]=useState(false),[ready,setReady]=useState(false)
 const material=useMemo(()=>new MeshPhongMaterial({color:'#A8C7D1',shininess:6}),[])
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
  {!failed&&size.width>0&&<div style={{opacity:ready?1:0}}><Globe ref={globe} width={size.width} height={size.height} animateIn={false} onGlobeReady={()=>{globe.current?.pointOfView({lat:25,lng:30,altitude:2.2},0);setReady(true)}} globeMaterial={material} backgroundColor="rgba(0,0,0,0)" showAtmosphere atmosphereColor="#DCE9ED" atmosphereAltitude={.12} polygonsData={globeCountryFeatures} polygonCapColor={()=> '#D8E0E3'} polygonSideColor={()=> '#DCE9ED'} polygonStrokeColor={()=> '#A8C7D1'} polygonAltitude={.005} polygonsTransitionDuration={0} enablePointerInteraction={false} arcsData={coverArcs} arcColor={()=> '#6F9E91'} arcAltitudeAutoScale={.35} arcStroke={.3} arcDashLength={.25} arcDashGap={2.5} arcDashInitialGap={d=>coverArcs.indexOf(d as typeof coverArcs[number])*.8} arcDashAnimateTime={12000} arcCurveResolution={32} arcsTransitionDuration={0}/></div>}
 </div>
}
