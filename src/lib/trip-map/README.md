# Saved map composition (stage C)

- Read-only adapter over `TripRepository` snapshots. The existing storage key is
  `globetrotter:trips:v1`; its version-1 file and embedded airport snapshots stay unchanged.
- Reuse 2A/2B draft validation, country derivation and arc descriptors. Only valid
  completed saved records contribute. Pending editor changes are never inputs.
- Resolve presence as manual visited or actual travel > transit > legacy base fill.
  Wishlist and Blocked remain independent saved preferences, as do notes/reviews.
  Travel coloring temporarily takes visual precedence; removing its last source restores
  the legacy preference. Explicit editor previews are a separate visual composition.
- Deduplicate recognized manual/trip countries by approved ISO mapping, including TW.
  Unresolved manual areas keep their original individual counting; special-area policy
  is unchanged. Existing 195-country percentage denominator and 100% cap are retained.
- Keep every flight descriptor. Render identical directed airport endpoints and
  coordinates once with `count` and all `{tripId,flightId}` references. Opposite
  directions and changed historical coordinates remain separate.
- Globe: committed solid schematic arcs, explicit preview dashed arcs; same theme token.
  Flat map: great-circle samples projected through d3's antimeridian clipping, no pointer
  capture. Route fitting occurs on committed route or viewport-size changes, not unsaved edits.
- Successful repository writes publish immediately. Storage events reload the existing
  validated repository; quota/access failures cannot publish edits, corrupt reads retain
  the last valid snapshot, and optimistic tokens prevent stale-tab overwrites.
- No data migration, legacy write, cloud service, authentication or deployment.

Verify: `npm run test:trip-map`; after build/start, optional installed Playwright + Chromium:
`TEST_URL=http://127.0.0.1:3011 node scripts/test-trip-map-browser.mjs`.
Real iPhone Safari/GPU and touch interaction still require physical-device acceptance.

Visual test readiness: `test-trip-visual-browser.mjs` observes completed renderer
frames in its isolated browser context, including the actual polygon cap materials,
camera position and drawing-buffer dimensions. It requires a new frame matching
all current preview colors and the requested airport camera before freezing and
sampling the screenshot at the projected inland coordinate. Browser RAF callbacks
alone are not WebGL readiness. The original four-pixel color assertion is unchanged.
A controlled stale-frame case verifies two RAF callbacks can complete while the
old camera frame remains and fails that assertion; the readiness barrier must then
recover without fixed delays. Diagnostics/screenshots are written only under `/tmp`.
