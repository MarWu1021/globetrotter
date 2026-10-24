# Saved-trip ordering and travel rankings

These are read-only derived views of the current account's confirmed saved trips. No schema,
trip format, storage key, RPC, authentication or country footprint policy changes are needed.

## Travel records

- Departure is the **first route leg's** valid `YYYY-MM-DD` date. A later dated leg cannot fill
  a missing departure date, and crossing the date line cannot reorder the route.
- Default: date descending. Also offer date ascending and the existing update-time descending
  behavior. Equal keys keep input order; undated trips come last in both date directions.
- Search filters title, airport name/city/IATA/ICAO and recorded airline before sorting.
  Existing country status filters and country sorting stay unchanged.
- Dates display using UTC calendar formatting so a browser timezone cannot move them one day.

## Statistics

`collectSavedFlightLegs` is the single validator/deduplicator used by mileage and rankings.
Only completed confirmed records contribute. Invalid references, identities or coordinates
are excluded; a conflicting copy of one leg ID is never resolved by arbitrary input order.
Distinct flight IDs on repeated routes remain independent flights.

**Airport ranking counts endpoints**, per the new product rule: TPE → DXB → ATH contributes
TPE 1, DXB 2, ATH 1. This intentionally differs from the original airport-stop footprint,
which still counts a continuous DXB stop once. Country and stop-event statistics are unchanged.

Airports group by OurAirports stable source ID, never just name or IATA. Display metadata comes
from the newest saved source snapshot. Conflicting identities or equally recent contradictory
metadata produce exclusions and a notice. No full airport catalog is shipped to the browser.

Airlines match exact IATA, English/Chinese catalog name, explicit alias, or the existing saved
`CODE · Name` format. Unknown strings are excluded rather than fuzzily guessed. Separate
operating subsidiaries stay separate. Replayed aliases for one leg count once; contradictory
carriers for that leg exclude only its airline contribution, not valid mileage/airport uses.
Missing, unidentified and conflicting airline data have separate notices.

Counts sort descending with stable ID ties; top five are shown initially, with “show all”.
The tab list supports arrow keys, Home and End. All labels exist in the five current languages.

## Account and write safety

UI reads `useTripDraft().savedTrips`, which in authenticated mode is the existing account-scoped
confirmed snapshot. Failed saves, unsaved editing and visual animation arcs do not contribute.
Account switches, loading and logout reuse existing snapshot clearing guards. No old local
travel data is read, uploaded, migrated or removed.

## Validation

- `npm run test:travel-rankings`: date ordering/filtering, endpoint counts, identity normalization,
  airline normalization/conflicts, immutable inputs, confirmed CRUD and account-isolation doubles.
- Existing mileage cases validate that extracting the shared collector preserves its behavior.
- `node scripts/test-travel-rankings-browser.mjs`: real Chromium, 1280/390/320 widths, actual sort
  and tab controls in five languages, top-five/all, cloud CRUD/session **response doubles**, reload,
  stale/empty account state, logout and unchanged seeded local travel data.
- Browser fixtures must use fake public environment values and run only against localhost. They
  do not prove live Supabase RLS, Google OAuth or native iPhone Safari behavior.

## Changed files

| Area | Files |
| --- | --- |
| Shared leg evidence and derived totals | `src/lib/saved-flight-legs.ts`, `src/lib/trip-mileage.ts`, `src/lib/travel-rankings.ts` |
| Date ordering and search | `src/lib/trip-records-order.ts`, `src/components/trip-records.tsx` |
| Ranking interface | `src/components/travel-rankings.tsx`, `src/components/travel-rankings.module.css` |
| Desktop/mobile integration | `src/components/sidebar.tsx`, `src/components/mobile-navigation.tsx` |
| Five languages | `src/lib/i18n.ts` |
| Tests and test command | `scripts/test-travel-rankings.mjs`, `scripts/test-travel-rankings-browser.mjs`, `package.json` |
| Documentation | `docs/features/travel-rankings.md` |

## Results for this implementation

- 383/383 automated tests passed, including 31 new ordering/ranking tests and the existing
  mileage, travel models, airport catalog, auth, storage, maps and PWA regressions.
- 54/54 new browser groups: 1280px desktop, 390px and 320px; all five locales, sort/search,
  ranking tabs/top five/all, confirmed CRUD, rejected save, reload, account switch and logout.
- 42/42 existing mileage browser regression groups passed on the three sizes.
- 6/6 additional browser groups: unavailable damaged account response and successful recovery
  after a corrected reload on each size. No false zero or example rows are shown.
- TypeScript, ESLint (no warnings), five-language checks and production builds passed.
- Browser sessions and account API responses were isolated test doubles. This does not verify
  live Google/Supabase/RLS or native iPhone Safari. Screenshots use synthetic test records.
- Screenshots are outside the repository in `/workspace/globetrotter-ui-review/`:
  `globetrotter-rankings-{1280,390,320}-{dates,airports,airlines}.png`.
- No commit, push, deployment, production/domain change, database operation or legacy-data
  migration was performed. Changes remain uncommitted on `work`.
