"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { useT } from "@/lib/i18n"
const Editor = dynamic(() => import("./trip-editor"), { ssr: false })

export default function TripComposer() {
  const [opened, setOpened] = useState(false), [loaded, setLoaded] = useState(false)
  const t = useT()
  return <>
    <button className="min-h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--panel-2)] px-4 py-3 font-semibold text-[var(--ink)]"
      onClick={() => { setLoaded(true); setOpened(true) }}>{t("trip.create")}</button>
    {loaded && <Editor open={opened} onClose={() => setOpened(false)} />}
  </>
}
