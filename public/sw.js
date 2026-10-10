const CACHE = "globetrotter-v2"
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // D1 preparation: Auth callbacks, private endpoints and RSC payloads are never
  // app-cached. Future authenticated HTML must also send private/no-store.
  if (url.pathname === "/auth" || url.pathname.startsWith("/auth/") ||
      url.searchParams.has("_rsc") || request.headers.get("RSC") === "1") return

  // API routes (live advisories): always network, never cache. Let the request
  // fall through to the browser so fresh data lands when online.
  if (url.pathname.startsWith("/api/")) return

  // Navigations: network-first so updates land, fall back to the cached shell.
  if (request.mode === "navigate") {
    if (url.pathname !== "/" || url.search) return
    event.respondWith(
      fetch(request)
        .then((response) => {
          const control = response.headers.get("Cache-Control") || ""
          if (response.ok && response.headers.get("Content-Type")?.includes("text/html") &&
              !/private|no-store|no-cache/i.test(control)) {
            const copy = response.clone()
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put("/", copy)))
          }
          return response
        })
        .catch(() => caches.match("/").then((r) => r || caches.match(request))),
    )
    return
  }

  // Everything else is network-only unless it is an approved public asset.
  if (!url.pathname.startsWith("/_next/static/") && !url.pathname.startsWith("/icons/") &&
      !["/manifest.webmanifest", "/icon.svg", "/favicon.ico"].includes(url.pathname)) return

  // Static assets: cache-first, populate on miss (stale-while-revalidate-ish).
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && !/private|no-store|no-cache/i.test(response.headers.get("Cache-Control") || "")) {
            const copy = response.clone()
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)))
          }
          return response
        }),
    ),
  )
})
