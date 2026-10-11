/** Best-effort failure evidence: never replace the original browser assertion. */
export async function flatFocusDiagnostics(page, {id, base, target}) {
  const probe = async (read) => {
    try { return await read() }
    catch (error) { return {diagnosticError: error.message} }
  }
  return {
    id, target,
    actual: await probe(() => page.locator('[data-flat-preview-colors] > svg').evaluate(s => ({
      zoom:s.__zoom, width:s.getAttribute('width'), height:s.getAttribute('height'),
      trace:window.flatFocusTrace,
    }))),
    sample: Array.isArray(base) && base.length === 2 && base.every(Number.isFinite)
      ? await probe(() => page.evaluate(({id,base}) => [...document.querySelectorAll(`path[data-country-id="${id}"]`)].map(p => {
          const source=new DOMPoint(...base), matrix=p.getScreenCTM()
          if(!matrix)return {base,unrendered:true}
          const at=source.matrixTransform(matrix)
          return {base,point:{x:at.x,y:at.y},inside:p.isPointInFill(source),
            matrix:[matrix.a,matrix.d,matrix.e,matrix.f],svgBox:p.closest('svg').getBoundingClientRect().toJSON(),
            hit:document.elementFromPoint(at.x,at.y)?.closest('[data-country-id]')?.dataset.countryId}
        }), {id,base}))
      : {skipped:'No finite inland coordinate was computed before the original failure'},
  }
}
