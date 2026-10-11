import type { AuthState } from './flow'
/** Route policy only; API authorization still verifies the server-side user. */
export function authDestination(state: AuthState, loginPage: boolean, enabled: boolean): '/'|'/login'|null {
  if (enabled && state.phase === 'loading') return null
  const signedIn = enabled && state.phase === 'ready' && !!state.user
  return loginPage ? (signedIn ? '/' : null) : (signedIn ? null : '/login')
}
export function canShowWorkspace(state: AuthState, enabled: boolean): boolean {
  return enabled && state.phase === 'ready' && !!state.user
}
