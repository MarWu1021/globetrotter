# Travel core — phase 2A

This module is intentionally disconnected from the running app. It imports no
React, Zustand, browser storage, network client, or Supabase code. Nothing reads,
clears, migrates, or overwrites `globetrotter:v1` (or any other localStorage key).
The existing 1,175 transport points are not assumed to be valid Airport masters.

## Commands

From the repository root:

- `npm run test:travel-core`: Node's test runner compiles the real core TypeScript
  into memory using the already-installed TypeScript dependency. No emitted JS.
- `npx tsc --noEmit --incremental false`: independently checks all TypeScript.
- `npm run test:i18n`: existing language tests.
- `npm run lint`: existing ESLint check.

## Data and rules

`Trip.flights` is the ordered flight sequence. Flight endpoints reference
`AirportStop` IDs. Adjacent legs normally share their intermediate stop; splitting
it explicitly produces two events at the same airport without inventing a flight.
A later return visit always gets a different ID. Stop arrays need not be ordered;
initial departure is determined by the first flight, not the first stop in storage.

Only `completed` trips contribute to countries, airport usage or flown-route
counts. Dates never complete a trip. The first departure country's evidence is
always visited. Elsewhere `countryPresence` applies; visited beats transit. Airport
`usageKind` remains independent, so a connection with a landside excursion can
count as an airport transfer and a green country.

All trip graphs, including planned ones, are validated before derivation. An orphan,
foreign reference, reused event, disconnected route, invalid nature/date or duplicate
ID is an error, not a reason to silently omit evidence. These are complete-route
models (at least one flight); partially filled UI forms need a separate draft type.
An explicit ground-transfer model is outside phase 2A. Dates are calendar dates,
not UTC instants; times and timezone normalization are future work. Local dates
may go backwards across the international date line, so they do not validate route
chronology. Route order comes from explicit flight connections.

IDs come from the caller. Each airport needs an explicit country code and source
identity. Country code validation checks uppercase two-letter syntax, not geopolitical
classification or upstream accuracy. A reviewed source/catalog must enforce approved
ISO/statistical mappings before real data is accepted. TW remains TW; no parent-country
mapping is guessed. Codes may be absent or duplicated; they are not primary keys.
Historical airport snapshots and airport-data upgrades are future integration work.

`deriveFootprint` returns evidence-backed country states, totals, airport events,
rankings, directional route groups and independent copies of manual country records.
Wishlist, Blocked, notes and reviews coexist with derived presence. No palette or UI
is updated. `countryRecordsFromLegacy` only returns a proposed in-memory adapter result,
including note/review-only entries. Unresolved manual visited/transit mappings block
country derivation; original records remain intact. It is not a raw JSON parser or
an automatic migration. Import validation and approval belong to the later UI layer.

`buildTripFromRoute` produces n stops and n-1 legs. All optional leg fields can be
absent/blank. Callers performing route edits must prepare the new sequence, preserve
unchanged flight IDs/details, and explicitly resolve removed/changed leg metadata.
Never carry an old flight number onto a different leg automatically. Invalid edits
are rejected without touching the original graph. To delete a trip, remove it from
the calculation input; manual country records remain separate.

Merge is limited to consecutive arrival/departure events at one airport. The caller
supplies the resolved nature; differing notes require an explicit notes resolution.
Split applies only to a shared event and requires a new ID and explicit natures.
Both operations preserve flight IDs/details, return copies, and revalidate the graph.

Route groups retain individual records, distinguish directions, and sort dates with
undated records last. Arc descriptors retain per-flight identities and endpoints,
use a clamped haversine great-circle distance (including the date line/antipodes),
and bound schematic altitude. Preview descriptors are opt-in and never count as
flown routes. This module does not render arcs; depth occlusion, picking, labels and
iPhone Safari performance still require future WebGL integration tests.

## Deployment and persistence boundary

No schema, auth, cloud synchronization, deployment, or browser UI integration is
included. Later persistence must add ownership/RLS, atomic graph updates, revision
conflict detection and approved legacy merges. Whole-trip completion must only be
set after explicit user confirmation in that future interface. Never infer it from
the date or individually completed legs.
