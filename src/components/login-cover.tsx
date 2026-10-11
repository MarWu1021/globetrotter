'use client'
import dynamic from 'next/dynamic'
import {Component,type ReactNode} from 'react'
import {useMotionPolicy} from '@/lib/presentation/use-motion-policy'
import {animationAllowed} from '@/lib/presentation/journey'
function StaticCover(){return <svg data-login-static viewBox="0 0 320 320" className="h-full w-full" fill="none"><circle cx="160" cy="160" r="122" fill="#DCE9ED"/><circle cx="160" cy="160" r="101" fill="#F4F7F8" stroke="#A8C7D1" strokeWidth="2"/><ellipse cx="160" cy="160" rx="50" ry="101" stroke="#A8C7D1"/><ellipse cx="160" cy="160" rx="101" ry="40" stroke="#A8C7D1"/><path d="M60 160h200M85 209Q154 66 254 140" stroke="#6F9E91" strokeWidth="2"/><circle cx="85" cy="209" r="4" fill="#486B80"/><circle cx="254" cy="140" r="4" fill="#486B80"/></svg>}
class CoverBoundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return{failed:true}};render(){return this.state.failed?<StaticCover/>:this.props.children}}
const AnimatedCover=dynamic(()=>import('./login-globe'),{ssr:false,loading:()=> <StaticCover/>})
export default function LoginCover(){
 const p=useMotionPolicy(),enabled=animationAllowed(p.reduced,p.hidden,p.lowPower)
 return <div aria-hidden="true" className="pointer-events-none mx-auto aspect-square w-full max-w-[300px] md:max-w-[420px]" data-login-cover={enabled?'animated':'static'}>
  {enabled?<CoverBoundary><AnimatedCover fallback={<StaticCover/>}/></CoverBoundary>:<StaticCover/>}
 </div>
}
