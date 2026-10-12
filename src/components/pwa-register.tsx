"use client"

import { useEffect } from "react"

const PwaRegister = () => {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return
    const register = () =>
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {})
    if (document.readyState === "complete") void register()
    else window.addEventListener("load", register, { once: true })
    return () => window.removeEventListener("load", register)
  }, [])
  return null
}

export default PwaRegister
