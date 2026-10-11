"use client"
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { browserAuth } from '@/lib/auth/client'
import { authConfig } from '@/lib/auth/config'
import { verifiedState, type AuthState } from '@/lib/auth/flow'
import { useT } from '@/lib/i18n'
const Context = createContext<{enabled:boolean;state:AuthState;generation:number;login:()=>Promise<void>;logout:()=>Promise<void>;invalidateSession:(refresh?:boolean)=>void;sessionExpired:boolean}|null>(null)
export function AuthProvider({children}:{children:ReactNode}) {
  const enabled = !!authConfig()
  const [state,setState] = useState<AuthState>({phase:enabled?'loading':'signed-out',user:null})
  const [generation,setGeneration] = useState(0)
  const [sessionExpired,setSessionExpired] = useState(false)
  const epoch = useRef(0)
  const mounted = useRef(false)
  const identity = useRef<string|null>(null)
  const callbackFailed = useRef(false)
  const reverify=useRef<(()=>Promise<void>)|null>(null)
  const invalidateSession=useCallback((refresh=false)=>{
    ++epoch.current;identity.current=null;setSessionExpired(!refresh);setGeneration(n=>n+1)
    setState(refresh?{phase:'loading',user:null}:verifiedState(null,true))
    if(refresh)queueMicrotask(()=>{if(mounted.current)void reverify.current?.()})
  },[])
  useEffect(()=>{
    const client = browserAuth()
    if (!client) return
    const invalidate=()=>{mounted.current=false;epoch.current+=1}
    mounted.current=true
    callbackFailed.current=callbackFailed.current || new URL(window.location.href).searchParams.has("auth_error")
    async function verify() {
      const ticket=++epoch.current

      try {
        const response=await fetch('/auth/session',{cache:'no-store'})
        if(!response.ok)throw new Error('Verification unavailable')
        const data=await response.json()
        if(mounted.current && ticket===epoch.current) {
          const next=verifiedState(data.user)
          if(identity.current!==next.user?.id && !(identity.current===null && !next.user))setGeneration(n=>n+1)
          identity.current=next.user?.id??null
          const url=new URL(window.location.href)
          const cancelled=url.searchParams.has('auth_error')
          if(cancelled){url.searchParams.delete('auth_error');window.history.replaceState(null,'',url)}
          if(next.user)setSessionExpired(false)
          setState(callbackFailed.current?verifiedState(null,true):next)
        }
      } catch { if(mounted.current && ticket===epoch.current){identity.current=null;setGeneration(n=>n+1);setState(verifiedState(null,true))} }
    }
    reverify.current=verify
    // Do not await Supabase methods from inside onAuthStateChange's lock.
    const {data:{subscription}}=client.auth.onAuthStateChange(()=>{void verify()})
    const onFocus=()=>{void verify()}
    // A browser Back/Forward cache must restore a verification screen, never
    // a frozen map/editor from the account that was active before navigation.
    const onPageHide=()=>{
      ++epoch.current;identity.current=null
      flushSync(()=>{setGeneration(n=>n+1);setState({phase:'loading',user:null})})
    }
    const onVisible=()=>{if(document.visibilityState==='visible')void verify()}
    window.addEventListener('focus',onFocus)
    window.addEventListener('pageshow',onFocus)
    window.addEventListener('pagehide',onPageHide)
    document.addEventListener('visibilitychange',onVisible)
    const interval=window.setInterval(()=>{if(document.visibilityState==='visible')void verify()},60000)
    void verify()
    return ()=>{reverify.current=null;invalidate();subscription.unsubscribe();window.removeEventListener('focus',onFocus);window.removeEventListener('pageshow',onFocus);window.removeEventListener('pagehide',onPageHide);document.removeEventListener('visibilitychange',onVisible);clearInterval(interval)}
  },[])
  async function login() {
    const client=browserAuth();if(!client)return
    callbackFailed.current=false;setSessionExpired(false)
    ++epoch.current;setGeneration(n=>n+1);setState({phase:'loading',user:null})
    try {
      const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:new URL('/auth/callback',window.location.origin).href,queryParams:{prompt:'select_account'}}})
      if(error)throw error
    } catch {setState(verifiedState(null,true))}
  }
  async function logout() {
    setSessionExpired(false)
    ++epoch.current;identity.current=null;setGeneration(n=>n+1);setState({phase:'signing-out',user:null})
    try {
      const result=await browserAuth()?.auth.signOut({scope:'local'})
      if(result?.error)throw result.error
      setState(verifiedState(null))
    } catch {setState(verifiedState(null,true))}
  }
  return <Context.Provider value={{enabled,state,generation,login,logout,invalidateSession,sessionExpired}}>{children}</Context.Provider>
}
export function useAuth(){const value=useContext(Context);if(!value)throw new Error('Missing AuthProvider');return value}
export function AuthControls(){
  const {enabled,state,login,logout,sessionExpired}=useAuth(),t=useT()
  if(!enabled)return <p className="text-sm">{t('auth.unconfigured')}</p>
  return <section className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-[var(--ink)]" aria-live="polite">
    <p className="break-words">{state.user?.email??t(state.phase==='loading'||state.phase==='signing-out'?'auth.loading':'auth.guest')}</p>
    {(state.phase==='error')&&<p role="alert">{t(sessionExpired?'cloud.error.unauthenticated':'auth.error')}</p>}
    <button className="min-h-11 w-full rounded-lg border border-[var(--border-strong)] px-3 py-2" disabled={state.phase==='loading'||state.phase==='signing-out'} onClick={()=>void(state.user?logout():login())}>{t(state.user?'auth.logout':'auth.login')}</button>
  </section>
}
