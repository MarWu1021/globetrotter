/** Feature detection only; no account, cookie or browser-storage access. */
export function isAppleMobile(userAgent: string, maxTouchPoints: number) {
  return /iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)
}
export function isStandalone(displayMode: boolean, appleStandalone?: boolean) {
  return displayMode || appleStandalone === true
}
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
