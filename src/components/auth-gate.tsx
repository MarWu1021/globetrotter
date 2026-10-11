"use client"

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './auth-provider'
import { authDestination, canShowWorkspace } from '@/lib/auth/navigation'
import { useT } from '@/lib/i18n'

export function AuthLoading() {
  const t = useT()
  return <main className="grid min-h-dvh place-items-center bg-[var(--bg)] p-6 text-[var(--ink)]" data-auth-loading>
    <div role="status" className="space-y-4 text-center">
      <p className="text-3xl font-semibold">Globetrotter</p>
      <p className="text-[var(--ink-dim)]">{t('auth.loading')}</p>
    </div>
  </main>
}

export function AuthGate({children}: {children: ReactNode}) {
  const {enabled, state} = useAuth()
  const router = useRouter()
  const destination = authDestination(state, false, enabled)
  useEffect(() => { if (destination) router.replace(destination) }, [destination, router])
  // Do not mount account repositories, editors or maps until verification succeeds.
  return canShowWorkspace(state, enabled) ? children : <AuthLoading />
}
