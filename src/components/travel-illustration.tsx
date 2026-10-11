/** Lightweight decorative vector artwork; never geographic or account data. */
export function TravelVillage({className}:{className?:string}) {
  return <svg className={className} data-travel-decoration="village" aria-hidden="true" focusable="false" viewBox="0 0 240 160" fill="none" style={{pointerEvents:'none'}}>
    <path d="m12 88 108 60 108-60v9l-108 60L12 97Z" fill="#91B5B9"/>
    <path d="m12 88 108-60 108 60-108 60Z" fill="#C8D9BE"/>
    <path d="m28 96 92-50 93 50M77 59l86 48-43 24" stroke="#F5F0DB" strokeWidth="8" strokeLinejoin="round"/>
    <path d="m27 104 93 51 101-57-21-11-81 45-69-38Z" fill="#93BEC9"/>
    <path d="m54 119 22 12m34 15 17-9m43-25 15-8" stroke="#D9E9E8" strokeWidth="1.5" strokeLinecap="round"/>
    {[{x:74,y:62,s:1},{x:125,y:85,s:.85},{x:143,y:43,s:.75}].map(({x,y,s},i)=><g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0 18 10v32L0 32Z" fill="#FFFCED"/>
      <path d="m18 10 24-14v32L18 42Z" fill="#DCE7DD"/>
      <path d="m-4 1 18-19 32 12-28 18Z" fill={i===1?'#82A99A':'#537D8A'}/>
      <path d="m14-18 32 12-5-13-22-9Z" fill={i===1?'#A6C5A7':'#769AA5'}/>
      <path d="M5 9v8m7-4v8m-7 3v8m7-4v8m14-20v8m9-14v8" stroke="#8CB2BC" strokeWidth="3"/>
      <path d="m27 31 8-5v9l-8 4Z" fill="#73999D"/>
    </g>)}
    {[{x:43,y:77},{x:55,y:49},{x:184,y:82},{x:192,y:66},{x:101,y:117}].map(({x,y},i)=><g key={i} transform={`translate(${x} ${y})`}>
      <path d="M0-5v14" stroke="#8B9F81" strokeWidth="3"/>
      <path d="m0-30-11 26L0 2 11-4Z" fill="#85AE91"/>
      <path d="M0-30V2l11-6Z" fill="#6E9C86"/>
      <path d="m0-23-9 17 9 5 9-5Z" fill="#A3C3A1"/>
    </g>)}
    <g transform="translate(181 124)"><path d="m-16 0 12 8 16-9-12-3Z" fill="#F8F5E6"/><path d="M-4-23V3l15-5Z" fill="#E6F0EA"/><path d="M-6-20-15-2l9 3Z" fill="#84AFA5"/><path d="m-14 6 19 9 17-10" stroke="#C6DDE0" strokeWidth="2"/></g>
    <g fill="#F8FCF9"><path d="M19 23c-7 1-6 8 1 9h23c6-1 7-7 1-9-1-9-13-12-18-4-3-2-7 0-7 4Z"/><path d="M184 12c-5 1-5 6 0 7h17c5-1 5-5 1-7-1-7-10-9-14-3-2-1-4 0-4 3Z"/></g>
    <path d="m205 32 15 7-12 5-4 10-4-2 1-9-10-4 1-3 12 1-5-9Z" fill="#547F8E"/>
  </svg>
}

export function TravelTile({kind,className}:{kind:'globe'|'map'|'records'|'add'|'stats'|'settings'|'refresh';className?:string}) {
  return <svg className={className} data-travel-decoration="icon" aria-hidden="true" focusable="false" viewBox="0 0 36 36" fill="none" style={{pointerEvents:'none'}}>
    <path d="m3 19 15 9 15-9v4l-15 9L3 23Z" fill="#92B6BA"/><path d="m3 19 15-9 15 9-15 9Z" fill="#D4E4DC"/>
    <g stroke="#3C6974" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {kind==='globe'&&<><circle cx="18" cy="15" r="8" fill="#EFF6EC"/><ellipse cx="18" cy="15" rx="3.8" ry="8"/><path d="M10 15h16m-14-5q6 3 12 0m-12 10q6-3 12 0"/></>}
      {kind==='map'&&<><path d="m7 11 7-5 8 4 7-4v15l-7 5-8-4-7 5Z" fill="#F9FAE9"/><path d="M14 6v16m8-12v16"/></>}
      {kind==='records'&&<><path d="m11 6 14 4v15l-14-4Z" fill="#FBF8E9"/><path d="m11 6-3 3v15l14 4 3-3M15 12l6 2m-6 2 6 2"/></>}
      {kind==='add'&&<><path d="m6 13 24 1-10 5-4 8-3-1 1-7-8-3Z" fill="#F9F9EF"/><path d="m16 14-2-8 3 1 5 7"/></>}
      {kind==='stats'&&<><path d="M10 21v-7h4v7m2 0V9h4v12m2 0V5h4v16" fill="#F8F7E7"/><path d="M8 24h20"/></>}
      {kind==='settings'&&<><path d="m18 6 3 2 4-1 2 4-2 3 2 3-2 4-4-1-3 2-3-2-4 1-2-4 2-3-2-3 2-4 4 1Z" fill="#F2F6E9"/><circle cx="18" cy="14" r="3.5"/></>}
      {kind==='refresh'&&<><path d="M24 10a8 8 0 1 0 2 9m-2-14v5h-5"/><path d="M18 17v5"/></>}
    </g>
  </svg>
}
