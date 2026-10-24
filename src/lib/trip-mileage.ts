import { collectSavedFlightLegs } from "./saved-flight-legs"
import type { MileageIssue } from "./saved-flight-legs"
import type { SavedTrip } from "./trip-storage/core"
export type { MileageIssue, MileageIssueReason } from "./saved-flight-legs"

export const EARTH_CIRCUMFERENCE_KM = 40075
export interface FlightMileage {
  /** null means all available evidence was invalid, rather than an empty travel history. */
  totalKm: number | null
  earthLaps: number | null
  flightLegCount: number
  excludedLegCount: number
  excludedTripCount: number
  duplicateLegCount: number
  issues: MileageIssue[]
}
/** Mileage and rankings consume exactly the same validated, deduplicated saved legs. */
export function calculateFlightMileage(records: readonly SavedTrip[]): FlightMileage {
  const { legs, ...evidence } = collectSavedFlightLegs(records)
  const sum = legs.reduce((total, leg) => total + leg.distanceKm, 0)
  const totalKm = !legs.length && evidence.issues.length ? null : sum
  return { ...evidence, totalKm, earthLaps: totalKm === null ? null : totalKm / EARTH_CIRCUMFERENCE_KM,
    flightLegCount: legs.length }
}
