"use client"

import dynamic from "next/dynamic"
import { useTripDraft } from "./trip-draft-provider"
import { useT } from "@/lib/i18n"
const Editor = dynamic(() => import("./trip-editor"), { ssr: false })

export default function TripComposer() {
  const { setOpened, setPicking, setStarted } = useTripDraft()
  const t = useT()
  return <>
    <button className="min-h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--panel-2)] px-4 py-3 font-semibold text-[var(--ink)]"
      onClick={() => { setStarted(true); setPicking(false); setOpened(true) }}>{t("trip.create")}</button>
  </>
}

export function TripEditorHost() {
  const { started, opened, setOpened } = useTripDraft()
  return started ? <Editor open={opened} onClose={()=>setOpened(false)} /> : null
}
