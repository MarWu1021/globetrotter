# D2 Google Auth (implementation only, no deployment)

Uses public URL/publishable key only, `@supabase/ssr` browser/server clients and Google PKCE. Browser redirectTo is exactly current origin + `/auth/callback`; no Production URL or arbitrary `next` is accepted. Callback exchanges the code, uses generic errors, no credential logging, and redirects to its actual request Host (Next may normalize request.url to localhost internally). Malformed hosts and arbitrary query return destinations are rejected. Google secrets remain exclusively in Supabase Dashboard.

Next.js 16 `src/proxy.ts` refreshes cookies into both the forwarded request and response. `/auth/session` independently uses `getUser()` (not unverified local session contents) and returns only ID/email with private/no-store. Callback skips preliminary proxy verification so exchange retains its code verifier. Provider monitors Auth events, focus, pageshow (Safari back/forward cache), visibility and foreground checks, invalidates late responses and remounts editor/map draft state on account changes/logout/errors. Same-account refresh does not discard an active draft. Sign-out is local-device; failure is shown and must not be described as confirmed logout. SDK auth cookies are preserved/removed by SDK; legacy application localStorage is never cleared.

## D2 boundary
With Preview Auth configuration enabled, legacy trip repository is disabled: no reads, saves, deletes, imports or uploads of `globetrotter:trips:v1`. Login controls clearly state cloud trip storage is pending the following authorized stage. Route construction/search/map previews remain available; trip saving is disabled until the cloud repository is connected. With no Auth configuration, original local-only functionality remains available for development. Old manual country data are still browser-local, never attributed to an account or uploaded. Cloud country records are not connected in D2. No database/API trip CRUD is implemented.

SW cache upgraded to v3, old v2 caches removed, installation no longer precaches root HTML. Auth/private APIs/RSC remain excluded; configured root is private/no-store. Only public static assets may be shared-cached. No identity is embedded in root HTML. Offline session checks fail closed, rather than trusting old private data.

## Verification limits / next authorized Preview check
Pure/mocked tests do not prove live OAuth or Safari cookie behavior. No real environment values are read/output by tests. Browser tests use isolated contexts and mocked `/auth/session` identities, not actual Google accounts.

After separately approved commit/deployment: confirm exact Preview callback is allowed in Supabase; test real Google success, cancellation, retry, logout, fresh page/reload, account switch, expired session, iPhone Safari full-page redirect and installed PWA. Verify root/callback/session Cache-Control, refreshed cookies and no Cache Storage entries for private responses. Verify callback ends at same Preview origin, no Production redirect. Google login requires network; no offline login. No SQL/cloud dashboard/config changes or test-record uploads are required for this D2 implementation. Cloud storage remains a separately authorized next stage.

## File inventory

Added (11):
- `src/lib/auth/config.ts`, `client.ts`, `server.ts`, `flow.ts`
- `src/proxy.ts`
- `src/app/auth/callback/route.ts`, `src/app/auth/session/route.ts`
- `src/components/auth-provider.tsx`
- `scripts/test-google-auth.mjs`, `scripts/test-google-auth-browser.mjs`
- `docs/stage-d2/auth.md`

Modified (10):
- `package.json`, `package-lock.json`
- `public/sw.js`
- `src/components/travel-workspace.tsx`, `trip-composer.tsx`, `trip-draft-provider.tsx`, `trip-editor.tsx`, `trip-records.tsx`
- `src/lib/i18n.ts`
- `src/lib/trip-storage/repository.ts`

`npm run test:google-auth` uses no real accounts or settings. Browser suite requires a local build/server with an explicitly fictional public Supabase configuration and Playwright/Chromium, and mocks identities; it must never be pointed at real user data. Tests never authenticate against a real Google/Supabase account.

## D2 verification results

- 178/178 Node automated tests (159 existing + 19 Auth tests).
- Five-language checks, TypeScript, ESLint and optimized build pass.
- Mocked Auth browser workflow: 30 assertions across 1280px/390px/320px passed in development; the latest optimized production build also passes all 30 assertions on all three sizes (including pageshow/session restoration).
- Existing trip storage browser scenarios pass on desktop/390px/320px, including corrupt storage protection (separate isolated local-only contexts).
- Anonymous configured Session endpoint returns HTTP 200; cancelled callback returns HTTP 303 to the actual same Host; both private/no-store.
- No live Google login, real Supabase Auth token refresh, iPhone Safari/PWA cookie verification, or cloud trip CRUD has been performed. Those require the separately approved Preview and real-device validation.

Dependency note: the pinned Supabase JS SDK requires Node.js >=22. Current cloud checks use Node 24. Confirm Vercel build runtime meets this requirement when deployment is separately approved; no project runtime setting was changed here.
