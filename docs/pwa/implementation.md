# Globetrotter PWA

## Scope and existing setup

The work branch already had a standalone manifest, four PNG icons, Apple web-app metadata, and a public-asset service worker. This change completes that setup rather than adding a second PWA framework. No dependencies, push subscription, offline database, background sync or database migration are added.

- Manifest: `id`, `scope`, and `start_url` are `/`; name is Globetrotter; display is standalone.
- Cream background and coastal-blue theme. HTML includes an explicit 180px Apple touch icon and viewport safe-area support.
- Original editable artwork: `public/icons/island.svg`; `node scripts/generate-pwa-icons.mjs` reproduces the 192px, 512px, maskable 512px and 180px Apple PNGs, plus the favicon SVG. Uses the existing sharp dependency. Essential maskable artwork is inset inside the central 40%-radius safe circle.
- Install instructions are available on login, the desktop sidebar, and mobile Settings in all five languages. No automatic dialog is shown. iPhone/iPad always receive manual Safari instructions. Chromium's optional install button uses a captured `beforeinstallprompt` event only in response to a user click; acceptance alone is not reported as installed.

## Installation and origin

Use HTTPS in a real deployment (localhost is accepted for development). Safari: Share → Add to Home Screen; keep Open as Web App enabled when that option is shown. Android Chrome: browser menu → Install app / Add to Home screen. The browser controls whether native installation is offered; manual guidance remains when it is unavailable.

An installed app belongs to one exact origin. Every unique Vercel Preview host is a separate app with separate origin-bound browser state. For ongoing use, agree on a stable approved HTTPS test URL before asking friends to install. This implementation changes no domains, aliases, OAuth allowlists or Vercel settings.

## Google login and iOS

The existing Supabase SSR PKCE flow is preserved: same-window navigation, a cookie-backed verifier, same-origin `/auth/callback`, server-side `exchangeCodeForSession`, verified `/auth/session` after navigation and reload. There are no popup windows, custom URL schemes, account data in the manifest, tokens in install URLs, or token transfer between Safari and the installed app. Supabase's existing cookie defaults are SameSite=Lax; the callback is a top-level GET. The existing pageshow/focus/visibility verification and pagehide identity clearing continue to apply.

Safari and the home-screen app can have separate session containers depending on iOS version. Begin Google login from the installed app; do not assume a Safari login carries over. If the OS opens authentication in another browser container, verifier/session continuity requires real device verification; this must not be bypassed by exposing tokens or removing PKCE.

Before real device acceptance, the approved HTTPS host's exact `/auth/callback` must be allowed in Supabase. No changes to that allowlist are made here.

## Private data and caching

The v5 worker caches only exact public icon paths and `/_next/static/` resources with public image/font/CSS/JS MIME types. HTML navigations, `/login`, `/auth/*`, session responses, `/api/*`, Supabase/Google origins, all query-bearing URLs, RSC requests, Authorization-bearing requests, writes, redirects and private/no-store/no-cache responses bypass storage. Manifest remains network-fetched. Cache failure falls back to the network result; no offline private shell is served.

Activation retires only earlier `globetrotter-v<number>` asset caches, not other apps' caches, localStorage, account records or databases. Registration handles both early hydration and already-completed document load, with `updateViaCache: none`; `/sw.js` is served with no-store/no-cache. No private data is precached.

## Automated checks and limits

- Unit: manifest identity, image dimensions/opacity, five languages, Apple/standalone detection, cache restrictions and storage denial.
- Browser: real production Next routes and Service Worker, desktop/390/320 layouts, installation lifecycle (synthetic event), local synthetic OAuth service checking the actual S256 verifier, actual app callback and session cookies, refresh/logout/cancel, plus standalone feature emulation and unchanged legacy localStorage sentinels.
- The OAuth substitute uses only localhost, synthetic identities and short-lived synthetic tokens, and never connects to real Supabase or Google. These are not real RLS or iPhone Safari tests.
- Real iPhone Safari and Android Chrome installation, home-screen icons, OS authentication handoff and real account CRUD remain device acceptance items after a separately authorized Preview deployment.

Useful commands:

```sh
node --test --test-isolation=none scripts/test-pwa.mjs scripts/test-auth-cache.mjs scripts/test-google-auth.mjs
node scripts/generate-pwa-icons.mjs
TEST_URL=http://127.0.0.1:3095 SCREENSHOT_DIR=/tmp/pwa-shots node scripts/test-pwa-browser.mjs
```

The browser suite needs an isolated production build configured with the synthetic localhost Supabase URL `http://127.0.0.1:39999` and the non-secret placeholder `sb_publishable_browser_test_fixture`; it creates its own local mock service on port 39999. Never point that fixture at an actual account service. No real credentials are needed.
