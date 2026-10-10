# Stage D1 — review only

Current baseline: work 2a64e7b8f5f021e2333e1e1f36d2ffb16761a4f5.
No SDK, credentials, real Auth/callback routes, database connection or UI wiring is added in D1.
Local TripRepository, globetrotter:v1 and globetrotter:trips:v1 remain unchanged.
There is no import, merge, backup, upload or automatic local-data reset.

## Cloud contracts

`contracts.ts` defines asynchronous trip/country repositories; `fake.ts` is an in-memory
trip test double, NOT an implementation of Supabase Auth or proof that RLS works.
`session.ts` is an unmounted session state machine. Never provide an untrusted form's
user ID to the future transport. Derive ownership from verified Auth; Supabase RLS is
mandatory even if server code checks ownership. Session reads never import browser tests.

Cloud rows map payload/created_at/updated_at to the existing SavedTrip and add revision.
Use `validSavedDraft` and `previewTripDraft` before writes AND after reads; validate the
entire fetched collection for reused event/flight IDs. SQL also guards completed route
shape/adjacency/identity/coordinates/size, but is not a replacement for complete TS
airport metadata/date/country mapping validation. Never guess ISO/territory mappings.
Same savedTripMap computes both maps, arcs, manual+travel union, and counts. No cloud
country color or statistics cache is persisted. A stored airport snapshot remains historical.

`trips` stores each entire completed trip atomically as JSONB (schema_version=1).
`country_records` stores manual state, notes and reviews by existing geo_id; no automatic
ISO guesses. User ID is an Auth FK; composite PKs scope IDs to owners. Active-row indexes
serve owner/order queries. RLS grants SELECT/INSERT/UPDATE only to the row owner.
Deleted rows are tombstones (`deleted_at`), NOT visible trips; physical DELETE is not
available to clients. Tombstones prevent delayed retries recreating deleted IDs. Retained
payloads consume quota; permanent erasure/account removal requires a later approved policy.

Review SQL: `sql/review/001_stage_d1.sql`. Not applied; it fails if names already exist.
No secrets, no paid extensions, no service_role dependency. RPCs are SECURITY INVOKER
with fixed search_path, auth.uid(), per-owner advisory transaction locks, row locks and
revision checks. Concurrent inserts serialize. request UUID + last expected revision +
operation + payload identify a repeat; mismatched reuse is a conflict. Replays older than
another mutation are conflicts, not permanent idempotency receipts. There is no automatic
retry queue. Identity/created_at immutable; DB owns timestamps; clients supply next revision.

## Auth architecture for D2/D3 (not implemented)

- Future dependencies: @supabase/supabase-js + @supabase/ssr, version pinned after review.
- Browser client plus request-scoped server client; Next.js 16 proxy.ts forwards refreshed
  cookies AND no-store response headers. Check verified getClaims/getUser on server;
  cookie getSession alone is not authorization. Never log tokens or auth code/query strings.
- /auth/callback exchanges the PKCE code exactly once; only same-origin validated return
  paths are accepted. Cancelled/expired/wrong-origin requests produce translated errors.
- Start OAuth through full-page navigation to Google, using origin + /auth/callback;
  stay on the same approved Preview origin for code verifier cookies. No popup/iframe.
- Only openid/email/profile scopes. No Google access/refresh token persistence.
- Session loading must not briefly render local test footprints. Guest maps are public;
  private saving requires Auth. Keep unsaved guest editor in memory through login via an
  explicitly designed return flow; if redirect loses it, warn before navigation. No automatic
  localStorage import or upload. No private offline queue/cache in this first version.
- Separate view preferences (locale/theme) from account country records. The future account
  path must not hydrate old statuses/notes/reviews into private data or write them on signout.
- Session phases: signed-out, authenticating, loading, ready, syncing, error, signing-out.
  All loading/account changes clear private trips immediately. Epoch cancels stale results.
  UI clears private countries, selected private panels, draft and preview on logout too.
- Logout scopes to this device (local); other devices remain signed in. Clear UI immediately;
  SDK/callback-cookie clearing and remote revocation outcomes must be tested. Failed logout
  cannot be reported as successful remote revocation. Re-check Safari pageshow/bfcache.

## Mutation and synchronization

Async save disables repeat clicks, preserves draft on failure and publishes only confirmed
rows. Timeout after a write is `uncertain`, not success; retry uses the SAME request UUID
and expected revision, or refetch/reconcile. 40001 => conflict, 42501/Auth expiry => login,
23514 => invalid, and transport unavailable => network/uncertain as appropriate.
Never change formal footprint on a failed or unconfirmed write. Supabase-returned payload
must be validated. List/loading failures must not pretend the account has no data.

Initial sync: login/refocus/pageshow/online + bounded foreground polling (e.g. 30s) and
manual refresh. No guarantee of instantaneous cross-device Realtime; optional later.
Unsaved edits keep expected revision through refresh. No last-write-wins overwrite.
Account-keyed memory only; late requests cannot repopulate logout/account-switch UI.

## Cache preparation

SW bypasses /auth, /api, RSC and non-public dynamic routes, only caches approved static
assets and the anonymous root shell when response headers permit it. Callback and private
responses must use `Cache-Control: private, no-store` in D2. An authenticated root MUST
also be no-store, or return only a public shell; do not SSR private trips into cached HTML.
HTTP headers do not themselves prevent custom SW caches: both protections are required.
D2 should bump the app-owned shell cache version before Auth rollout; do not touch localStorage.
Vercel must not cache cookie-setting or private Auth responses; verify callback/refresh headers.

## Validation boundary

D1 tests exercise fake ownership, mutations, revisions, repeats, failures, stale-session
results, real map calculations, and SW routing/header behavior. Static SQL checks catch
policy/contract mistakes but cannot prove runtime PostgreSQL/RLS. After separate approval,
D2 requires two real test Auth users and live SQL/API RLS tests. No D1 test connects to a
real database or reads tokens. Browser/Safari login/session tests belong to D2/D4.

Prepared live test script: `sql/review/002_stage_d1_rls_checks.sql` (NOT RUN).
Requires two existing TEST Auth user IDs and approved schema; checks owner create/replay,
stale revision, spoofed ownership, foreign read/update/delete, tombstone and anonymous access,
then rolls back fixture writes. SQL Editor's admin privileges alone are never an RLS test.
Remaining D2 checks include parallel RPC calls and real authenticated HTTP requests.

D1 verification commands: node --test scripts/test-{travel-core,airport-data,trip-draft,trip-globe,trip-storage,trip-map,cloud-trips,auth-cache}.mjs;
npm run test:i18n; npx tsc --noEmit; npm run lint; npm run build.
Final D1 result: 122 existing + 20 cloud/state/SQL-contract + 17 worker-cache tests,
159 passed, 0 failed/skipped; i18n/type/lint/production build passed.
No real SQL/RLS, Google login, Supabase synchronization or Safari Auth test has run.
The existing 19 WebGL/browser groups are not rerun for D1; no map/editor UI is changed.
