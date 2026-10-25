"use client"

import { useEffect, type RefObject } from "react"

/** Scroll only the form body; native scrollIntoView can also move the modal's
 * outer box and push its fixed header/footer away. */
export function scrollEditorControl(dialog: HTMLDialogElement | null, element: Element | null, start=false) {
  const scroller=dialog?.querySelector<HTMLElement>("[data-editor-scroll]")
  if(!scroller || !element || !scroller.contains(element))return
  const box=element.getBoundingClientRect(), bounds=scroller.getBoundingClientRect()
  if(start || box.top<bounds.top+12)scroller.scrollTop+=box.top-bounds.top-12
  else if(box.bottom>bounds.bottom-12)scroller.scrollTop+=box.bottom-bounds.bottom+12
}

/** Safari's on-screen keyboard shrinks the visual viewport, not always 100dvh.
 * Confine only the mobile editor to that viewport. Never fight pinch zoom. */
export function useEditorViewport(ref: RefObject<HTMLDialogElement | null>, open: boolean) {
  useEffect(() => {
    const node=ref.current, viewport=window.visualViewport
    if(!open || !node || !viewport)return
    const mobile=window.matchMedia("(max-width: 767px)")
    let frame=0,revealFrame=0
    const revealFocused=()=>{
      const active=document.activeElement
      if(active instanceof HTMLElement && node.contains(active))scrollEditorControl(node,active)
    }
    // Observe the resulting flex-body size, not just the viewport event: Safari
    // can lay out its shorter scroll area after the viewport notification.
    const observer=new ResizeObserver(()=>{
      cancelAnimationFrame(revealFrame)
      revealFrame=requestAnimationFrame(revealFocused)
    })
    const body=node.querySelector("[data-editor-scroll]")
    if(body)observer.observe(body)
    const reset=()=>{
      for(const key of ["--editor-viewport-height","--editor-viewport-top","--editor-safe-bottom"])node.style.removeProperty(key)
    }
    const update=()=>{
      cancelAnimationFrame(frame)
      frame=requestAnimationFrame(()=>{
        if(!mobile.matches || viewport.scale>1.05){reset();return}
        node.style.setProperty("--editor-viewport-height",`${viewport.height}px`)
        node.style.setProperty("--editor-viewport-top",`${viewport.offsetTop}px`)
        node.style.setProperty("--editor-safe-bottom",window.innerHeight-viewport.height>150?"0px":"env(safe-area-inset-bottom, 0px)")
        revealFocused()
      })
    }
    update()
    viewport.addEventListener("resize",update)
    viewport.addEventListener("scroll",update)
    window.addEventListener("resize",update)
    node.addEventListener("focusin",update)
    return ()=>{
      cancelAnimationFrame(frame)
      cancelAnimationFrame(revealFrame)
      observer.disconnect()
      viewport.removeEventListener("resize",update)
      viewport.removeEventListener("scroll",update)
      window.removeEventListener("resize",update)
      node.removeEventListener("focusin",update)
      reset()
    }
  },[open,ref])
}
