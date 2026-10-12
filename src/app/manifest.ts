import type { MetadataRoute } from "next"

const manifest = (): MetadataRoute.Manifest => ({
  id: "/",
  name: "Globetrotter",
  short_name: "Globetrotter",
  description:
    "Your personal travel map, flight routes and memories. An internet connection is required.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "any",
  background_color: "#F7F8F3",
  theme_color: "#DCE9ED",
  categories: ["travel", "lifestyle", "navigation"],
  icons: [
    {
      src: "/icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
})

export default manifest
