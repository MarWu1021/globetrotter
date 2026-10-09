import raw from "@/data/airport-catalog/countries.json"
import type { CountryMapping, CountryPolicy } from "./types"

export const COUNTRY_MAPPINGS: readonly CountryMapping[] = raw
const byCode = new Map(COUNTRY_MAPPINGS.map((c) => [c.sourceCode, c]))
export function resolveCountry(code: string): CountryMapping | null {
  const c = byCode.get(code.toUpperCase())
  return c ? structuredClone(c) : null
}
export function requireStatisticalCountry(code: string, policy: CountryPolicy = {}): CountryMapping {
  const c = resolveCountry(code)
  if (!c?.isoCode || !c.statisticalId) throw new Error(`Non-ISO or unknown country requires review: ${code}`)
  if (c.requiresReview && !policy.approvedSpecialAreas?.includes(c.isoCode)) {
    throw new Error(`Special area requires explicit approval: ${code}`)
  }
  return c
}
/** The caller receives the approved map; existing localStorage is never accessed. */
export function legacyCountryMappings(policy: CountryPolicy = {}): Record<string, string> {
  const result: Record<string, string> = {}
  for (const c of COUNTRY_MAPPINGS) {
    if (!c.isoCode || (c.requiresReview && !policy.approvedSpecialAreas?.includes(c.isoCode))) continue
    for (const id of c.legacyGeoIds) {
      if (result[id] && result[id] !== c.isoCode) throw new Error(`Ambiguous geography: ${id}`)
      result[id] = c.isoCode
    }
  }
  return result
}
export function countryDisplayName(code: string, locale = "zh-TW"): string {
  if (code === "TW" && locale === "zh-TW") return "台灣"
  const c = resolveCountry(code)
  return c?.isoCode ? new Intl.DisplayNames([locale], { type: "region" }).of(c.isoCode) ?? c.name : c?.name ?? code
}
