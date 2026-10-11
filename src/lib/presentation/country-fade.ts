import {Color,type Object3D,type Mesh,type MeshBasicMaterial} from 'three'
/** Each cap may share a cached material. Clone only changing caps, never mutate
 * the library cache or repaint other countries. Restore only our own clone. */
export function countryFade(scene:Object3D,targets:Readonly<Record<string,string>>,from:(id:string)=>string) {
 const items:{mesh:Mesh;index:number;original:MeshBasicMaterial;copy:MeshBasicMaterial;start:Color;end:Color;id:string}[]=[]
 scene.traverse(object=>{
  const node=object as Object3D & {__globeObjType?:string;__data?:{data?:{id?:string}}}
  const id=node.__data?.data?.id
  if(node.__globeObjType!=='polygon'||!id||!targets[id])return
  const mesh=node.children[0] as Mesh|undefined
  if(!mesh||!Array.isArray(mesh.material))return
  const index=mesh.material.length-1,original=mesh.material[index] as MeshBasicMaterial
  if(!original?.color)return
  const start=new Color(from(id)),end=new Color(targets[id]);if(start.equals(end)||!original.color.equals(end))return
  const copy=original.clone();copy.color.copy(start)
  mesh.material=[...mesh.material];mesh.material[index]=copy
  items.push({mesh,index,original,copy,start,end,id})
 })
 let closed=false
 return {count:items.length,countries:new Set(items.map(item=>item.id)).size,
  apply(progress:number){if(closed)return;const p=Math.max(0,Math.min(1,progress));for(const item of items)item.copy.color.copy(item.start).lerp(item.end,p*p*(3-2*p))},
  dispose(){if(closed)return;closed=true;for(const item of items){if(Array.isArray(item.mesh.material)&&item.mesh.material[item.index]===item.copy)item.mesh.material[item.index]=item.original;item.copy.dispose()}}
 }
}
