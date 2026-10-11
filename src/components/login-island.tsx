'use client'

import { useId } from 'react'
import { useMotionPolicy } from '@/lib/presentation/use-motion-policy'
import { animationAllowed } from '@/lib/presentation/journey'
import styles from './login-screen.module.css'

type Point = [number, number]
const points = (values: Point[]) => values.map(p => p.join(',')).join(' ')

/** Original login artwork. Its imaginary island is decorative, never map or account data. */
function House({x, y, w=36, d=29, h=42, roof='#658D96', flat=false}: {
  x:number; y:number; w?:number; d?:number; h?:number; roof?:string; flat?:boolean
}) {
  const shade = useId().replace(/:/g,'')
  const p = (u:number, v:number, height=0): Point => [x+(u-v)*.86, y+(u+v)*.46-height]
  const face = (coords:Point[], fill:string) => <polygon points={points(coords)} fill={fill}/>
  return <g data-island-building>
    <defs>
      <linearGradient id={`${shade}-wall`} x1="0" y1="0" x2=".45" y2="1"><stop stopColor="#CCDCD0"/><stop offset="1" stopColor="#ACC4BA"/></linearGradient>
      <linearGradient id={`${shade}-roof`} x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#ADC8BC"/><stop offset="1" stopColor="#80A5A1"/></linearGradient>
      <linearGradient id={`${shade}-glint`} x1="0" y1="0" x2="1" y2=".4"><stop stopColor="#F9F9E6" stopOpacity=".2"/><stop offset=".62" stopColor="#F9F9E6" stopOpacity="0"/></linearGradient>
    </defs>
    {/* Layered vector shadows stay inexpensive on mobile; light comes from the upper left. */}
    <polygon points={points([p(-4,-2),p(w+16,-2),p(w+16,d+12),p(-4,d+12)])} transform="translate(3 3)" fill="#476D60" opacity=".06"/>
    {face([p(-2,-1),p(w+Math.min(15,h*.2),-1),p(w+Math.min(15,h*.2),d+6),p(-2,d+6)], '#446A6526')}
    {face([p(0,d,-2),p(w,d,-2),p(w,d,3),p(0,d,3)], '#ABBCAE')}
    {face([p(w,0,-2),p(w,d,-2),p(w,d,3),p(w,0,3)], '#91ABA1')}
    {face([p(w,0),p(w,d),p(w,d,h),p(w,0,h)], `url(#${shade}-wall)`)}
    {face([p(0,d),p(w,d),p(w,d,h),p(0,d,h)], '#FFF8E8')}
    {face([p(0,d),p(w,d),p(w,d,5),p(0,d,5)], '#E8DFC9')}
    {face([p(0,d,h-6),p(w,d,h-6),p(w,d,h),p(0,d,h)], '#DCDCC6')}
    {face([p(w,0,h-6),p(w,d,h-6),p(w,d,h),p(w,0,h)], '#93ACA3')}
    {flat ? <>
      {face([p(0,0,h),p(w,0,h),p(w,d,h),p(0,d,h)], '#E5EBDE')}
      {face([p(4,4,h+.1),p(w-4,4,h+.1),p(w-4,d-4,h+.1),p(4,d-4,h+.1)], '#BFCFC3')}
      <polyline points={points([p(0,d,h),p(w,d,h),p(w,0,h)])} stroke="#FDFCF2" strokeWidth="2"/>
    </> : <>
      {face([p(-4,-3,h),p(w/2,-3,h+15),p(w/2,d+4,h+15),p(-4,d+4,h)], `url(#${shade}-roof)`)}
      {face([p(w/2,-3,h+15),p(w+4,-3,h),p(w+4,d+4,h),p(w/2,d+4,h+15)], roof)}
      {face([p(w/2,-3,h+15),p(w+4,-3,h),p(w+4,d+4,h),p(w/2,d+4,h+15)], `url(#${shade}-glint)`)}
      <polygon points={points([p(w-2,-3,h+3),p(w+4,-3,h),p(w+4,d+4,h),p(w-2,d+4,h+3)])} fill="#385B61" opacity=".22"/>
      {face([p(0,d,h),p(w/2,d,h+15),p(w,d,h)], '#F8F2DF')}
      <polyline points={points([p(-4,d+4,h),p(w/2,d+4,h+15),p(w+4,d+4,h)])} fill="none" stroke="#E1E8D2" strokeWidth="1.1"/>
      <polyline points={points([p(w+4,-3,h),p(w+4,d+4,h)])} fill="none" stroke="#3D6367" strokeWidth="1" opacity=".55"/>
      <line x1={p(w/2,-3,h+15)[0]} y1={p(w/2,-3,h+15)[1]} x2={p(w/2,d+4,h+15)[0]} y2={p(w/2,d+4,h+15)[1]} stroke="#DCE7D6" strokeWidth="1.5"/>
    </>}
    {[12,29,46].filter(level => level<h-8).map(level => <g key={level}>
      {[w*.16,w*.64].map((u,i) => <g key={i}>
        {face([p(u-.7,d,level-.6),p(u+6.7,d,level-.6),p(u+6.7,d,level+8.7),p(u-.7,d,level+8.7)], '#E4DDC7')}
        {face([p(u,d,level),p(u+6,d,level),p(u+6,d,level+8),p(u,d,level+8)], '#8AAFB2')}
        <polygon points={points([p(u+.7,d,level+4),p(u+5.4,d,level+4),p(u+5.4,d,level+7.3),p(u+.7,d,level+7.3)])} fill="#EFF8EC" opacity=".35"/>
        <polyline points={points([p(u,d,level+8),p(u+6,d,level+8),p(u+6,d,level)])} fill="none" stroke="#638B8B" strokeWidth=".6"/>
        {face([p(u-.7,d,level),p(u+6.7,d,level),p(u+6.7,d+1.5,level),p(u-.7,d+1.5,level)], '#FDF9E9')}
      </g>)}
      {[d*.16,d*.66].map((v,i) => <g key={i}>
        {face([p(w,v,level),p(w,v+5,level),p(w,v+5,level+8),p(w,v,level+8)], '#638993')}
        <polygon points={points([p(w,v+.6,level+4.5),p(w,v+4.4,level+4.5),p(w,v+4.4,level+7.4),p(w,v+.6,level+7.4)])} fill="#CFE2D8" opacity=".3"/>
        <polyline points={points([p(w,v,level+8),p(w,v+5,level+8),p(w,v+5,level)])} fill="none" stroke="#52777D" strokeWidth=".6"/>
        {face([p(w,v-.5,level),p(w,v+5.5,level),p(w+1,v+5.5,level),p(w+1,v-.5,level)], '#DCE5D5')}
      </g>)}
    </g>)}
    {face([p(w*.4,d),p(w*.6,d),p(w*.6,d,13),p(w*.4,d,13)], '#547D82')}
    <polyline points={points([p(w,d,5),p(w,d,h-7)])} fill="none" stroke="#E7EBD8" strokeWidth=".9"/>
    <polyline points={points([p(0,d),p(w,d),p(w,0)])} fill="none" stroke="#B8CEC6" strokeWidth="1.1"/>
  </g>
}

