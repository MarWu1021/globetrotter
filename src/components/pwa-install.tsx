'use client'

import { useT } from '@/lib/i18n'
import { usePwa } from './pwa-provider'
import styles from './pwa-install.module.css'

export default function PwaInstall() {
  const t = useT(), pwa = usePwa()
  if (!pwa.ready) return null
  if (pwa.standalone) return <p className={styles.installed} data-pwa-installed>{t('pwa.installed')}</p>
  return <details className={styles.help} data-pwa-help>
    <summary><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M9 12h6m-3-3v6m-1 4h2"/></svg><span>{t('pwa.title')}</span></summary>
    <div className={styles.content}>
      <p>{t('pwa.intro')}</p>
      <ol>{[1, 2, 3].map(n => <li key={n}>{t(`pwa.${pwa.platform}.${n}`)}</li>)}</ol>
      {pwa.platform !== 'ios' && (pwa.canInstall || pwa.busy) && <button type="button" disabled={pwa.busy} onClick={() => void pwa.install()}>{t(pwa.busy ? 'pwa.installing' : 'pwa.install')}</button>}
      {pwa.failed && <p role="status">{t('pwa.failed')}</p>}
      <p className={styles.note}>{t('pwa.online')}</p>
      <p className={styles.note}>{t('pwa.origin')}</p>
      {pwa.platform === 'ios' && <p className={styles.note}>{t('pwa.ios.session')}</p>}
    </div>
  </details>
}
