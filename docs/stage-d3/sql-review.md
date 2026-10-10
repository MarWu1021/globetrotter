# D3 SQL/RLS review preparation — NOT APPLIED

This document supersedes the D1 notes about permanently deleted country records.
Only review SQL, tests and documentation change. Google OAuth, the UI, storage keys,
Supabase, Vercel and both Git branches' remote state are untouched.
No SQL or authenticated database request has been executed in this preparation step.

## Changes for human review

- `001_stage_d1.sql` is an initial schema draft, NOT an incremental upgrade for an
  already-applied D1 schema. It creates objects in one transaction and intentionally
  fails on existing names. Never drop existing objects to make it run.
- Trips retain the existing `payload` shape (completed TripDraft, ordered stops and
  legs, airport snapshots), schema version 1 and permanent application tombstones.
- Countries additionally allow `last_operation='restore'`. The new
  `d1_restore_country(geo_id, expected_revision, mutation_uuid)` restores the existing
  status, notes and review; it does not accept replacement contents or an owner ID.
  It requires a current tombstone revision, a new UUID and the same owner. A subsequent
  normal save can re-mark/edit the restored record using the returned revision.
- The trigger only permits a country tombstone to become active through an explicit
  restore operation, retains its contents, and rejects restore of active records.
  No trip restore function or trip restore operation exists. Ordinary country save
  cannot implicitly restore. Old delete/create/restore retries cannot undo newer edits.
- All RPCs remain SECURITY INVOKER with empty search_path, auth.uid(), per-owner
  transaction advisory locks and row locks. Tables ENABLE/FORCE RLS, grant only
  SELECT/INSERT/UPDATE to authenticated, and deny client hard DELETE. Helpers have
  no elevated privileges or table access; PUBLIC/anon execution is revoked.
- Direct own-row REST writes remain possible under RLS and the version trigger.
  D3 must use RPCs consistently for exact latest-request replay behavior. This is not
  a claim that authenticated callers have RPC-only database access.

## Validation contract

SQL checks all required CatalogAirport/ AirportRevision fields, string types and
bounds, nullable city/IATA/ICAO/Wikipedia, coordinates, booleans, aliases/history,
UTC snapshot timestamps, unique stop/leg IDs, distinct source identities, adjacency,
no adjacent identical airport IDs, completed status and optional flight fields.
Dates may be absent or empty. Nonempty dates must be real YYYY-MM-DD Gregorian dates,
including leap-year rules. JavaScript UTF-16 string lengths and trim whitespace are
used, including non-BMP characters. It retains the original 2 MB UTF-8 JSONB payload
limit: this is a database resource limit, not the browser's whole-file character limit.

The 196 approved country codes are frozen from `src/data/airport-catalog/countries.json`.
A static parity test detects drift. Source country resolves case-insensitively, must
match the snapshot ISO country, and must already be approved; no territory folding,
new special-area approvals or country-change approvals are introduced. TW, AE, GR
and JP remain distinct. History entries with a changed/null country are rejected as
in the current default TypeScript policy. There is no airport master table: this is
snapshot validation, not proof that coordinates were signed by OurAirports.

JSONB cannot represent JavaScript unpaired Unicode surrogates or NUL strings. Duplicate
JSON object keys are normalized by JSONB. D3 must serialize validated normal snapshots,
validate before writes AND after reads, and surface invalid/oversized data errors.
Per-trip SQL does not enforce stop/flight ID uniqueness across different trips:
validate the complete account collection with the existing TypeScript rules too.
Country color, first-departure green, transit blue, green precedence and statistics
remain derived by the existing map/core functions. Do not persist a second color cache.

## Approved-execution sequence (requires FUTURE authorization)

1. Confirm the exact Supabase Free `globetrotter-dev` project and inspect whether the
   application table/function names already exist. Stop on a collision. Review the diff.
2. After separate approval, execute the whole `001` once as the schema administrator.
   This is the ONLY file with COMMIT. Browser application code uses publishable key +
   user Session; it needs neither service_role nor paid extensions/services.
3. Provision/select two dedicated test Auth users, with NO rows in either application
   table, including tombstones. Do not use real travelers. Their UUIDs are user IDs,
   not credentials; do not paste Session tokens into documents, Git or logs.
4. In a private SQL Editor copy of `002`, replace the two UUID placeholders and the
   confirmation value with `YES_DEDICATED_TEST_ACCOUNTS`. Do not commit those edits.
5. Run the WHOLE `002` in ONE session. BEGIN/ROLLBACK must remain. Setup checks use the
   SQL Editor role; application checks explicitly SET LOCAL ROLE authenticated/anon,
   set simulated JWT sub/claims, verify current_user/non-bypass role/row_security=on.
   This simulation is for a trusted SQL session, NOT a browser authentication method.
6. Any unexpected exception means FAIL. The transaction is aborted; issue ROLLBACK if
   the editor stops before the final line, never COMMIT. Do not rerun as administrator
   or disable RLS to make assertions pass. Verify the two users still have zero rows.

