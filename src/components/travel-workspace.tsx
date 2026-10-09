"use client"

import { useEffect, useRef, useState } from "react"
import Sidebar from "@/components/sidebar"
import MapStage from "@/components/map-stage"
import { useTravelStore } from "@/lib/store"
import { useT } from "@/lib/i18n"

export default function TravelWorkspace() {
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const t = useT()

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)")
    if (mobile.matches) useTravelStore.getState().setView("globe")
    const onResize = () => {
      if (!mobile.matches) setOpen(false)
    }
    mobile.addEventListener("change", onResize)
    const unsubscribe = useTravelStore.subscribe((state, previous) => {
      if (state.selectedId && state.selectedId !== previous.selectedId)
        setOpen(false)
    })
    return () => {
      mobile.removeEventListener("change", onResize)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
      if (event.key !== "Tab") return
      const elements = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button, input, textarea, select, a[href], [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length && !element.matches(":disabled"))
      const first = elements[0]
      const last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      previous?.focus()
    }
  }, [open])

  return (
    <div className="grid h-dvh min-w-0 grid-cols-1 grid-rows-1 overflow-hidden md:grid-cols-[340px_1fr]">
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/45 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        ref={panel}
        id="travel-panel"
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? t("mobile.travels") : undefined}
        className={`${open ? "fixed inset-x-0 bottom-0 z-50 flex h-[80dvh] flex-col rounded-t-3xl border-t border-[var(--border)] bg-[var(--panel)] shadow-2xl" : "hidden"} min-h-0 min-w-0 md:static md:z-auto md:block md:h-full md:rounded-none md:border-0 md:shadow-none`}
      >
        <div className="flex shrink-0 items-center justify-between px-5 py-3 md:hidden">
          <span className="font-semibold text-[var(--ink)]">{t("mobile.travels")}</span>
          <button
            onClick={() => setOpen(false)}
            aria-label={t("close")}
            className="min-h-11 min-w-11 rounded-full border border-[var(--border)] text-[var(--ink)]"
          >✕</button>
        </div>
        <div className="min-h-0 flex-1 pb-[env(safe-area-inset-bottom)] md:h-full md:pb-0">
          <Sidebar />
        </div>
      </div>
      <div className="min-h-0 min-w-0" inert={open} aria-hidden={open || undefined}>
        <MapStage />
      </div>
      <button
        ref={trigger}
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="travel-panel"
        className="fixed inset-x-4 bottom-[calc(12px+env(safe-area-inset-bottom))] z-30 min-h-11 rounded-2xl border border-[var(--border-strong)] bg-[var(--panel)] px-4 py-3 font-semibold text-[var(--ink)] shadow-lg md:hidden"
      >
        {t("mobile.travels")}
      </button>
    </div>
  )
}
