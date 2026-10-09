/** Independent snapshot: deliberately not imported by the app or the old transport layer. */
import raw from "@/data/airport-catalog/airports.json"
import metadata from "@/data/airport-catalog/metadata.json"
import legacyAudit from "@/data/airport-catalog/legacy-audit.json"
import type { CatalogAirport } from "./types"
export const AIRPORT_CATALOG: readonly CatalogAirport[] = raw as CatalogAirport[]
export const AIRPORT_SOURCE_METADATA = metadata
export const LEGACY_AIRPORT_AUDIT = legacyAudit
