"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useT } from "@/lib/i18n"
import { useTravelStore } from "@/lib/store"
import { GlobeIcon } from "@/components/icons"

// A small "About" trigger + modal explaining why Globetrotter exists — a
// passion project living between planning your travels and learning the world.
const About = () => {
  const t = useT()
  const locale = useTravelStore((s) => s.locale)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`${t("about")} Globetrotter`}
        title={`${t("about")} Globetrotter`}
        className="flex h-7 shrink-0 items-center rounded-full border border-[var(--border)] px-2.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[var(--ink-dim)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        {t("about")}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <div
              className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ scale: 0.96, y: 6, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 34 }}
              className="relative flex w-[min(460px,94vw)] flex-col gap-4 rounded-2xl border border-[var(--border-strong)] bg-[var(--panel)] p-6 shadow-2xl"
            >
              <header>
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
                  ✦ {t("about")}
                </p>
                <h2 className="font-display mt-1.5 flex items-center gap-2.5 text-2xl font-semibold">
                  <GlobeIcon
                    width={26}
                    height={26}
                    className="text-[var(--accent)]"
                  />
                  Globetrotter
                </h2>
              </header>

              <div className="flex flex-col gap-3 text-sm leading-relaxed text-[var(--ink-dim)]">
                {locale === "zh-TW" ? <>
                  <p>Globetrotter 來自對地圖的熱愛：用手指探索世界，想著下一趟旅行要去哪裡。</p>
                  <p>在這裡規劃旅程、認識世界。記下走過的國家、收藏想去的地方，也能探索海洋、機場、國際太空站與月球，保持對世界的好奇。</p>
                  <p>獻給每位旅行者與喜歡探索的人。🌍</p>
                </> : <>
                <p>
                  Globetrotter began with a simple love of maps — the kind you
                  trace with a finger, wondering <em>“where next?”</em>
                </p>
                <p>
                  It lives between two joys:{" "}
                  <strong className="text-[var(--ink)]">planning</strong>
                  {" the journeys you'll take, and the "}
                  <strong className="text-[var(--ink)]">knowledge</strong>
                  {
                    " of the world you haven't seen yet. Tag where you've been, dream up where you're going, and wander the oceans, airports, the ISS passing overhead and the Moon's shadow — just to stay curious."
                  }
                </p>
                <p>
                  Built with care, for travellers and the endlessly curious
                  alike. 🌍
                </p>
                </>}
              </div>

              <button
                onClick={() => setOpen(false)}
                className="self-end rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--ink-dim)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink)]"
              >
                {t("close")}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default About
