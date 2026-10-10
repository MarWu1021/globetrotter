import { NextResponse } from 'next/server'
import { serverAuth } from '@/lib/auth/server'
import { exchangeCallback, requestSiteURL } from '@/lib/auth/flow'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const destination = await exchangeCallback(requestSiteURL(request.url,request.headers.get("host")), async code => {
    const client = await serverAuth()
    if (!client) return false
    const {error} = await client.auth.exchangeCodeForSession(code)
    return !error
  })
  const response = NextResponse.redirect(destination, 303)
  response.headers.set('Cache-Control','private, no-store, max-age=0')
  response.headers.set('Referrer-Policy','no-referrer')
  return response
}
