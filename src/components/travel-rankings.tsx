"use client"

import { useId, useMemo, useRef, useState } from "react"
import { useT } from "@/lib/i18n"
import { useTravelStore } from "@/lib/store"
import { airportChinese } from "@/lib/airport-data/localization"
import { calculateTravelRankings } from "@/lib/travel-rankings"
import { useTripDraft } from "./trip-draft-provider"
import styles from "./travel-rankings.module.css"

export default function TravelRankings() {
  const t = useT(), locale = useTravelStore(s => s.locale), { savedTrips } = useTripDraft()
  const rankings = useMemo(() => calculateTravelRankings(savedTrips.trips), [savedTrips.trips])
  const [tab, setTab] = useState<"airports" | "airlines">("airports")
  const [expanded, setExpanded] = useState(false)
  const id = useId(), buttons = useRef<(HTMLButtonElement | null)[]>([])
  const rows = tab === "airports" ? rankings.airports : rankings.airlines
  const number = new Intl.NumberFormat(locale)
  const changeTab = (next: typeof tab) => { setTab(next); setExpanded(false) }
  const notices: [string, number][] = [
    ["excludedLegs", rankings.excludedLegCount], ["excludedTrips", rankings.excludedTripCount],
    ["airportConflicts", rankings.airportConflicts], ["missingAirlines", rankings.missingAirlines],
    ["unknownAirlines", rankings.unknownAirlines], ["conflictingAirlines", rankings.conflictingAirlines]
  ]
  const visibleNotices = notices.filter(([key, n]) => n > 0 && (tab === "airlines" || !key.includes("Airlines")))
  return <section className={styles.card} aria-label={t("rankings.title")} aria-busy={!savedTrips.ready && !savedTrips.error}
    data-travel-rankings={savedTrips.ready ? JSON.stringify(rankings) : undefined}>
    <h2>{t("rankings.title")}</h2>
    <div className={styles.tabs} role="tablist" aria-label={t("rankings.title")}>
      {(["airports", "airlines"] as const).map((value, index) => <button key={value} ref={el => { buttons.current[index] = el }}
        type="button" role="tab" id={`${id}-${value}`} aria-controls={`${id}-panel`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
        onClick={() => changeTab(value)} onKeyDown={e => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return
          e.preventDefault()
          const next = e.key === "Home" ? 0 : e.key === "End" ? 1 : 1 - index
          changeTab(next ? "airlines" : "airports"); buttons.current[next]?.focus()
        }}>{t(`rankings.${value}`)}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0}>
      <p className={styles.caption}>{t(`rankings.${tab}.hint`)}</p>
      {!savedTrips.ready ? <p role="status" className={styles.notice}>{t(savedTrips.error ? "rankings.unavailable" : "mileage.loading")}</p> : <>
        {savedTrips.error && <p role="status" className={styles.notice}>{t("mileage.lastConfirmed")}</p>}
        {!rows.length && <p className={styles.empty}>{t(`rankings.${tab}.empty`)}</p>}
        <ol className={styles.list}>{(expanded ? rows : rows.slice(0, 5)).map((row, index) => {
          const airport = "airport" in row ? row.airport : null
          const airline = "airline" in row ? row.airline : null
          const name = airport ? locale === "zh-TW" ? airportChinese[airport.sourceId]?.name ?? airport.name : airport.name :
            locale === "zh-TW" ? airline!.zhTW : airline!.name
          const code = airport ? airport.iata ?? airport.icao ?? airport.ident : airline!.iata
          return <li key={row.id} data-ranking-id={row.id}>
            <span className={styles.place} aria-hidden="true">{number.format(index + 1)}</span>
            <div className={styles.identity}><span>{name}</span><small>{code}</small></div>
            <span className={styles.count} data-ranking-count={row.count}>{t("rankings.count", { n: number.format(row.count) })}</span>
          </li>
        })}</ol>
        {rows.length > 5 && <button className={styles.more} type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{t(expanded ? "rankings.topFive" : "rankings.showAll", { n: number.format(rows.length) })}</button>}
        {visibleNotices.length > 0 && <details className={styles.notice}><summary>{t("rankings.dataNotice")}</summary>
          {visibleNotices.map(([key, n]) => <p key={key}>{t(`rankings.${key}`, { n: number.format(n) })}</p>)}
        </details>}
      </>}
    </div>
  </section>
}
