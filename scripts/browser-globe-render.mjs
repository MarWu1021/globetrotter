/** Observe completed Three renders, never just React props or two browser RAFs. */
export async function attachRenderer(page,name='checkedGlobe') {
  await page.waitForFunction(name=>{
    for(const el of document.querySelectorAll('*')){
      const key=Object.keys(el).find(k=>k.startsWith('__reactFiber$'));if(!key)continue
      for(let f=el[key];f;f=f.return)if(f.ref?.current?.pointOfView){
        const g=f.ref.current;window[name]=g;const r=g.renderer()
        if(!r.checkedFrames){
          r.checkedFrames=true;const render=r.render.bind(r)
          r.render=(scene,camera)=>{
            render(scene,camera);if(scene!==g.scene())return
            let globeRoot=null
            const colors={};scene.traverse(obj=>{
              if(obj.__globeObjType==='polygon'){
                if(!globeRoot){globeRoot=obj;while(globeRoot.parent&&globeRoot.parent!==scene)globeRoot=globeRoot.parent}
                const id=obj.__data?.data?.id,material=obj.children[0]?.material?.at(-1)
                if(id&&material?.color)colors[id]='#'+material.color.getHexString()
              }
            })
            r.checkedLast={sequence:(r.checkedLast?.sequence??0)+1,camera:camera.position.toArray(),quaternion:camera.quaternion.toArray(),projection:camera.projectionMatrix.toArray(),globeMatrix:globeRoot?.matrixWorld.toArray(),globeVisible:globeRoot?.visible,colors,width:r.domElement.width,height:r.domElement.height}
          }
        }
        return true
      }
    }return false
  },name)
}
export async function savedCountryFrame(page,[lat,lng],name='checkedGlobe') {
  const after=await page.evaluate(({lat,lng,name})=>{
    const g=window[name],after=g.renderer().checkedLast?.sequence??0
    // Flush residual OrbitControls angular/dolly deltas before choosing a
    // diagnostic camera. A paused canvas must not be sampled with a later
    // camera projection left over from those deltas. No fixed sleep/retry.
    const controls=g.controls(),damping=controls.enableDamping
    controls.enableDamping=false;controls.update()
    g.pointOfView({lat,lng,altitude:1.8},0);controls.update()
    controls.enableDamping=damping;g.resumeAnimation();return after
  },{lat,lng,name})
  await page.waitForFunction(({lat,lng,name,after})=>{
    const g=window[name],r=g.renderer(),frame=r.checkedLast,pov=g.pointOfView()
    if(!frame||frame.sequence<=after||r.getContext().isContextLost()||Math.abs(pov.lat-lat)>1e-4||Math.abs(pov.lng-lng)>1e-4)return false
    // ThreeGlobe has an independent 600ms scale / 1200ms rotation intro.
    // Correct materials and camera alone do not mean geographic coordinates
    // match visible polygons. Require the ACTUALLY DRAWN root world transform.
    const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
    if(!g.camera().quaternion.toArray().every((v,i)=>Math.abs(v-frame.quaternion[i])<1e-8)||!g.camera().projectionMatrix.toArray().every((v,i)=>Math.abs(v-frame.projection[i])<1e-8))return false
    if(!g.camera().position.toArray().every((v,i)=>Math.abs(v-frame.camera[i])<1e-7)||frame.width!==r.domElement.width||frame.height!==r.domElement.height)return false
    const colors=JSON.parse(document.querySelector('[data-globe-points]').dataset.savedColors)
    if(!Object.entries(colors).every(([id,color])=>frame.colors[id]?.toLowerCase()===color.toLowerCase()))return false
    if(!frame.globeVisible||!frame.globeMatrix?.every((v,i)=>Math.abs(v-identity[i])<1e-8)){
      r.checkedBlockedIntro={sequence:frame.sequence,sample:[lat,lng],matrix:frame.globeMatrix,colorsReady:true,cameraReady:true}
      return false
    }
    g.pauseAnimation();r.getContext().finish();return true
  },{lat,lng,name,after})
}
