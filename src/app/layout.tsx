import type { Metadata, Viewport } from "next"
import "./globals.css"
import ThemeApplier from "@/components/theme-applier"
import PwaRegister from "@/components/pwa-register"
import { AuthProvider } from "@/components/auth-provider"
import { PwaProvider } from "@/components/pwa-provider"

export const metadata: Metadata = {
  title: "Globetrotter — map where you've been",
  description:
    "Your personal travel map, flight routes and memories. An internet connection is required.",
  applicationName: "Globetrotter",
  icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
  appleWebApp: {
    capable: true,
    title: "Globetrotter",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: "#DCE9ED",
  colorScheme: "light",
  viewportFit: "cover",
}

// Apply the saved theme before paint to avoid a flash of the wrong theme.
const NO_FLASH = `(function(){try{var s=localStorage.getItem('globetrotter:v1');var t=s&&JSON.parse(s).state&&JSON.parse(s).state.theme;if(!t||t==='system'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}})()`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
        <ThemeApplier />
        <PwaRegister />
        <PwaProvider><AuthProvider>{children}</AuthProvider></PwaProvider>
      </body>
    </html>
  )
}
