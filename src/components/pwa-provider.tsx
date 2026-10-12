'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { isAppleMobile, isStandalone, type InstallPromptEvent } from '@/lib/pwa'

type Platform = 'ios' | 'android' | 'desktop'
const Context = createContext({ platform: 'desktop' as Platform, standalone: false, ready: false,
  canInstall: false, busy: false, failed: false, install: async () => {} })

export function PwaProvider({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState<Platform>('desktop')
  const [standalone, setStandalone] = useState(false)
  const [ready, setReady] = useState(false)
  const [canInstall, setCanInstall] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const prompt = useRef<InstallPromptEvent | null>(null)
  const mounted = useRef(false), prompting = useRef(false)
  useEffect(() => {
    mounted.current = true
    const ios = isAppleMobile(navigator.userAgent, navigator.maxTouchPoints)
    const mode = matchMedia('(display-mode: standalone)')
    const update = () => {
      const installed = isStandalone(mode.matches, (navigator as Navigator & { standalone?: boolean }).standalone)
      setPlatform(ios ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'desktop')
      setReady(true)
      setStandalone(installed)
      if (installed) { prompt.current = null; setCanInstall(false) }
    }
    update()
    const available = (event: Event) => {
      if (ios || isStandalone(mode.matches, (navigator as Navigator & { standalone?: boolean }).standalone)) return
      event.preventDefault()
      prompt.current = event as InstallPromptEvent
      setCanInstall(true); setFailed(false)
    }
    const installed = () => { prompt.current = null; setCanInstall(false); setFailed(false); setStandalone(true) }
    window.addEventListener('beforeinstallprompt', available)
    window.addEventListener('appinstalled', installed)
    window.addEventListener('pageshow', update)
    mode.addEventListener('change', update)
    return () => {
      mounted.current = false; prompt.current = null
      window.removeEventListener('beforeinstallprompt', available)
      window.removeEventListener('appinstalled', installed)
      window.removeEventListener('pageshow', update)
      mode.removeEventListener('change', update)
    }
  }, [])
  async function install() {
    const event = prompt.current
    if (!event || prompting.current) return
    prompting.current = true; prompt.current = null; setCanInstall(false); setBusy(true); setFailed(false)
    try {
      // Only called from an explicit user click. Safari uses the manual instructions.
      await event.prompt()
      await event.userChoice
      // An accepted prompt is not proof of installation; wait for appinstalled.
    } catch { if (mounted.current) setFailed(true) }
    finally { prompting.current = false; if (mounted.current) setBusy(false) }
  }
  return <Context.Provider value={{ platform, standalone, ready, canInstall, busy, failed, install }}>{children}</Context.Provider>
}
export const usePwa = () => useContext(Context)
