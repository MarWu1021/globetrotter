import { NextResponse } from 'next/server'
import { sessionUnavailable } from '@/lib/auth/flow'
import { serverAuth } from '@/lib/auth/server'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const client = await serverAuth()
    const result = client ? await client.auth.getUser() : null
    if(sessionUnavailable(result?.error))throw new Error('Verification unavailable')
    const user = result?.error ? null : result?.data.user
    return NextResponse.json({user:user ? {id:user.id,email:user.email} : null}, {
      headers: {'Cache-Control':'private, no-store, max-age=0'},
    })
  } catch {
    return NextResponse.json({user:null}, {status:503,headers:{'Cache-Control':'private, no-store, max-age=0'}})
  }
}
