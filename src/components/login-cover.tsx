'use client'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import {Component,type ReactNode} from 'react'
import {useMotionPolicy} from '@/lib/presentation/use-motion-policy'
import {animationAllowed} from '@/lib/presentation/journey'
function StaticCover(){return <Image data-login-static src="/login-atlas.svg" alt="" width={400} height={400} unoptimized className="h-full w-full"/>}
class CoverBoundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return{failed:true}};render(){return this.state.failed?<StaticCover/>:this.props.children}}
const AnimatedCover=dynamic(()=>import('./login-globe'),{ssr:false,loading:()=> <StaticCover/>})
export default function LoginCover({className}:{className?:string}){
 const p=useMotionPolicy(),enabled=animationAllowed(p.reduced,p.hidden,p.lowPower)
 return <div aria-hidden="true" className={`pointer-events-none ${className??'mx-auto aspect-square w-full max-w-[300px] md:max-w-[420px]'}`} data-login-cover={enabled?'animated':'static'}>
  {enabled?<CoverBoundary><AnimatedCover fallback={<StaticCover/>}/></CoverBoundary>:<StaticCover/>}
 </div>
}
