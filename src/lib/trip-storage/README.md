# Stage B — browser-local completed trips

`core.ts` validates an explicit version-1 envelope at **`globetrotter:trips:v1`**:

```text
{ version: 1, trips: [{ draft: TripDraft, createdAt: ISO timestamp, updatedAt: ISO timestamp }] }
```

Airport snapshots retain source IDs, ISO codes, coordinates, revision and historical fields. The storage layer does not import the 9,940-airport catalog into the client or guess countries. Complete route validation and preview calculations reuse stages 2A/2B/3A. Pending special areas stay blocked. Trip, stop and leg identities are retained through edits; a genuinely new trip receives a new ID and can repeat a previous route.

The UI creates only `completed` trips. The independent pure model still supports older statuses for its existing tests and future integrations; this storage format rejects incomplete trips. Unsaved edits are copied into page memory and do not write storage, country state or permanent footprints. Explicit map preview remains available. Saving exits preview. **Saved trips are not yet connected to persistent map colors, global country totals or saved route layers: stage C is deferred.**

`repository.ts` provides a stable React external-store snapshot. Construction/server rendering does not access browser storage. Hydration, retry and cross-tab events only read. A successful explicit save/delete publishes the validated file; failed writes never publish a success. Editing a saved trip copies it; before saving, both the file bytes and original record token are checked to prevent stale edits overwriting another tab. Same-ID saves update, repeated identical saves are idempotent, separate trip IDs preserve repeated travel.

Malformed JSON, unsupported versions, duplicate IDs, invalid coordinates/country mapping, mismatched legs, invalid dates and invalid field types block all writes. No automatic reset, partial import, cleanup or migration occurs. Corrupt bytes remain untouched. Quota/security failures retain all unsaved input and previous saved records. Limits: 500 trips, 100 stops per trip, serialized length at most 4,000,000 UTF-16 code units, bounded field/snapshot lengths. Browser quota may be lower; errors are handled rather than implying guaranteed capacity.

The read/check/write sequence is synchronous, but localStorage is not a cross-process transactional database. Conflict checks cover observed stale records/files; truly simultaneous writes from separate processes are not guaranteed serializable. Strong multi-device transactions belong to a later database phase.

No code here reads, transforms or writes the old `globetrotter` or `globetrotter:v1` keys. Existing country store/UI remains unchanged. Browser tests use isolated test fixtures and compare legacy bytes.

LocalStorage is scoped to the browser **and origin**. Another device, browser, private session or a different unique Preview hostname will not share these trips. Clearing site data removes them. This phase has no export/recovery UI, login or cloud backup. Retain damaged data for a future reviewed recovery step instead of clearing it.

Checks: `npm run test:trip-storage`; all existing unit/i18n suites; `npx tsc --noEmit`; `npm run lint`; `npm run build`. Against a local production server, run `node scripts/test-trip-storage-browser.mjs` plus the four existing editor/preview/globe/visual browser suites. Chromium iPhone-size emulation does not establish real iPhone Safari compatibility or hardware performance.
