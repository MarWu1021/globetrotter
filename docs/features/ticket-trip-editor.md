# Ticket-style trip editor

## Scope

The existing `TripDraft`/saved trip/SQL payload is unchanged. Cards edit the existing adjacent stop-event pairs. Airport search reuses the bounded `/api/airports` endpoint, locale aliases, review protection, debounce and cancellation. No new service or dependency is required.

Start from **My travel records → Add travel record** or the existing Create trip action. Choose departure and arrival using a card's airport control. Add next flight automatically starts at the last selected arrival. The search disclosure can also append an airport directly. Globe selection remains the existing explicit-confirmation flow and shares this same draft.

## Route integrity

- Each flight retains its independent optional date, airline, number and notes.
- Editing a shared connection airport updates both adjacent endpoints (the same stop event); it does not shift optional fields to another flight.
- Return reverses a valid outbound sequence, allocating fresh stop events. New return dates and every optional flight detail remain blank. A route already ending at its original departure cannot be mirrored again, because no outbound boundary is persisted.
- Reordering means moving an arrival in the continuous route, keeping the first departure fixed. Arbitrary disconnected flight-card ordering is not supported by the existing linear model.
- Reorder/delete require confirmation. Unchanged event pairs keep their metadata; newly connected pairs start blank. Undo restores the entire prior in-memory route (with confirmation if current editing would be replaced).
- Removing the first segment drops the original departure; removing any later segment drops its arrival. Removing the only flight clears its endpoints.
- Shared stops retain their existing separate airport-usage/country-presence behavior. Return visits create new usage events. No country, ranking or distance rule changes.

## Preview and persistence

Timeline and summary use the current draft. Country totals come from `previewTripDraft`; estimated distance comes from the existing `draftGlobePreview` → `buildArcDescriptors` great-circle calculation. No transfer duration is invented. Estimated distance is not an actual flown-track measurement.

Unsaved edits do not change confirmed map/statistic data. Existing authenticated repository acknowledgement, revision conflict, idempotent retry and account isolation remain in place. Save errors keep all fields and never trigger a success animation. No localStorage import, migration or cleanup is introduced.

## Layout and verification

At desktop width the flight cards are left and the timeline/summary right. Narrow layouts stack vertically; the existing native modal retains focus trapping and its safe-area footer. All new text is translated in the existing five dictionaries.

Pure helper tests: `scripts/test-trip-segments.mjs`.
Production-mode Chromium + isolated account response doubles: `scripts/test-ticket-editor-browser.mjs` (1280, 390, 320px). This is not real Google OAuth, live Supabase RLS or iPhone Safari certification.

## Files in this UX change

- `package.json`
- `scripts/test-cloud-data-browser.mjs`
- `scripts/test-isometric-browser.mjs`
- `scripts/test-presentation-browser.mjs`
- `scripts/test-soft-theme-browser.mjs`
- `scripts/test-travel-rankings-browser.mjs`
- `scripts/test-trip-editor-browser.mjs`
- `scripts/test-trip-globe-browser.mjs`
- `scripts/test-trip-map-browser.mjs`
- `scripts/test-trip-mileage-browser.mjs`
- `scripts/test-trip-preview-browser.mjs`
- `scripts/test-trip-storage-browser.mjs`
- `scripts/test-trip-visual-browser.mjs`
- `src/components/trip-editor.tsx`
- `src/components/trip-records.tsx`
- `src/lib/i18n.ts`
- `src/lib/trip-draft/segments.ts`
- `src/components/trip-editor.module.css`
- `scripts/test-trip-segments.mjs`
- `scripts/test-ticket-editor-browser.mjs`
- `docs/features/ticket-trip-editor.md`

The earlier uncommitted country-status work (`country-panel.tsx`, `test-trip-map.mjs`, `test-country-status-browser.mjs`, and its i18n strings) is preserved separately. Browser regression helpers were updated to open the airport-search disclosure and target the new card controls; their data/visual assertions were retained.

## Mobile compact revision

- Airports share one row at all supported widths; airport codes stay prominent, display names omit generic airport suffixes, and the full name/country remains in the control's accessible label and tooltip. No airport identity or saved value changes.
- Date and airline share a row. The autocomplete uses the same options and behavior; its long explanatory hint is screen-reader-only in compact mode.
- Arrival country presence stays outside the optional disclosure. Origin country behavior remains unchanged.
- Optional flight number/notes remain mounted. Empty new legs start collapsed. Opening a saved record with either field populated starts expanded; users may collapse it intentionally, with a filled-content indicator. Collapsing never clears values.
- Move/delete controls retain individual 44×44px targets, accessible names, tooltips and native keyboard activation.
- The timeline prioritizes route and date. Detailed footprint calculations are a secondary disclosure.
- The form body owns scrolling; the outer dialog does not scroll. Mobile keyboard handling uses Visual Viewport height/offset changes, preserves a safe-area footer, stops adjusting during pinch zoom, and removes its listeners/style variables when closed.

This revision changes `trip-editor.tsx`, `trip-editor.module.css`, `airline-autocomplete.tsx`, `use-editor-viewport.ts`, `i18n.ts`, this document, and the editor/cloud/storage browser regressions. `test-ticket-compact-browser.mjs` adds 320/390/430/1280px interaction/geometry checks, optional-data preservation after reopen and save, keyboard activation, five-language layout, simulated keyboard viewport/safe-area/zoom checks, and localStorage sentinels. Existing data-model, airline catalog, cloud repository and SQL remain unchanged.

