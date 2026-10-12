"use client"

import { useEffect } from 'react'
import LoginIsland from './login-island'
import PwaInstall from './pwa-install'
import { useRouter } from 'next/navigation'
import { useAuth } from './auth-provider'
import { AuthLoading } from './auth-gate'
import { authDestination } from '@/lib/auth/navigation'
import { detectLocale, LOCALES, useT } from '@/lib/i18n'
import { useTravelStore, type Locale } from '@/lib/store'
import styles from './login-screen.module.css'
import { TravelTile } from './travel-illustration'

function GoogleIcon() {
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.2H24v8h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.9 6-15.2Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.2c-1.9 1.3-4.2 2-6.8 2-5.3 0-9.8-3.6-11.4-8.4H5.7v5.4A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.5a12.3 12.3 0 0 1 0-7V15H5.7a20.4 20.4 0 0 0 0 18l6.9-5.5Z"/><path fill="#EA4335" d="M24 12.1c3 0 5.6 1 7.7 3l5.8-5.8A19.6 19.6 0 0 0 24 4 20.4 20.4 0 0 0 5.7 15l6.9 5.5C14.2 15.7 18.7 12 24 12Z"/></svg>
}

// Decorative coast silhouettes, not geographic data or a reference-image background.
function CoastalHorizon() {
  return <svg className={styles.horizon} viewBox="0 0 1440 220" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 113 40 100 89 108 139 86 190 92 232 67 281 76 324 70 372 99 421 93 470 116 528 102 580 122 640 108 697 131 752 108 809 120 871 102 932 112 1001 95 1069 111 1134 85 1190 96 1241 68 1290 83 1346 72 1394 94 1440 87V220H0Z"/>
    <path d="M0 148 68 130 110 141 178 119 226 135 282 114 334 132 397 125 451 153 526 139 596 165 664 151 719 162 777 140 832 153 901 134 964 148 1034 121 1105 138 1168 128 1234 148 1301 124 1368 130 1440 111V220H0Z"/>
    <path d="M0 184Q160 155 325 185T655 186T997 182T1440 171V220H0Z"/>
  </svg>
}

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
  return <main data-login-page className={styles.page}>
    <div className={styles.frame} aria-hidden="true" />
    <CoastalHorizon />
    <header className={styles.header}>
      <span className={styles.brand}><TravelTile kind="globe" /><span>Globetrotter</span></span>
      <label className={styles.language}>
        <span className="sr-only">{t('language')}</span>
        <select aria-label={t('language')} value={locale} onChange={e => setLocale(e.target.value as Locale)}>
          {LOCALES.map(l => <option key={l.id} value={l.id}>{l.flag} {l.label}</option>)}
        </select>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
      </label>
    </header>
    <div className={styles.content}>
      <div className={styles.visual}>
        <div className={styles.halo} aria-hidden="true" />
        <LoginIsland className={styles.island} />
      </div>
      <section className={styles.editorial} aria-labelledby="login-title">
        <p className={styles.manifesto}>{t('login.eyebrow')}</p>
        <p className={styles.wordmark}>Globetrotter</p>
        <h1 id="login-title" className={styles.title}>{t('login.title')}</h1>
        <div className={styles.card}>
          <h2>{t('login.begin')}</h2>
          {state.phase === 'error' && <p role="alert" className={styles.error}>{t(sessionExpired ? 'cloud.error.unauthenticated' : 'auth.error')}</p>}
          {!enabled && <p role="alert" className={styles.error}>{t('auth.unconfigured')}</p>}
          <button type="button" aria-label={t('auth.login')} disabled={!enabled} onClick={() => void login()} className={styles.googleButton}>
            <span className={styles.googleIcon}><GoogleIcon /></span><span>{t('auth.login')}</span>
            <svg className={styles.arrow} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>
          </button>
          <p className={styles.privacy}>{t('login.privacy')}</p>
        </div>
        <div className={styles.install}><PwaInstall /></div>
      </section>
    </div>
    <footer className={styles.footer}><span aria-hidden="true" />{t('login.footer')}<span aria-hidden="true" /></footer>
  </main>
}
