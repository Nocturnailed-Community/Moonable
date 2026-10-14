export type AuditImpact = 'critical' | 'serious' | 'moderate' | 'minor'

export interface AuditIssue {
  rule: string
  impact: AuditImpact
  message: string
  selector: string
  wcag?: string
  element?: Element
}

export interface AuditResult {
  issues: AuditIssue[]
  summary: Record<AuditImpact | 'total', number>
}

export interface AuditOptions {
  /** Batas elemen teks yang diperiksa kontrasnya (performa). Bawaan 400. */
  maxContrastChecks?: number
  /** Matikan aturan tertentu berdasarkan id, mis. ['contrast', 'target-size'] */
  disable?: string[]
}

const GENERIC_LINKS = /^(klik( di)? sini|di sini|selengkapnya|baca( selengkapnya)?|lihat( selengkapnya)?|click here|here|read more|more|learn more)$/i

function selectorOf(el: Element): string {
  const parts: string[] = []
  let cur: Element | null = el
  while (cur && cur.nodeType === 1 && parts.length < 4) {
    let p = cur.tagName.toLowerCase()
    if ((cur as HTMLElement).id) { parts.unshift(`${p}#${(cur as HTMLElement).id}`); break }
    const cls = (cur.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2)
    if (cls.length) p += '.' + cls.join('.')
    parts.unshift(p)
    cur = cur.parentElement
  }
  return parts.join(' > ')
}

function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label')?.trim()
  if (aria) return aria
  const by = el.getAttribute('aria-labelledby')
  if (by) {
    const t = by.split(/\s+/).map((i) => el.ownerDocument.getElementById(i)?.textContent?.trim() ?? '').join(' ').trim()
    if (t) return t
  }
  const tag = el.tagName
  if (tag === 'INPUT') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase()
    if (['button', 'submit', 'reset'].includes(type)) return (el as HTMLInputElement).value?.trim() ?? ''
    if (type === 'image') return el.getAttribute('alt')?.trim() ?? ''
  }
  const text = el.textContent?.trim()
  if (text) return text
  const img = el.querySelector('img[alt]:not([alt=""])')
  if (img) return img.getAttribute('alt')!.trim()
  const svgTitle = el.querySelector('svg title')?.textContent?.trim()
  if (svgTitle) return svgTitle
  return el.getAttribute('title')?.trim() ?? ''
}

/* ---------- warna & kontras ---------- */
type RGBA = [number, number, number, number]

let canvasCtx: CanvasRenderingContext2D | null | undefined
function getCanvasCtx(doc: Document): CanvasRenderingContext2D | null {
  if (canvasCtx !== undefined) return canvasCtx // coba sekali saja (jsdom tidak punya canvas)
  try {
    const c = doc.createElement('canvas')
    c.width = c.height = 1
    canvasCtx = c.getContext('2d', { willReadFrequently: true })
  } catch { canvasCtx = null }
  return canvasCtx
}

function parseColor(css: string, doc: Document): RGBA | null {
  const m = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/i)
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    return [+m[1], +m[2], +m[3], a]
  }
  if (css === 'transparent') return [0, 0, 0, 0]
  const ctx = getCanvasCtx(doc)
  if (!ctx) return null
  try {
    // warna modern (oklch, color(), dll) dinormalkan lewat canvas
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = css
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2], d[3] / 255]
  } catch { return null }
}

const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
const lum = (c: RGBA) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = lum([...a, 1]); const lb = lum([...b, 1])
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function backgroundOf(el: Element, win: Window, doc: Document): RGBA | null {
  let cur: Element | null = el
  while (cur) {
    const cs = win.getComputedStyle(cur)
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return null // gambar/gradasi: tidak bisa dihitung
    const bg = parseColor(cs.backgroundColor, doc)
    if (bg && bg[3] >= 0.95) return bg
    cur = cur.parentElement
  }
  return [255, 255, 255, 1]
}

/**
 * Pemeriksa aksesibilitas ringan (WCAG 2.2) untuk membantu developer menemukan masalah di sumbernya.
 * Ini BUKAN pengganti uji manual / screen reader / alat lengkap seperti axe-core.
 */
