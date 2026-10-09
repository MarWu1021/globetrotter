"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useTravelStore } from "@/lib/store"
import { useAdvisoryStore } from "@/lib/advisory-store"
import { useElementSize } from "@/lib/use-element-size"
import { useT, LOCALES, detectLocale } from "@/lib/i18n"
import { useFlightPoller } from "@/lib/flight"
import FlatMap from "@/components/flat-map"
import MapLoader from "@/components/map-loader"
import CountryPanel from "@/components/country-panel"
import FlightPanel from "@/components/flight-panel"
import ISSPanel from "@/components/iss-panel"
import MoonPanel from "@/components/moon-panel"
import SunPanel from "@/components/sun-panel"
import OceanPanel from "@/components/ocean-panel"
import PlacePanel from "@/components/place-panel"
import LayersControl from "@/components/layers-control"
import {
  GlobeIcon,
  MapIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
} from "@/components/icons"

const GlobeView = dynamic(() => import("@/components/globe-view"), {
  ssr: false,
  loading: () => <MapLoader />,
})

const ViewToggle = () => {
  const t = useT()
  const view = useTravelStore((s) => s.view)
  const setView = useTravelStore((s) => s.setView)
  const base =
    "flex min-h-11 items-center gap-1.5 px-2.5 py-2 md:min-h-0 md:px-3.5 rounded-full text-sm transition-colors cursor-pointer"
  const active = "bg-[var(--accent)] text-[var(--accent-ink)] font-semibold"
  const idle = "text-[var(--ink-dim)] hover:text-[var(--ink)]"
  return (
    <div className="inline-flex gap-1 rounded-full bg-[var(--panel)] p-1">
      <button
        className={`${base} ${view === "map" ? active : idle}`}
        onClick={() => setView("map")}
      >
        <MapIcon width={16} height={16} /> {t("view.map")}
      </button>
      <button
        className={`${base} ${view === "globe" ? active : idle}`}
        onClick={() => setView("globe")}
      >
        <GlobeIcon width={16} height={16} /> {t("view.globe")}
      </button>
    </div>
  )
}

const SpinToggle = () => {
  const t = useT()
  const autoSpin = useTravelStore((s) => s.autoSpin)
  const setAutoSpin = useTravelStore((s) => s.setAutoSpin)
  return (
    <label className="flex min-h-11 cursor-pointer select-none items-center gap-2 text-sm text-[var(--ink-dim)] md:min-h-0">
      <input
        type="checkbox"
        checked={autoSpin}
        onChange={(e) => setAutoSpin(e.target.checked)}
        className="accent-[var(--accent)]"
      />
      {t("autospin")}
    </label>
  )
}

