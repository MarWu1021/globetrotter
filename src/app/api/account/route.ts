import { NextRequest, NextResponse } from 'next/server'
import { serverAuth } from '@/lib/auth/server'
import { requestSiteURL, sessionUnavailable } from '@/lib/auth/flow'
import { supabaseRepositories } from '@/lib/cloud-trips/supabase'
import { object, validMutation, validCountry, sameAccount } from '@/lib/cloud-trips/validation'
import { validSavedDraft } from '@/lib/trip-storage/core'
import type { CloudError } from '@/lib/cloud-trips/contracts'
export const dynamic='force-dynamic'
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie','X-Content-Type-Options':'nosniff'}
const fail=(error:CloudError,status=400)=>NextResponse.json({userId:null,result:{ok:false,error}},{status,headers})
async function account() {
  const client=await serverAuth()
  if(!client)return {error:'setup' as const}
  const verified=await client.auth.getUser()
  if(sessionUnavailable(verified.error))return {error:'network' as const}
  if(verified.error || !verified.data.user)return {error:'unauthenticated' as const}
  return {userId:verified.data.user.id,repositories:supabaseRepositories(client,verified.data.user.id)}
}
async function jsonBody(request:NextRequest):Promise<unknown> {
  // Enforce the limit while reading; never trust Content-Length or log the body.
  const reader=request.body?.getReader();if(!reader)throw new Error('body')
  const decoder=new TextDecoder('utf-8',{fatal:true});let text='',bytes=0
  try {
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength
      if(bytes>2500000){await reader.cancel();throw new Error('body too large')}
      text+=decoder.decode(value,{stream:true})
    }
    return JSON.parse(text+decoder.decode())
  }finally{reader.releaseLock()}
}
export async function GET(request:NextRequest) {
  try {
    const a=await account();if(a.error)return fail(a.error,a.error==='unauthenticated'?401:503)
    if(!sameAccount(a.userId,request.nextUrl.searchParams.get('expectedUserId')))return fail('account-changed',409)
    const kind=request.nextUrl.searchParams.get('kind')
    if(kind!=='trips' && kind!=='countries')return fail('invalid')
    const result=await a.repositories[kind].list()
    return NextResponse.json({userId:a.userId,result},{headers})
  }catch{return fail('network',503)}
}
export async function POST(request:NextRequest) {
  const site=new URL(requestSiteURL(request.url,request.headers.get('host')))
  if(request.headers.get('origin')!==site.origin || !request.headers.get('content-type')?.startsWith('application/json'))return fail('unauthenticated',403)
  let writing=false
  try {
    const a=await account();if(a.error)return fail(a.error,a.error==='unauthenticated'?401:503)
    let body:unknown;try{body=await jsonBody(request)}catch{return fail('invalid')}
    if(!object(body))return fail('invalid')
    // Reject old-account requests BEFORE calling any repository/RPC.
    if(!sameAccount(a.userId,body.expectedUserId))return fail('account-changed',409)
    if(!validMutation(body.command))return fail('invalid')
    const c=body.command as typeof body.command & Record<string,unknown>, operation=body.operation
    if(operation==='save-trip') {
      if(!validSavedDraft(c.draft) || c.draft.id!==c.id)return fail('invalid')
      writing=true
      const result=await a.repositories.trips.save({...c,draft:c.draft})
      return NextResponse.json({userId:a.userId,result},{headers})
    }
    if(operation==='save-country') {
      if(!validCountry(c.record) || c.record.geoId!==c.id)return fail('invalid')
      writing=true
      const result=await a.repositories.countries.save({...c,record:c.record})
      return NextResponse.json({userId:a.userId,result},{headers})
    }
    if(!['remove-trip','remove-country','restore-country'].includes(String(operation)) || c.expectedRevision===null)return fail('invalid')
    writing=true
    const result=operation==='remove-trip'?await a.repositories.trips.remove(c):operation==='remove-country'?await a.repositories.countries.remove(c):await a.repositories.countries.restore(c)
    return NextResponse.json({userId:a.userId,result},{headers})
  }catch{return fail(writing?'uncertain':'network',503)}
}