function Tree({x,y,s=1,round=false}: {x:number;y:number;s?:number;round?:boolean}) {
  return <g transform={`translate(${x} ${y}) scale(${s})`} data-island-tree>
    <ellipse cx="10" cy="4" rx="18" ry="6" fill="#456D63" opacity=".08"/>
    <ellipse cx="5" cy="2" rx="11" ry="3.5" fill="#456D63" opacity=".16"/>
    <path d="M0-23V3" stroke="#9B9775" strokeWidth="4"/>
    <path d="M1-23V3" stroke="#79856A" strokeWidth="1.5"/>
    {round ? <>
      <ellipse cx="-5" cy="-27" rx="12" ry="16" fill="#ADC5A3"/>
      <ellipse cx="5" cy="-32" rx="13" ry="18" fill="#82AA96"/>
      <path d="M5-49c13 7 16 26 2 33" fill="#668F7E"/>
      <path d="M-3-43q-9 3-9 13" fill="none" stroke="#C7D8B5" strokeWidth="2" strokeLinecap="round" opacity=".6"/>
    </> : <>
      <path d="m0-55-17 35L0-10l17-10Z" fill="#94B69B"/>
      <path d="M0-55v45l17-10Z" fill="#658E7D"/>
      <path d="m0-40-19 30L0 0l19-10Z" fill="#9EBC9F"/>
      <path d="M0-40V0l19-10Z" fill="#709B85"/>
      <path d="m-2-49-10 22m10-7-12 21" fill="none" stroke="#C8D9B7" strokeWidth="1.1" strokeLinecap="round" opacity=".5"/>
    </>}
  </g>
}