const LanguageSelect = () => {
  const t = useT()
  const locale = useTravelStore((s) => s.locale)
  const setLocale = useTravelStore((s) => s.setLocale)
  const [open, setOpen] = useState(false)
  const current = LOCALES.find((l) => l.id === locale) ?? LOCALES[0]

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("language")}
        className="flex h-11 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel)] pl-2.5 pr-2.5 text-sm font-medium text-[var(--ink-dim)] hover:text-[var(--ink)] md:h-9"
      >
        <span className="text-base leading-none">{current.flag}</span>
        {current.short}
        <span className="text-[9px] opacity-70">▼</span>
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              style={{ transformOrigin: "top right" }}
              className="absolute right-0 z-40 mt-1.5 w-44 overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] py-1 shadow-2xl"
            >
              {LOCALES.map((l) => (
                <button
                  key={l.id}
                  onClick={() => {
                    setLocale(l.id)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--panel-hover)] ${
                    l.id === locale
                      ? "font-semibold text-[var(--accent)]"
                      : "text-[var(--ink)]"
                  }`}
                >
                  <span className="text-base leading-none">{l.flag}</span>
                  <span className="flex-1">{l.label}</span>
                  {l.id === locale && <span>✓</span>}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

const ThemeToggle = () => {
  const t = useT()
  const theme = useTravelStore((s) => s.theme)
  const cycleTheme = useTravelStore((s) => s.cycleTheme)
  const Icon =
    theme === "system" ? MonitorIcon : theme === "dark" ? MoonIcon : SunIcon
  return (
    <button
      onClick={cycleTheme}
      aria-label={t("theme.toggle")}
      title={t(`theme.${theme}`)}
      className="grid h-11 w-11 place-items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--ink-dim)] hover:text-[var(--ink)] md:h-9 md:w-9"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="grid place-items-center"
        >
          <Icon width={17} height={17} />
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

const Compass = () => {
  const t = useT()
  const southUp = useTravelStore((s) => s.southUp)
  const toggleSouthUp = useTravelStore((s) => s.toggleSouthUp)
  return (
    <button
      onClick={toggleSouthUp}
      title={t("compass")}
      aria-label={t("compass")}
      className="absolute right-5 top-20 z-10 text-[var(--ink-dim)] opacity-50 transition-[opacity,transform] duration-500 hover:opacity-90"
      style={{ transform: southUp ? "rotate(180deg)" : "rotate(0deg)" }}
    >
      <svg
        width="52"
        height="52"
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
      >
        <circle cx="50" cy="50" r="46" strokeWidth="1.5" opacity="0.5" />
        <circle cx="50" cy="50" r="37" strokeWidth="2" />
        <g strokeWidth="2" strokeLinecap="round">
          <line x1="50" y1="5" x2="50" y2="15" />
          <line x1="50" y1="85" x2="50" y2="95" />
          <line x1="5" y1="50" x2="15" y2="50" />
          <line x1="85" y1="50" x2="95" y2="50" />
        </g>
        <path
          d="M50 20 L57 50 L50 80 L43 50 Z"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M50 20 L57 50 L43 50 Z" fill="currentColor" stroke="none" />
        <text
          x="50"
          y="14"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="currentColor"
          stroke="none"
        >
          N
        </text>
      </svg>
    </button>
  )
}

const MapStage = () => {
  const view = useTravelStore((s) => s.view)
  const [ref, size] = useElementSize<HTMLDivElement>()
  const locale = useTravelStore((s) => s.locale)
  useEffect(() => { document.documentElement.lang = locale }, [locale])
  const ready = size.width > 0 && size.height > 0
  useFlightPoller()

  useEffect(() => {
    useTravelStore.getState().autoLocale(detectLocale())
    useAdvisoryStore.getState().load()
  }, [])

  return (
    <main
      className="map-stage relative flex h-full min-h-0 min-w-0 flex-col pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-0"
      style={{ background: "var(--stage)" }}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 pb-2 pt-[max(8px,env(safe-area-inset-top))] md:flex-nowrap md:gap-3 md:px-4 md:py-3.5">
        <ViewToggle />
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {view === "globe" && <SpinToggle />}
          <LanguageSelect />
          <ThemeToggle />
        </div>
      </div>

      <div ref={ref} className="relative min-h-0 flex-1">
        {!ready && <MapLoader />}
        {ready && (
          <>
            {/* Flat map stays mounted (cheap SVG) and just hides under the
                globe. The globe is mounted ONLY while it's the active view and
                unmounts on leave — so its WebGL render loop never runs in the
                background slowing the tab, and flat-map-only users never load
                three.js at all. */}
            <div
              className="absolute inset-0"
              style={{ visibility: view === "globe" ? "hidden" : "visible" }}
            >
              <FlatMap size={size} />
            </div>
            {view === "globe" && (
              <div
                className="absolute inset-0"
                style={{
                  // The globe always floats in dark space — dramatic in both
                  // themes, and a pale light-theme globe pops against it. The
                  // flat map keeps the themed stage behind this div.
                  background:
                    "radial-gradient(circle at 50% 28%, #1b2c52 0%, #090e1d 72%)",
                }}
              >
                <GlobeView size={size} />
              </div>
            )}
          </>
        )}
      </div>
      {view === "map" && <Compass />}
      {ready && <LayersControl />}
      <CountryPanel />
      <FlightPanel />
      <ISSPanel />
      <MoonPanel />
      <SunPanel />
      <OceanPanel />
      <PlacePanel />
    </main>
  )
}

export default MapStage
