"use client"

import { useMemo } from "react"
import { useT } from "@/lib/i18n"
import { useTravelStore } from "@/lib/store"
import { calculateFlightMileage } from "@/lib/trip-mileage"
import { useTripDraft } from "./trip-draft-provider"
import { TravelTile } from "./travel-illustration"
import styles from "./flight-mileage-card.module.css"

export default function FlightMileageCard() {
  const t = useT(), locale = useTravelStore(s => s.locale)
  const { savedTrips } = useTripDraft()
  const mileage = useMemo(() => calculateFlightMileage(savedTrips.trips), [savedTrips.trips])
  const available = savedTrips.ready
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  const laps = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const kilometers = !available || mileage.totalKm === null ? "—" :
    mileage.totalKm > 0 && mileage.totalKm < 1 ? `< ${number.format(1)}` : number.format(mileage.totalKm)
  const circles = !available || mileage.earthLaps === null ? "—" :
    mileage.earthLaps > 0 && mileage.earthLaps < .01 ? `< ${laps.format(.01)}` : laps.format(mileage.earthLaps)
  return <section className={styles.card} aria-label={t("mileage.title")}
    aria-busy={!available && !savedTrips.error}
    data-flight-mileage={available ? JSON.stringify(mileage) : undefined}>
    <header className={styles.header}>
      <h2>{t("mileage.title")}</h2><TravelTile kind="add" className={styles.plane} />
    </header>
    <p className={styles.distance}><span data-mileage-km>{kilometers}</span><span className={styles.unit}>km</span></p>
    <dl className={styles.details}>
      <div><dt>{t("mileage.legs")}</dt><dd data-mileage-legs>{available ? number.format(mileage.flightLegCount) : "—"}</dd></div>
      <div><dt>{t("mileage.laps")}</dt><dd data-mileage-laps>{circles}</dd></div>
    </dl>
    <p className={styles.caption}>{t("mileage.estimate")}</p>
    {!available && <p className={styles.notice} role="status">{t(savedTrips.error ? "mileage.unavailable" : "mileage.loading")}</p>}
    {available && savedTrips.error && <p className={styles.notice} role="status">{t("mileage.lastConfirmed")}</p>}
    {available && mileage.issues.length > 0 && <div className={styles.notice}>
      {mileage.excludedLegCount > 0 && <p>{t("mileage.excludedLegs", { n: number.format(mileage.excludedLegCount) })}</p>}
      {mileage.excludedTripCount > 0 && <p>{t("mileage.excludedTrips", { n: number.format(mileage.excludedTripCount) })}</p>}
      <details><summary>{t("mileage.details")}</summary>
      <ul>{mileage.issues.map((issue, i) => <li key={i}>
        <span>{issue.tripTitle || t("mileage.untitled")} · {issue.from || t("mileage.unknownAirport")} → {issue.to || t("mileage.unknownAirport")}</span>
        <span>{t(`mileage.reason.${issue.reason}`)}</span>
      </li>)}</ul>
      </details>
    </div>}
  </section>
}
