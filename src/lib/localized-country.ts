import { getCountryInfo, type CountryInfo } from "@/lib/country-info"
import type { Locale } from "@/lib/store"
import zhText from "@/data/zh-TW-text.json"

const names = new Intl.DisplayNames(["zh-TW"], { type: "region" })
const territories: Record<string, string> = {
  "fr-guf": "法屬圭亞那", "us-ak": "阿拉斯加", "us-hi": "夏威夷",
  "es-ic": "加那利群島", "es-ib": "巴利阿利群島", "fr-cor": "科西嘉島",
  "fr-reu": "留尼旺", "fr-glp": "瓜德羅普", "fr-mtq": "馬丁尼克",
  "fr-myt": "馬約特", "it-sic": "西西里島", "it-sar": "薩丁尼亞島",
  "pt-mad": "馬德拉群島", "pt-azo": "亞速群島", "gb-eng": "英格蘭",
  "gb-sct": "蘇格蘭", "gb-wls": "威爾斯", "gb-nir": "北愛爾蘭",
}

export const countryName = (id: string, locale: Locale, fallback = id): string => {
  const info = getCountryInfo(id)
  return info ? infoName(info, locale, id) : localizeText(fallback, locale)
}

export const infoName = (info: CountryInfo, locale: Locale, id?: string): string => {
  if (locale === "fr") return info.nameFr || info.name
  if (locale !== "zh-TW") return info.name
  if (id && territories[id]) return territories[id]
  if (info.cca2 === "TW") return "台灣"
  return (info.cca2 ? names.of(info.cca2) : undefined) ?? localizeText(info.name, locale)
}

// Presentation only: geographic IDs and saved travel data stay unchanged.
export const localizeText = (text: string, locale: Locale): string =>
  locale === "zh-TW" ? (zhText as Record<string, string>)[text] ?? text : text
