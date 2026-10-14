import type { MoonableSettings, ReadingGuideMode } from './types'

type RafWin = Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>
const raf = (w: RafWin, cb: () => void): number =>
  typeof w.requestAnimationFrame === 'function' ? w.requestAnimationFrame(cb) : (setTimeout(cb, 16) as unknown as number)
const caf = (w: RafWin, id: number) =>
  typeof w.cancelAnimationFrame === 'function' ? w.cancelAnimationFrame(id) : clearTimeout(id)

/* ---------- Panduan baca (garis / sorot satu baris) ---------- */
export function createReadingGuide(doc: Document) {
  const win = doc.defaultView as Window
  const H = 72
  let mode: ReadingGuideMode = 'off'
  let y = Math.round(win.innerHeight / 3)
  let frame = 0
  let band: HTMLDivElement | null = null
  let top: HTMLDivElement | null = null
  let bottom: HTMLDivElement | null = null

  const mk = (cls: string) => {
    const d = doc.createElement('div')
    d.className = cls
    d.setAttribute('aria-hidden', 'true')
    d.setAttribute('data-moonable-ui', '')
    doc.body.appendChild(d)
    return d
  }

  const paint = () => {
    frame = 0
    const t = Math.max(0, y - H / 2)
    if (band) { band.style.top = `${t}px`; band.style.height = `${H}px` }
    if (top) top.style.height = `${t}px`
    if (bottom) bottom.style.top = `${t + H}px`
  }
  const move = (ny: number) => {
    y = ny
    if (!frame) frame = raf(win, paint)
  }
  const onPointer = (e: PointerEvent) => move(e.clientY)
  const onTouch = (e: TouchEvent) => { if (e.touches[0]) move(e.touches[0].clientY) }
  const onFocus = (e: FocusEvent) => {
    const t = e.target as HTMLElement | null
    if (t && typeof t.getBoundingClientRect === 'function' && t !== (doc.body as HTMLElement)) {
      const r = t.getBoundingClientRect()
      move(r.top + r.height / 2)
    }
  }

  const detach = () => {
    doc.removeEventListener('pointermove', onPointer)
    doc.removeEventListener('touchmove', onTouch)
    doc.removeEventListener('focusin', onFocus)
    band?.remove(); top?.remove(); bottom?.remove()
    band = top = bottom = null
  }

  return {
    update(next: ReadingGuideMode) {
      if (next === mode) return
      detach()
      mode = next
      if (mode === 'off') return
      if (mode === 'line') band = mk('moonable-guide-band')
      else { top = mk('moonable-mask moonable-mask-top'); bottom = mk('moonable-mask moonable-mask-bottom') }
      doc.addEventListener('pointermove', onPointer, { passive: true })
      doc.addEventListener('touchmove', onTouch, { passive: true })
      doc.addEventListener('focusin', onFocus)
      paint()
    },
    destroy() { mode = 'off'; if (frame) caf(win, frame); detach() },
  }
}

/* ---------- Video/audio: cegah autoplay + paksa subtitle ---------- */
export function createMediaController(doc: Document) {
  const win = doc.defaultView as Window
  let s: Pick<MoonableSettings, 'pauseMedia' | 'captions'> = { pauseMedia: false, captions: false }
  let observer: MutationObserver | null = null
  let frame = 0

  const run = () => {
    frame = 0
    doc.querySelectorAll<HTMLMediaElement>('video,audio').forEach((m) => {
      if (s.pauseMedia && (m.hasAttribute('autoplay') || m.autoplay)) {
        m.autoplay = false
        m.removeAttribute('autoplay')
        if (!m.paused) m.pause()
      }
      if (s.captions && m.tagName === 'VIDEO') {
        const tracks = (m as HTMLVideoElement).textTracks
        let shown = false
        for (let i = 0; i < tracks.length; i++) {
          const tr = tracks[i]
          if ((tr.kind === 'captions' || tr.kind === 'subtitles') && !shown) { tr.mode = 'showing'; shown = true }
        }
      }
    })
  }
  const schedule = () => { if (!frame) frame = raf(win, run) }

  return {
    update(next: Pick<MoonableSettings, 'pauseMedia' | 'captions'>) {
      s = { pauseMedia: next.pauseMedia, captions: next.captions }
      const need = s.pauseMedia || s.captions
      if (need && !observer && typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(schedule)
        observer.observe(doc.body, { childList: true, subtree: true })
      } else if (!need && observer) { observer.disconnect(); observer = null }
      if (need) schedule()
    },
    destroy() { observer?.disconnect(); observer = null; if (frame) caf(win, frame) },
  }
}
