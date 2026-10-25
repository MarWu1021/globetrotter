export interface MenuRect { left:number; top:number; right:number; bottom:number }
export interface AirlineMenuPosition {left:number;top:number;width:number;maxHeight:number;side:'up'|'down'}
/** Geometry only; bounds already exclude the keyboard, modal header and footer. */
export function placeAirlineMenu(anchor:MenuRect,bounds:MenuRect,contentHeight:number):AirlineMenuPosition|null {
  if(![...Object.values(anchor),...Object.values(bounds),contentHeight].every(Number.isFinite))return null
  if(bounds.right<=bounds.left || bounds.bottom<=bounds.top || anchor.bottom<=bounds.top || anchor.top>=bounds.bottom || anchor.right<=bounds.left || anchor.left>=bounds.right)return null
  const gap=4,width=Math.min(Math.max(anchor.right-anchor.left,280),bounds.right-bounds.left)
  const left=Math.max(bounds.left,Math.min(anchor.left,bounds.right-width))
  const up=Math.max(0,anchor.top-gap-bounds.top),down=Math.max(0,bounds.bottom-anchor.bottom-gap)
  const desired=Math.max(1,Math.min(256,contentHeight)),side=down>=desired || down>=up?'down':'up'
  const maxHeight=Math.min(256,side==='up'?up:down),height=Math.min(desired,maxHeight)
  if(maxHeight<1)return null
  return {left,top:side==='up'?anchor.top-gap-height:anchor.bottom+gap,width,maxHeight,side}
}
