// Public build assets only. Auth, HTML, API and account data stay network-only.
const CACHE = "globetrotter-v5"
const ICONS = new Set(["/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png", "/icon.svg"])
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => /^globetrotter-v\d+$/.test(key) && key !== CACHE).map(key => caches.delete(key)),
  )).then(() => self.clients.claim()))
})
self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET" || request.mode === "navigate") return
  const url = new URL(request.url)
  // Queries may contain callback codes or RSC data. Never save them as cache keys.
  if (url.origin !== self.location.origin || url.search || request.headers.has("Authorization") ||
      request.headers.get("RSC") === "1") return
  if (!url.pathname.startsWith("/_next/static/") && !ICONS.has(url.pathname)) return
  event.respondWith((async () => {
    let cache
    try {
      cache = await caches.open(CACHE)
      const cached = await cache.match(request)
      if (cached) return cached
    } catch { /* Cache restrictions must not break online loading. */ }
    const response = await fetch(request)
    const mime = response.headers.get("Content-Type") || ""
    // Never cache redirects, HTML, JSON, private responses or cross-origin content.
    const publicType = /^(?:image\/|font\/|text\/css\b|(?:text|application)\/javascript\b|application\/font-)/i.test(mime)
    if (response.ok && !response.redirected && publicType &&
        (!response.url || new URL(response.url).origin === self.location.origin) &&
        !/private|no-store|no-cache/i.test(response.headers.get("Cache-Control") || "")) {
      try { await cache?.put(request, response.clone()) } catch { /* Full cache: use the network response. */ }
    }
    return response
  })())
})
