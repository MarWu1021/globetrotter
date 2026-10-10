import type { Status, ResolvedTheme } from "@/lib/store"

// Status colours are deliberately separated on BOTH hue and lightness so they
// stay distinguishable under colour-vision deficiencies and in greyscale.
// Status colours are deliberately separated on BOTH hue and lightness so they
// stay distinguishable under colour-vision deficiencies and in greyscale.
export const STATUS = {
  visited: "#22c55e", // green
  wishlist: "#a855f7", // violet
  blocked: "#ef4444", // red — boycott / avoid
} as const

export const STATUS_ICON: Record<Status, string> = {
  visited: "✓",
  wishlist: "★",
  blocked: "⊘",
}

export const statusLabel = (status: Status | null | undefined) =>
  status === "visited"
    ? "Visited"
    : status === "wishlist"
      ? "Wishlist"
      : status === "blocked"
        ? "Blocked"
        : "Not yet"

// Map/globe colours that must change with the theme. The DOM uses CSS variables,
// but three.js materials and d3 strokes are plain values, so they read this.
export type MapPalette = {
  land: string
  ocean: string
  graticule: string
  sphereStroke: string
  polygonStroke: string
  atmosphere: string
  // Functional status hues stay independent of the visual theme.
  statusVisited: string
  statusWishlist: string
  statusBlocked: string
  // Ocean/sea label text. The flat map uses the --ink-dim CSS var, but the
  // globe's 3D sprite labels need a plain colour value.
  oceanLabel: string
  // Pale icy fill for the permanently ice-covered polar land (Antarctica,
  // Greenland) when they have no travel status.
  ice: string
}

// GPU/SVG colours are plain values (CSS variables cannot colour Three materials).
// Keep these renderer tokens together; DOM surfaces use globals.css tokens.
export const PREVIEW_ROUTE_COLOR = "#486B80"
export const MAP_PALETTE: Record<ResolvedTheme, MapPalette> = {
  dark: {
    land: "#BCC5C9",
    ocean: "#A8C7D1",
    graticule: "rgba(72,107,128,0.12)",
    sphereStroke: "rgba(72,107,128,0.38)",
    polygonStroke: "#486B80",
    atmosphere: "#DCE9ED",
    oceanLabel: "#243E4B",
    ice: "#E4ECEF",
    statusVisited: STATUS.visited,
    statusWishlist: STATUS.wishlist,
    statusBlocked: STATUS.blocked,
  },
  light: {
    land: "#BCC5C9",
    ocean: "#DCE9ED",
    graticule: "rgba(72,107,128,0.12)",
    sphereStroke: "rgba(72,107,128,0.38)",
    polygonStroke: "#486B80",
    atmosphere: "#A8C7D1",
    oceanLabel: "#243E4B",
    ice: "#F4F7F8",
    statusVisited: STATUS.visited,
    statusWishlist: STATUS.wishlist,
    statusBlocked: STATUS.blocked,
  },
}

export const statusFill = (
  status: Status | null | undefined,
  palette: MapPalette,
) =>
  status === "visited"
    ? palette.statusVisited
    : status === "wishlist"
      ? palette.statusWishlist
      : status === "blocked"
        ? palette.statusBlocked
        : palette.land

// Antarctica (10) and Greenland (304) — rendered icy when statusless.
const POLAR_IDS = new Set(["10", "304"])

// Base map fill: status colour if set, else an icy tone for polar land, else
// the normal land colour. Used by both the flat map and the globe.
export const baseFill = (
  id: string,
  status: Status | null | undefined,
  palette: MapPalette,
) => (!status && POLAR_IDS.has(id) ? palette.ice : statusFill(status, palette))

export const withAlpha = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}

// Blend a hex colour toward black by `amount` (0–1).
export const darken = (hex: string, amount: number) => {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c * (1 - amount))
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`
}

// Both mist variants have light surfaces; badges retain the hue with darker,
// readable text instead of placing vivid green/red text on cream.
export const badgeStyle = (color: string, theme: ResolvedTheme) => ({
  background: withAlpha(color, theme === "light" ? 0.15 : 0.18),
  color: darken(color, 0.55),
})

// Blend a hex colour toward white by `amount` (0–1). Used to brighten the
// selected country's status fill so selection reads alongside the status hue.
export const lighten = (hex: string, amount: number) => {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`
}