export function auditPage(root: Document | Element = document, options: AuditOptions = {}): AuditResult {
  const doc = root.nodeType === 9 ? (root as Document) : (root as Element).ownerDocument
  const win = doc.defaultView as Window
  const scope = root.nodeType === 9 ? (root as Document).documentElement : (root as Element)
  const off = new Set(options.disable ?? [])
  const issues: AuditIssue[] = []
  const add = (rule: string, impact: AuditImpact, message: string, el: Element, wcag?: string) => {
    if (!off.has(rule)) issues.push({ rule, impact, message, selector: selectorOf(el), wcag, element: el })
  }
  const q = <T extends Element = Element>(sel: string) => Array.from(scope.querySelectorAll<T>(sel)).filter((e) => !e.closest('[data-moonable-ui]'))

  // dokumen
  if (root.nodeType === 9) {
    if (!doc.documentElement.getAttribute('lang')) add('html-lang', 'serious', 'Elemen <html> belum punya atribut lang (pembaca layar butuh ini untuk memilih bahasa).', doc.documentElement, '3.1.1')
    if (!doc.title.trim()) add('document-title', 'serious', 'Halaman belum punya <title>.', doc.documentElement, '2.4.2')
    const vp = doc.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? ''
    const max = vp.match(/maximum-scale\s*=\s*([\d.]+)/i)
    if (/user-scalable\s*=\s*(no|0)/i.test(vp) || (max && parseFloat(max[1]) < 2))
      add('viewport-zoom', 'critical', 'Zoom dikunci pada meta viewport. Pengguna lansia/low vision tidak bisa memperbesar halaman.', doc.querySelector('meta[name="viewport"]')!, '1.4.4')
  }

  // gambar
  q<HTMLImageElement>('img').forEach((img) => {
    if (!img.hasAttribute('alt') && img.getAttribute('role') !== 'presentation' && img.getAttribute('aria-hidden') !== 'true')
      add('img-alt', 'critical', 'Gambar tidak punya atribut alt. Gunakan alt="" jika dekoratif.', img, '1.1.1')
  })
  q('svg[role="img"]').forEach((svg) => {
    if (!accessibleName(svg)) add('svg-name', 'serious', 'SVG role="img" belum punya nama (aria-label atau <title>).', svg, '1.1.1')
  })

  // tautan & tombol
  q('a[href]').forEach((a) => {
    const name = accessibleName(a)
    if (!name) add('link-name', 'critical', 'Tautan tidak punya teks/nama yang bisa dibaca.', a, '2.4.4')
    else if (GENERIC_LINKS.test(name)) add('link-generic', 'moderate', `Teks tautan "${name}" tidak menjelaskan tujuan.`, a, '2.4.4')
  })
  q('button,[role="button"],input[type="button"],input[type="submit"],input[type="reset"]').forEach((b) => {
    if (!accessibleName(b)) add('button-name', 'critical', 'Tombol tidak punya teks/nama yang bisa dibaca.', b, '4.1.2')
  })

  // form
  q<HTMLInputElement>('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]),select,textarea').forEach((f) => {
    const hasLabel = (f.labels && f.labels.length > 0) || f.closest('label') || f.getAttribute('aria-label')?.trim() || f.getAttribute('aria-labelledby') || f.getAttribute('title')
    if (!hasLabel) add('form-label', 'critical', 'Kolom isian tidak punya label (placeholder saja tidak cukup).', f, '3.3.2')
  })

  // heading
  const heads = q('h1,h2,h3,h4,h5,h6,[role="heading"]')
  if (root.nodeType === 9) {
    const h1s = heads.filter((h) => h.tagName === 'H1')
    if (h1s.length === 0) add('heading-h1', 'moderate', 'Halaman tidak punya <h1>.', doc.body, '1.3.1')
    if (h1s.length > 1) add('heading-h1', 'minor', 'Ada lebih dari satu <h1>.', h1s[1], '1.3.1')
  }
  let prev = 0
  heads.forEach((h) => {
    const level = /^H[1-6]$/.test(h.tagName) ? +h.tagName[1] : +(h.getAttribute('aria-level') ?? 0)
    if (!level) return
    if (prev && level > prev + 1) add('heading-order', 'moderate', `Urutan judul melompat dari h${prev} ke h${level}.`, h, '1.3.1')
    prev = level
    if (!accessibleName(h)) add('heading-empty', 'serious', 'Judul kosong.', h, '1.3.1')
  })

  // media
  q<HTMLVideoElement>('video').forEach((v) => {
    if (!v.querySelector('track[kind="captions"],track[kind="subtitles"]')) add('video-captions', 'critical', 'Video tidak punya <track> subtitle/caption untuk pengguna tuli.', v, '1.2.2')
    if (v.hasAttribute('autoplay') && !v.muted) add('media-autoplay', 'serious', 'Video autoplay dengan suara.', v, '1.4.2')
  })
  q<HTMLAudioElement>('audio').forEach((a) => {
    if (a.hasAttribute('autoplay')) add('media-autoplay', 'serious', 'Audio autoplay.', a, '1.4.2')
    add('audio-transcript', 'minor', 'Pastikan audio ini punya transkrip teks.', a, '1.2.1')
  })
  q('iframe').forEach((f) => { if (!f.getAttribute('title')?.trim()) add('iframe-title', 'serious', '<iframe> tidak punya atribut title.', f, '4.1.2') })
  q('marquee,blink').forEach((m) => add('moving-content', 'serious', `Elemen <${m.tagName.toLowerCase()}> sulit dibaca dan tidak bisa dihentikan.`, m, '2.2.2'))

  // tabel
  q('table').forEach((t) => {
    if (t.getAttribute('role') === 'presentation' || t.getAttribute('role') === 'none') return
    if (!t.querySelector('th')) add('table-headers', 'moderate', 'Tabel data tidak punya sel header <th>.', t, '1.3.1')
  })

  // atribut ARIA / fokus
  q('[tabindex]').forEach((e) => { if (parseInt(e.getAttribute('tabindex') ?? '0', 10) > 0) add('tabindex-positive', 'serious', 'tabindex positif merusak urutan keyboard alami.', e, '2.4.3') })
  q('[aria-hidden="true"]').forEach((e) => {
    if (e.matches('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])') || e.querySelector('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])'))
      add('aria-hidden-focusable', 'serious', 'Elemen aria-hidden berisi elemen yang masih bisa difokus keyboard.', e, '4.1.2')
  })
  const seen = new Map<string, Element>()
  q('[id]').forEach((e) => {
    const id = e.getAttribute('id')!
    if (seen.has(id)) add('duplicate-id', 'moderate', `id "${id}" dipakai lebih dari sekali.`, e, '4.1.1')
    else seen.set(id, e)
  })

  // ukuran target sentuh (WCAG 2.2: minimal 24x24 px, disarankan 44x44)
  q('a[href],button,input:not([type="hidden"]),select,textarea,[role="button"]').forEach((e) => {
    const r = e.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return
    if (e.tagName === 'A' && getComputedStyle(e).display === 'inline') return // tautan dalam kalimat dikecualikan
    if (r.width < 24 || r.height < 24) add('target-size', 'serious', `Target klik hanya ${Math.round(r.width)}×${Math.round(r.height)}px (minimal 24×24, ideal 44×44).`, e, '2.5.8')
  })

  // kontras teks
  if (!off.has('contrast')) {
    const max = options.maxContrastChecks ?? 400
    let checked = 0
    const candidates = q('p,li,span,a,button,label,h1,h2,h3,h4,h5,h6,td,th,dt,dd,small,strong,em,legend,figcaption,blockquote,div,input,textarea,select')
    for (const el of candidates) {
      if (checked >= max) break
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent?.trim())
      if (!own && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) continue
      const cs = win.getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue
      const fg = parseColor(cs.color, doc)
      const bg = backgroundOf(el, win, doc)
      if (!fg || !bg) continue
      checked++
      const px = parseFloat(cs.fontSize)
      const bold = parseInt(cs.fontWeight, 10) >= 700 || cs.fontWeight === 'bold'
      const large = px >= 24 || (px >= 18.66 && bold)
      const need = large ? 3 : 4.5
      const ratio = contrastRatio([fg[0], fg[1], fg[2]], [bg[0], bg[1], bg[2]])
      if (ratio < need) add('contrast', 'serious', `Kontras ${ratio.toFixed(2)}:1 terlalu rendah (butuh ${need}:1).`, el, '1.4.3')
    }
  }

  const summary = { critical: 0, serious: 0, moderate: 0, minor: 0, total: issues.length }
  issues.forEach((i) => summary[i.impact]++)
  return { issues, summary }
}

/** Cetak hasil audit ke console (untuk mode development). */
export function logAudit(result: AuditResult): void {
  if (typeof console === 'undefined') return
  const { summary, issues } = result
  console.groupCollapsed?.(`[moonable] Audit: ${summary.total} masalah (kritis ${summary.critical}, serius ${summary.serious}, sedang ${summary.moderate}, ringan ${summary.minor})`)
  issues.forEach((i) => console.warn(`[${i.impact}] ${i.rule}${i.wcag ? ` (WCAG ${i.wcag})` : ''}: ${i.message}\n  → ${i.selector}`, i.element))
  console.groupEnd?.()
}
