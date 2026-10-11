"use client"

import { useAccount } from "./account-provider"
import { AuthControls } from "./auth-provider"
import dynamic from "next/dynamic"
import { useTripDraft } from "./trip-draft-provider"
import { useT } from "@/lib/i18n"
const Editor = dynamic(() => import("./trip-editor"), { ssr: false })
const Records = dynamic(() => import("./trip-records"), { ssr: false })

export default function TripComposer() {
  const { draft,savedDraftJSON,newTrip,setOpened,setPicking,setStarted,setRecordsOpen } = useTripDraft()
  const t = useT()
  const account=useAccount()
  return <><AuthControls />
    {account.enabled && <div className="my-2 space-y-2 text-sm" aria-live="polite">
      {account.snapshot.busy && <p>{t('cloud.syncing')}</p>}
      {account.snapshot.error && <p role="alert">{t(`cloud.error.${account.snapshot.error}`)}</p>}
      <button className="min-h-11 w-full rounded-lg border border-[var(--border)] px-3 py-2" disabled={!account.snapshot.userId || account.snapshot.busy} onClick={()=>void account.reload()}>{t('cloud.refresh')}</button>
    </div>}

    <button className="min-h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--panel-2)] px-4 py-3 font-semibold text-[var(--ink)]"
      onClick={() => { if(!draft.stops.length || savedDraftJSON===JSON.stringify(draft))newTrip();else {setStarted(true); setPicking(false); setOpened(true)} }}>{t("trip.create")}</button>
    <button className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border)] px-4 py-3 font-semibold"
      onClick={()=>{setPicking(false);setRecordsOpen(true)}}>{t("trip.records")}</button>
  </>
}

export function TripEditorHost() {
  const { editorVersion,started, opened, setOpened,recordsOpen,setRecordsOpen } = useTripDraft()
  return <>{started && <Editor key={editorVersion} open={opened} onClose={()=>setOpened(false)} />}{recordsOpen && <Records onClose={()=>setRecordsOpen(false)} />}</>
}
