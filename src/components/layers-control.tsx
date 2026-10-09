"use client"

import { useTravelStore } from "@/lib/store"
import { localizeText } from "@/lib/localized-country"
import { LAYERS } from "@/lib/transport"

// Floating toggles for the travel-gateway overlays (airports / stations /
// ports). All off by default; each layer's points are drawn on both the flat
// map and the globe only while its toggle is active.
const LayersControl = () => {
  const locale = useTravelStore((s) => s.locale)
  const layers = useTravelStore((s) => s.layers)
  const toggleLayer = useTravelStore((s) => s.toggleLayer)

  return (
    <div className="absolute bottom-[calc(76px+env(safe-area-inset-bottom))] left-3 right-3 z-10 flex flex-wrap gap-1 rounded-2xl border border-[var(--border)] bg-[var(--panel)]/90 p-1.5 shadow-lg backdrop-blur md:bottom-5 md:left-5 md:right-auto md:flex-col md:gap-1.5">
      {LAYERS.map((layer) => {
        const on = layers[layer.id]
        return (
          <button
            key={layer.id}
            onClick={() => toggleLayer(layer.id)}
            aria-pressed={on}
            className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium text-[var(--ink)] transition-colors"
            style={{ background: on ? `${layer.color}22` : "transparent" }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full border"
              style={{
                background: on ? layer.color : "transparent",
                borderColor: layer.color,
              }}
            />
            {localizeText(layer.label, locale)}
          </button>
        )
      })}
    </div>
  )
}

export default LayersControl
