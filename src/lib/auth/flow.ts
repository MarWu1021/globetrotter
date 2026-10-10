export type Identity = { id: string; email?: string }
export type AuthState = { phase: 'loading'|'signed-out'|'ready'|'error'|'signing-out'; user: Identity|null }
export function callbackDestination(requestURL: string, success: boolean) {
  const url = new URL('/', new URL(requestURL).origin)
  if (!success) url.searchParams.set('auth_error', 'failed')
  return url
}
/** Never carry a previous user's identity into a pending/failed session. */
export function verifiedState(user: Identity|null, error = false): AuthState {
  return { phase: error ? 'error' : user ? 'ready' : 'signed-out', user: error ? null : user }
}
export async function exchangeCallback(url: string, exchange: (code: string)=>Promise<boolean>) {
  const parsed = new URL(url)
  const code = parsed.searchParams.get('code')
  if (!code || parsed.searchParams.has('error')) return callbackDestination(url, false)
  try { return callbackDestination(url, await exchange(code)) }
  catch { return callbackDestination(url, false) }
}

/** Next may normalize request.url to localhost internally. Use the actual Host,
 * never next/query parameters or a configured Production address. */
export function requestSiteURL(requestURL: string, host: string|null) {
  const url=new URL(requestURL)
  if(host && /^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::[0-9]+)?$/i.test(host))url.host=host
  return url.href
}

/** Missing/expired identity is signed-out; a failed verification service is not. */
export function sessionUnavailable(error: {name?:string;status?:number}|null|undefined) {
  return !!error && error.name!=='AuthSessionMissingError' && error.status!==401 && error.status!==403
}