function Cloud({x,y,s=1,className}: {x:number;y:number;s?:number;className?:string}) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}>
    <g className={className}>
      <ellipse cx="0" cy="6" rx="44" ry="10" fill="#AECBD016"/>
      <path d="M-42 0c-12-3-12-19 0-22 0-17 25-24 36-10 15-17 43-3 38 14 17-2 23 18 6 22Z" fill="#FFFEF6"/>
      <path d="M-42 0c21 4 59 5 80 4" fill="none" stroke="#E5EEE5" strokeWidth="3"/>
    </g>
  </g>
}

function Sailboat({x,y,s=1}: {x:number;y:number;s?:number}) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx="5" cy="10" rx="31" ry="7" fill="#E6F2EF" opacity=".55"/>
    <path d="m-22 0 20 12L24-2 8-8Z" fill="#F8F4E5"/>
    <path d="m-22 0 20 12v5l-17-9Z" fill="#7CA0A5"/>
    <path d="M0-54V3" stroke="#688F95" strokeWidth="2"/>
    <path d="M3-52V-2l29-15Z" fill="#FFFBEC"/>
    <path d="m-3-43-22 31 22 10Z" fill="#96B7AA"/>
  </g>
}

const trees = [
  [172,328,.9],[193,285,.85],[215,267,.7],[244,238,.8],[263,251,.65],
  [317,210,.8],[346,203,.65],[461,224,.8],[508,228,.7],[545,261,.7],
  [673,300,.85],[704,327,.8],[735,355,.7],[749,402,.65],[709,435,.8],
  [673,488,.75],[641,504,.85],[602,535,.7],[566,554,.65],[289,467,.7],
  [262,450,.75],[233,428,.7],[198,399,.6],[348,490,.7],[534,475,.7],
  [511,491,.6],[461,458,.65],[395,445,.65],
] as const

