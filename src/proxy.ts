import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { authConfig } from '@/lib/auth/config'
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({request})
  const config = authConfig()
  if (config && request.nextUrl.pathname !== '/auth/callback') {
    const client = createServerClient(config.url, config.key, {
      cookies: {getAll:()=>request.cookies.getAll(),setAll:values=>{
        for (const {name,value} of values) request.cookies.set(name,value)
        response = NextResponse.next({request})
        for (const {name,value,options} of values) response.cookies.set(name,value,options)
      }},
      global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store'})},
    })
    try { await client.auth.getUser() } catch { /* Endpoint verifies identity independently. */ }
  }
  if (config || request.nextUrl.pathname.startsWith('/auth/')) {
    response.headers.set('Cache-Control','private, no-store, max-age=0')
  }
  return response
}
export const config = {matcher: ['/', '/auth/:path*']}
