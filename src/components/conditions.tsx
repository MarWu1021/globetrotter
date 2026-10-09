"use client"

import { localizeText } from "@/lib/localized-country"
import { useTravelStore } from "@/lib/store"
import { useWeather } from "@/lib/use-weather"
import {
  weatherDesc,
  climateZone,
  biome,
  season,
  isMonsoon,
} from "@/lib/weather"
import { Stat } from "@/components/panel-stats"

// Current local conditions for a coordinate — live weather (Open-Meteo) plus a
// coarse climate band. Shared by the country and place panels so conditions
// look identical everywhere. Renders nothing without coordinates.
const Conditions = ({
  lat,
  lng,
}: {
  lat: number | null
  lng: number | null
}) => {
  const locale = useTravelStore((s) => s.locale)
  const text = (value: string) => localizeText(value, locale)
  const weather = useWeather(lat, lng)
  if (lat == null || lng == null) return null
  const desc = weather ? weatherDesc(weather.code) : null
  const month = new Date().getMonth()
  const monsoon = isMonsoon(lat, lng, month)

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-dim)]">
        {text("Conditions")}
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label={text("Temperature")}
          value={
            weather
              ? `${Math.round(weather.tempC)}°C ${desc?.emoji ?? ""}`
              : "…"
          }
        />
        <Stat label={text("Humidity")} value={weather ? `${weather.humidity}%` : "…"} />
        <Stat
          label={text("Wind")}
          value={weather ? `${Math.round(weather.windKmh)} km/h` : "…"}
        />
        <Stat label={text("Sky")} value={weather && desc ? text(desc.label) : "…"} />
        <Stat label={text("Season")} value={text(season(lat, month))} />
        <Stat label={text("Climate (approx)")} value={text(climateZone(lat))} />
        <Stat label={text("Biome (approx)")} value={text(biome(lat, weather?.humidity))} />
        {monsoon && <Stat label={text("Rainy season")} value={text("Monsoon")} />}
        {weather?.elevationM != null && (
          <Stat
            label={text("Elevation")}
            value={`${Math.round(weather.elevationM)} m`}
          />
        )}
        {weather?.timezone && (
          <Stat label={text("Timezone")} value={weather.timezone.replace(/_/g, " ")} />
        )}
      </div>
    </section>
  )
}

export default Conditions
