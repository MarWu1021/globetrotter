import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { authConfig } from './config'
export async function serverAuth() {
  const config = authConfig()
  if (!config) return null
  const store = await cookies()
  return createServerClient(config.url, config.key, {
    cookies: { getAll: () => store.getAll(), setAll: values => {
      for (const {name,value,options} of values) store.set(name,value,options)
    } },
    global: { fetch: (input, init) => fetch(input, {...init, cache:'no-store'}) },
  })
}