`002` prepares owner SELECT/INSERT/UPDATE, owner/foreign hard DELETE denial, cross-owner
SELECT/INSERT/UPDATE and RPC denial, anon CRUD/RPC denial on both tables, missing-sub
RPC denial, same IDs across owners, normal create/edit/delete, exact create/edit/delete
replay, changed-content UUID reuse, stale revisions, country restore/replay/re-mark,
restore content preservation, delayed mutation conflicts and forbidden trip resurrection.
Foreign UPDATE/restore attempts use valid revisions and target only random fixture IDs,
so revision triggers cannot silently stand in for correct RLS. Hard DELETE fails by
privilege denial. Invalid payload cases and optional blank/leap dates are included.
All written fixtures roll back; no localStorage or existing account data is used.

## Real concurrency procedure — NOT RUN

A single SQL transaction does not prove cross-connection races. First perform a
rollback-only contention check using TWO independent database sessions after approval:

1. Pick a fresh shared test trip ID, one dedicated test user and one valid fixture.
   Both sessions use BEGIN, SET LOCAL ROLE authenticated, row_security=on and the SAME
   simulated user sub. Do not use service_role clients. Prepare UUIDs privately.
2. Session A calls d1_write_trip to create revision 1 and leaves its transaction open.
3. Session B sets LOCAL lock_timeout='2s' and calls d1_write_trip for the SAME owner/ID
   (try both identical request UUID/payload and a different request). Expect lock timeout
   55P03 while A holds the advisory transaction lock, not an immediate duplicate row.
4. ROLLBACK B after the timeout, then ROLLBACK A. A's row must not survive.
5. In a fresh B transaction, the same create with expected revision NULL should now
   succeed at revision 1; ROLLBACK B. Check no fixture remains.
6. Repeat with d1_write_country. To exercise restore locking, A creates then soft-deletes
   a country in its uncommitted transaction; B's restore using its tombstone revision
   must wait/time out. After both roll back, restore must conflict because no row exists.
7. Verify another owner using the same logical ID is independently scoped. Do not use
   artificial deliberate hash collisions as an application requirement.

**Limit:** the above proves contention/rollback behavior, not visibility after COMMIT.
Proving two simultaneous edits of a committed row, or replay after another connection's
COMMIT, requires a committed throwaway fixture. It cannot honestly be proved by only
BEGIN/ROLLBACK sessions. That separate test requires explicit later authorization in a
throwaway test database or dedicated disposable test accounts, tracked fixture cleanup
and a guarantee that no real records are touched. It is NOT part of `002`, NOT currently
executed, and must not be reported as passed by static/fake tests.

Future authenticated HTTP tests must additionally verify real JWT role mapping, A/B/anon
isolation and RPC-only application usage; keep credentials in private process memory,
never output them. No test runner or database transport is implemented in this step.

## D3 frontend isolation checklist — design only, do not implement yet

- Never hydrate/import/upload `globetrotter:v1` or `globetrotter:trips:v1` into an account.
  Auth-configured mode must continue disabling the old trip repository. Do not clear keys.
- Separate account statuses/notes/reviews from persisted `useTravelStore` fields. Do NOT
  call reset/replaceData with cloud data: persist middleware would write into the old key.
  Locale/theme/layers/zoom preferences may remain browser preferences.
- Use account-scoped nonpersistent memory for trips AND country_records. Clear both,
  saved map/arcs/statistics, draft/candidate/preview, selectedId/private country panels
  and record details immediately on logout/account change/Auth expiry.
- Use generation/epoch guards and cancel requests; A's delayed replies cannot populate B.
  Re-check Safari pageshow/bfcache/focus. A network error is not an empty account result.
- List active rows with deleted_at IS NULL. Fetch an own-country tombstone revision only
  for an explicit restore flow; restore then save uses two acknowledged revisions.
- Save/remove/restore publish only confirmed server results; preserve edits on errors.
  Disable repeat submit; uncertain responses retry the SAME UUID/version or reconcile.
- Never silently overwrite stale revisions. Map SQLSTATE 40001 to conflict, 42501 to
  authorization failure, 23514/23502/22xxx to invalid data, timeouts to uncertain/network.
- Validate whole account collection; use existing savedTripMap/footprint/arc calculations.
  Filter deleted rows and never let unsaved content modify the permanent map.
- Private API/Session/callback/SSR responses remain private, no-store. Existing SW bypasses
  /auth, /api, RSC and cross-origin requests; never add Supabase/private offline caching.
- Preserve five languages, soft theme, globe/map/live-flight behavior. No Google Drive
  scopes, secret keys, local-data migration, SQL execution, cloud settings or deployment.

## Local verification (not live RLS)

Run `node --test scripts/test-sql-review.mjs` for static security/contract coverage and
TypeScript fixture checks. Existing tests remain mock/static, not PostgreSQL execution.
Optional offline grammar parsing uses pglast 8.5 installed in /tmp (not an app dependency):
`parse_sql` for each file and `parse_plpgsql` for CREATE FUNCTION/DO bodies. No server,
connection, migration, function evaluation or transaction execution is involved. Grammar
parsing cannot check actual role grants, schema binding or database runtime behavior.

Preparation verification results: existing 178 + new 18 = 196 Node tests passed,
0 failed/skipped. Five-language checks, TypeScript (`--noEmit --incremental false`),
ESLint and git diff whitespace checks passed. Offline grammar parsing passed for
001's 52 statements / 11 function bodies and 002's 56 statements / 16 DO bodies.
These results are NOT Supabase RLS, SQL runtime, HTTP ownership or concurrency results.