Comparison measurements use the same route and first-leg date/airline, with optional fields initially empty. The previous production-mode fixture supplies before measurements/screenshots. Keyboard viewport and safe-area tests are explicit simulations inside Chromium, not real iPhone keyboard or Safari validation. All account transport responses are local doubles, not live Supabase writes.

The Visual Viewport handler also observes the actual form-body resize via ResizeObserver before revealing the focused control. This handles the layout update after a keyboard viewport event without sleeping. Both observers/listeners and pending animation frames are cleaned up on close.

Files touched in the compact revision:

- `src/components/trip-editor.tsx`
- `src/components/trip-editor.module.css`
- `src/components/use-editor-viewport.ts`
- `src/components/airline-autocomplete.tsx`
- `src/lib/i18n.ts`
- `scripts/test-ticket-compact-browser.mjs`
- `scripts/test-ticket-editor-browser.mjs`
- `scripts/test-trip-editor-browser.mjs`
- `scripts/test-trip-storage-browser.mjs`
- `scripts/test-cloud-data-browser.mjs`
- `docs/features/ticket-trip-editor.md`

### Compact revision acceptance results

- Full automated suite: 393 passed, 0 failed.
- Compact browser suite: 139 acceptance checks passed at 320, 390, 430 and 1280px, including five locales at 320px.
- Existing cloud UI browser suite: 13 groups passed at 390px, using account/API doubles (including actual SVG/WebGL map rendering).
- TypeScript, ESLint, five-language check and production build passed.

| Width | Before first-card height | Compact first-card height | Reduction |
| --- | ---: | ---: | ---: |
| 320px | 960px | 387px | 60% |
| 390px | 924px | 387px | 58% |
| 430px | 924px | 387px | 58% |
| 1280px | 610px | 411px | 33% |

Screenshots and raw geometry: `/workspace/globetrotter-ui-review/ticket-compact-20261025/`. These measurements cover the same first-leg date/airline and initially empty optional fields. Populated saved optional fields open by default and intentionally make that card taller.

Real iPhone Safari keyboard/safe-area behavior, live Google OAuth and live Supabase writes were not verified in this local revision. No commits, pushes, deployments, database operations, or data migrations were performed.

## Airline suggestion placement fix

The list is rendered through a React Portal directly inside the existing native dialog (not inside the clipping form scroller, and not outside the modal into the inert document). `use-airline-menu.ts` measures the input and intersects the form body, Visual Viewport and fixed footer. `airlines/placement.ts` chooses below if the full list fits, otherwise above or the side with more room, and constrains the height for internal scrolling. A minimum readable width is clamped to the available width. New query results stay hidden until their own placement is measured.

Scroll capture, viewport events and ResizeObserver update placement without timers. All observers/listeners and pending frames are removed on close. Focus stays in the combobox for pointer selection; ArrowUp/Down move the active option and scroll only the list, Enter commits the unchanged airline string, and Escape closes only the suggestions. Portal buttons are excluded from the modal's Tab wrap. No z-index-only workaround or saved-data change is used.

Additional files: `src/components/use-airline-menu.ts`, `src/lib/airlines/placement.ts`, `scripts/test-airline-footer-browser.mjs`, and placement cases in `scripts/test-airlines.mjs`. The browser cases verify hit testing and actual touch/mouse selection for Swiss International Air Lines, upper/middle/footer positions, list scrolling, simulated keyboard/safe-area, real viewport resize, keyboard selection, final-field visibility and acknowledged saved values.

### Current browser regression scope

The current signed-in/cloud application is covered by these full scripts (all default widths): Google auth flow, login routing, login design, UK map pixels/focus, cloud data UI, isometric UI, presentation/animations, ticket editor, compact ticket editor, travel rankings, flight mileage, airline/footer placement, and PWA with the local synthetic OAuth server. These use isolated contexts and synthetic sessions/API responses; no live Google or Supabase validation is claimed.

Seven earlier localStorage-era workspace scripts (`test-trip-map-browser`, `test-trip-preview-browser`, `test-trip-editor-browser`, `test-trip-visual-browser`, `test-trip-globe-browser`, `test-soft-theme-browser`, `test-trip-storage-browser`) remain intact as historical tests. They assume entry into an unauthenticated workspace/local repository, which the current auth gate deliberately forbids. Their supported current equivalents are covered by the cloud/map/editor suites and the unchanged local-storage/core unit tests. They are not counted as executed or passing in this release. The separate uncommitted country-status browser test also remains outside this release.

### Airline fix release validation (2026-10-25)

All 13 current browser regression scripts passed at their complete default width lists. Specific results include 44 airline placement groups (320/390/430/1280px), 139 compact-editor checks, 54 ranking groups, 42 mileage groups, 39 cloud UI groups and 35 PWA groups. Release-candidate unit tests: 398 passed (the separate uncommitted country-status work contributes 2 additional tests to the full working tree). TypeScript, five-language check, zero-warning ESLint and production builds passed. All OAuth/cloud browser results use local synthetic services or intercepted responses; actual iPhone Safari, Google login and Supabase CRUD remain manual follow-up checks.