export default function LoginIsland({className}:{className?:string}) {
  const id = useId().replace(/:/g,'')
  const policy = useMotionPolicy()
  const animated = animationAllowed(policy.reduced,policy.hidden,policy.lowPower)
  const land = 'M112 347C126 282 189 228 269 208L333 168Q406 137 471 179L521 196Q562 186 614 216L655 256Q736 279 754 335L800 375Q823 408 786 449L733 489Q690 543 611 552L558 581Q493 611 440 579L381 557Q333 582 277 548L239 520Q157 494 136 453L99 415Q84 382 112 347Z'
  const road = 'M177 365Q222 297 287 296L371 247Q407 224 456 259L622 354Q650 369 636 403L594 468Q573 503 520 492L324 384Q298 369 270 386L237 409'
  const branches = 'M294 294 535 433Q577 456 611 433L695 386M444 254l-72 118M430 445l-46 58M604 355l58-35'
  return <svg className={className} data-login-island data-island-motion={animated?'animated':'static'}
    viewBox="0 0 900 740" aria-hidden="true" focusable="false" style={{pointerEvents:'none'}}>
    <defs>
      <linearGradient id={`${id}-sea`} x1=".1" y1="0" x2=".8" y2="1" gradientUnits="objectBoundingBox"><stop stopColor="#BDDDE0"/><stop offset=".55" stopColor="#98C4CE"/><stop offset="1" stopColor="#7BABBB"/></linearGradient>
      <linearGradient id={`${id}-sea-edge`} x1="0" y1="0" x2=".5" y2="1"><stop stopColor="#9DBFC3"/><stop offset="1" stopColor="#6B95A3"/></linearGradient>
      <linearGradient id={`${id}-land`} x1=".2" y1="0" x2=".75" y2="1" gradientUnits="objectBoundingBox"><stop stopColor="#DDE8CD"/><stop offset="1" stopColor="#B4CDB5"/></linearGradient>
      <linearGradient id={`${id}-edge`} x1=".15" y1="0" x2=".75" y2="1" gradientUnits="objectBoundingBox"><stop stopColor="#A2BBA9"/><stop offset=".6" stopColor="#799F8F"/><stop offset="1" stopColor="#547E78"/></linearGradient>
      <linearGradient id={`${id}-road`} x1=".2" y1="0" x2=".75" y2="1"><stop stopColor="#FFF8E1"/><stop offset="1" stopColor="#EDE3C8"/></linearGradient>
    </defs>
    {/* A curved, layered diorama base. No reference image or fictitious country data. */}
    <ellipse cx="455" cy="627" rx="292" ry="37" fill="#527E8B" opacity=".08"/>
    <path d="M60 432Q53 369 153 319L442 163Q472 147 504 165L814 352Q860 381 846 425L826 498Q817 528 778 549L505 698Q468 718 432 698L100 508Q73 491 60 432Z" fill={`url(#${id}-sea-edge)`}/>
    <path d="M61 411Q56 363 150 315L441 157Q472 140 505 157L818 343Q867 374 846 416L825 477Q816 503 776 526L505 675Q468 695 431 675L102 487Q66 466 61 411Z" fill={`url(#${id}-sea)`}/>
    <path d="m103 484 328 189q37 20 74 0l271-148" fill="none" stroke="#D4E7E4" strokeWidth="2" opacity=".65"/>
    <path d="M122 438q50 30 102 20m446 110 91-49M274 591l91 49M567 627l75-40M109 388l-24 13" fill="none" stroke="#DDEEE9" strokeWidth="2" strokeLinecap="round" opacity=".7"/>
    <path d={land} transform="translate(0 36)" fill="none" stroke="#DEF1E8" strokeWidth="1.5" opacity=".35"/>
    <path d={land} transform="translate(0 43)" fill="none" stroke="#D7EEEA" strokeWidth="1" opacity=".18"/>
    <path d={land} transform="translate(0 24)" fill={`url(#${id}-edge)`}/>
    <path d="M136 453Q157 494 239 520L277 548Q333 582 381 557L440 579Q493 611 558 581L611 552Q690 543 733 489" transform="translate(0 22)" fill="none" stroke="#527F78" strokeWidth="2" opacity=".35"/>
    <path d={land} fill={`url(#${id}-land)`} stroke="#F4EACF" strokeWidth="9"/>
    <path d="M112 347C126 282 189 228 269 208L333 168Q406 137 471 179M136 453Q157 494 239 520L277 548Q333 582 381 557" fill="none" stroke="#FFFAE4" strokeWidth="2" opacity=".75" strokeLinecap="round"/>
    <path d="M173 324q33-34 69-42m32-32 41-24m387 130 34 37m-96 102-26 24m-287 19-56-23" fill="none" stroke="#E8EED6" strokeWidth="2" strokeLinecap="round"/>
    {/* Small hill park behind the town. */}
    <path d="M255 239q34-90 94-70 54-36 107 51l-52 30-51-10-58 20Z" fill="#B8CDB2"/>
    <path d="M283 229q42-52 70-27 32-18 66 31l-61 5-34 20Z" fill="#CEDDC2"/>
    {/* The roads are broad cream ribbons, following the island rather than a map. */}
    <g fill="none" strokeLinejoin="round" strokeLinecap="round">
      <path d={road} transform="translate(0 2)" stroke="#698B702F" strokeWidth="17"/>
      <path d={branches} transform="translate(0 2)" stroke="#698B7027" strokeWidth="13"/>
      <path d={road} stroke="#C2C8AB" strokeWidth="15"/>
      <path d={branches} stroke="#C2C8AB" strokeWidth="12"/>
      <path d={road} stroke={`url(#${id}-road)`} strokeWidth="13"/>
      <path d={branches} stroke={`url(#${id}-road)`} strokeWidth="10"/>
      <path d={road} stroke="#FFFAE7" strokeWidth="1" opacity=".5"/>
    </g>
    {/* A modest coastal airfield and its terminal. */}
    <path d="m572 266 110 62-19 12-111-63Z" fill="#98B5B4"/>
    <path d="m570 272 97 55" stroke="#F0F4E9" strokeWidth="2" strokeDasharray="8 7"/>
    <path d="m562 266 12 7m85 47 12 7" stroke="#ECF2E8" strokeWidth="5"/>
    <House x={609} y={253} w={37} d={22} h={22} flat/>
    {/* Back-to-front ordering preserves depth without a 3D runtime. */}
    {trees.slice(0,10).map(([x,y,s],i)=><Tree key={`back-${i}`} x={x} y={y} s={s} round={i%3===0}/>)}
    <House x={361} y={266} w={38} d={31} h={52}/>
    <House x={448} y={300} w={31} d={27} h={39} roof="#7CA894"/>
    <House x={506} y={321} w={33} d={27} h={37} roof="#648C9B"/>
    <House x={276} y={330} w={32} d={27} h={44}/>
    <House x={335} y={345} w={29} d={27} h={31} roof="#95AD95"/>
    <House x={414} y={356} w={48} d={34} h={72} roof="#547F8C"/>
    {/* Hotel terrace and a small plaza. */}
    <path d="m383 386 43 24 33-18-43-24Z" fill="#E1DEC3"/>
    <g transform="translate(413 401)"><ellipse rx="12" ry="6" fill="#96BCBA"/><ellipse cy="-3" rx="9" ry="4" fill="#E1EEE4"/><path d="M0-14v10" stroke="#ACCAC3" strokeWidth="3"/></g>
    <House x={567} y={382} w={33} d={25} h={38} roof="#789D91"/>
    <House x={676} y={410} w={29} d={23} h={31}/>
    <House x={328} y={438} w={28} d={24} h={33} roof="#719A99"/>
    <House x={476} y={431} w={35} d={29} h={44} roof="#74979C"/>
    <House x={559} y={474} w={31} d={25} h={39} roof="#799F8A"/>
    {trees.slice(10).map(([x,y,s],i)=><Tree key={`front-${i}`} x={x} y={y} s={s} round={i%4===0}/>)}
    {/* Harbor deck, awnings and boats. */}
    <path d="m303 512 112 64-46 26-112-65Z" fill="#9EB1A1"/>
    <path d="m301 506 111 63-44 25-111-64Z" fill="#E0D8BA"/>
    <path d="m273 535 99 56m-88-63 99 56m-88-62 100 56m-90-62 101 57" stroke="#B9B49C" strokeWidth="1" opacity=".55"/>
    <path d="m345 584 2 17m41-24 2 15m-96-46v14" stroke="#8CA198" strokeWidth="3"/>
    <House x={306} y={510} w={31} d={25} h={26} roof="#7FA6A3"/>
    <path d="m325 543 30 17-13 8-30-17Z" fill="#F8F1DD"/>
    <path d="m325 543 7 4-13 8-7-4m14 8 7 4 13-8-7-4" fill="#9CB8A8"/>
    <Sailboat x={272} y={588} s={.78}/>
    <Sailboat x={688} y={544} s={.72}/>
    <g transform="translate(504 618)">
      <ellipse cx="7" cy="8" rx="40" ry="10" fill="#DBECE7" opacity=".6"/>
      <path d="m-32-2 38 22 30-20-27-18Z" fill="#6F939F"/>
      <path d="m-32-8 38 22 30-20-27-18Z" fill="#FCF8E9"/>
      <path d="m-12-16 21 12 16-10-21-12Z" fill="#B8D1CB"/>
      <path d="m-12-21 21 12 16-10-21-12Z" fill="#F6F5E4"/>
      <path d="m-5-15 10 6m9-7 7-4" stroke="#759CA5" strokeWidth="3"/>
    </g>
    {/* A single plane and two drifting clouds; all motion obeys the existing policy. */}
    <path d="M86 252Q288 108 626 141" fill="none" stroke="#93B7BD" strokeWidth="1.5" strokeDasharray="4 8" opacity=".45"/>
    <g transform="translate(688 151)">
      <g className={styles.islandPlane} data-island-plane>
        <ellipse cx="13" cy="48" rx="30" ry="6" fill="#507F8A" opacity=".08"/>
        <path d="m-48 5 28-14 2-29 8-5 11 25 43-14 7 5-41 29-5 27-8 5-4-23-27 8-15-2Z" fill="#769DA8" transform="translate(0 3)"/>
        <path d="m-48 5 28-14 2-29 8-5 11 25 43-14 7 5-41 29-5 27-8 5-4-23-27 8-15-2Z" fill="#FFFCED"/>
        <path d="m-11-16 19-6M-19-11l15-6" stroke="#ABC7CD" strokeWidth="3" strokeLinecap="round"/>
      </g>
    </g>
    <Cloud x={185} y={189} s={1.1} className={styles.islandCloud}/>
    <Cloud x={751} y={281} s={.68} className={styles.islandCloudSlow}/>
  </svg>
}
