"use client"

import { useEffect } from 'react'
import LoginCover from './login-cover'
import { useRouter } from 'next/navigation'
import { useAuth } from './auth-provider'
import { AuthLoading } from './auth-gate'
import { authDestination } from '@/lib/auth/navigation'
import { detectLocale, LOCALES, useT } from '@/lib/i18n'
import { useTravelStore, type Locale } from '@/lib/store'

export default function LoginScreen() {
  const {enabled, state, login, sessionExpired} = useAuth()
  const t = useT(), router = useRouter()
  const locale = useTravelStore(s => s.locale)
  const setLocale = useTravelStore(s => s.setLocale)
  const destination = authDestination(state, true, enabled)
  useEffect(() => { if (destination) router.replace(destination) }, [destination, router])
  useEffect(() => {
    const apply = () => useTravelStore.getState().autoLocale(detectLocale())
    const off = useTravelStore.persist.onFinishHydration(apply)
    if (useTravelStore.persist.hasHydrated()) apply()
    return off
  }, [])
  useEffect(() => { document.documentElement.lang = locale }, [locale])
  if (destination || state.phase === 'loading' || state.phase === 'signing-out') return <AuthLoading />
  return <main data-login-page className="flex h-dvh overflow-y-auto min-h-dvh flex-col bg-[var(--bg)] px-5 py-[max(20px,env(safe-area-inset-top))] text-[var(--ink)]">
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
      <span className="text-lg font-semibold tracking-tight">Globetrotter</span>
      <label className="text-sm text-[var(--ink-dim)]">
        <span className="sr-only">{t('language')}</span>
        <select aria-label={t('language')} value={locale} onChange={e => setLocale(e.target.value as Locale)} className="min-h-11 max-w-[150px] rounded-xl border border-[var(--border)] bg-[var(--panel)] px-2 text-[var(--ink)]">
          {LOCALES.map(l => <option key={l.id} value={l.id}>{l.flag} {l.label}</option>)}
        </select>
      </label>
    </header>
    <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 py-8 md:grid-cols-2 md:gap-12">
      <LoginCover />
      <section className="mx-auto w-full max-w-md glass-card space-y-5 rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-[var(--surface-shadow)] sm:p-8">
        <p className="text-sm font-medium text-[var(--ink-dim)]">{t('login.eyebrow')}</p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">{t('login.title')}</h1>
        <p className="leading-relaxed text-[var(--ink-dim)]">{t('login.description')}</p>
        {state.phase === 'error' && <p role="alert" className="text-[var(--danger)]">{t(sessionExpired ? 'cloud.error.unauthenticated' : 'auth.error')}</p>}
        {!enabled && <p role="alert">{t('auth.unconfigured')}</p>}
        <button type="button" aria-label={t('auth.login')} disabled={!enabled} onClick={() => void login()} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[var(--accent-ink)] disabled:opacity-60">
          <span aria-hidden="true" className="shrink-0 rounded-full bg-[var(--cream)] px-2 text-[var(--sea-blue)]">G</span><span>{t('auth.login')}</span>
        </button>
        <p className="text-sm leading-relaxed text-[var(--ink-dim)]">{t('login.privacy')}</p>
      </section>
    </div>
    <p className="pb-[env(safe-area-inset-bottom)] text-center text-sm text-[var(--ink-dim)]">{t('login.footer')}</p>
  </main>
}
