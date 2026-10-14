import { DEFAULT_SETTINGS, DOM_KEYS, DEFAULT_STORAGE_KEY } from './settings'
import type { MoonableSettings, ColorBlindMode } from './types'

export const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())

/**
 * Terapkan pengaturan ke <html> sebagai atribut `data-moonable-*` dan CSS variable `--moonable-*`.
 * Seluruh tampilan diatur oleh styles.css berdasarkan atribut tersebut.
 */
export function applySettingsToDom(
  s: MoonableSettings,
  root: HTMLElement,
  opts: { textScaling?: 'rem' | 'zoom' } = {},
): void {
  for (const key of DOM_KEYS) {
    const name = kebab(key)
    const attr = `data-moonable-${name}`
    const v = s[key]
    const def = DEFAULT_SETTINGS[key]
    if (typeof v === 'number') {
      if (v !== def) {
        root.setAttribute(attr, 'on')
        root.style.setProperty(`--moonable-${name}`, String(v))
      } else {
        root.removeAttribute(attr)
        root.style.removeProperty(`--moonable-${name}`)
      }
    } else if (typeof v === 'boolean') {
      if (v) root.setAttribute(attr, 'on')
      else root.removeAttribute(attr)
    } else if (v !== def) {
      root.setAttribute(attr, String(v))
    } else {
      root.removeAttribute(attr)
    }
  }
  if (opts.textScaling === 'zoom') root.setAttribute('data-moonable-scaling', 'zoom')
  else root.removeAttribute('data-moonable-scaling')
}

export function clearDom(root: HTMLElement): void {
  for (const key of DOM_KEYS) {
    const name = kebab(key)
    root.removeAttribute(`data-moonable-${name}`)
    root.style.removeProperty(`--moonable-${name}`)
  }
  root.removeAttribute('data-moonable-scaling')
}

/**
 * Skrip inline kecil yang dijalankan SEBELUM render pertama agar pengaturan tersimpan
 * langsung berlaku (tanpa "kedip" huruf kecil -> besar). Letakkan di <head>.
 */
export function getInitScript(opts: { storageKey?: string; textScaling?: 'rem' | 'zoom' } = {}): string {
  const cfg = JSON.stringify({
    k: opts.storageKey ?? DEFAULT_STORAGE_KEY,
    d: DEFAULT_SETTINGS,
    keys: DOM_KEYS,
    z: opts.textScaling === 'zoom',
  })
  return (
    '(function(){try{var c=' + cfg + ';var raw=localStorage.getItem(c.k);if(!raw)return;' +
    'var s=JSON.parse(raw);var r=document.documentElement;' +
    "function k(x){return x.replace(/[A-Z]/g,function(m){return '-'+m.toLowerCase()})}" +
    'c.keys.forEach(function(key){var v=s[key];if(v===undefined)return;var d=c.d[key];var a="data-moonable-"+k(key);' +
    'if(typeof v==="number"){if(v!==d){r.setAttribute(a,"on");r.style.setProperty("--moonable-"+k(key),String(v))}}' +
    'else if(typeof v==="boolean"){if(v)r.setAttribute(a,"on")}' +
    'else if(typeof v==="string"&&v!==d){r.setAttribute(a,v)}});' +
    'if(c.z)r.setAttribute("data-moonable-scaling","zoom")}catch(e){}})();'
  )
}

/* ---------- Filter buta warna (daltonisasi) ---------- */

type M3 = number[][]
const I3: M3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
// Simulasi kekurangan kerucut (Machado dkk.) — dipakai untuk menghitung "galat warna" yang hilang
const SIM: Record<Exclude<ColorBlindMode, 'off'>, M3> = {
  protanopia: [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]],
  deuteranopia: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]],
  tritanopia: [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]],
}
// Matriks pemindah galat ke kanal yang masih bisa dilihat
const SHIFT: Record<Exclude<ColorBlindMode, 'off'>, M3> = {
  protanopia: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]],
  deuteranopia: [[1, 0.7, 0], [0, 0, 0], [0, 0.7, 1]],
  tritanopia: [[1, 0, 0.7], [0, 1, 0.7], [0, 0, 0]],
}
const mul = (a: M3, b: M3): M3 => a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)))

/** T = I + Shift · (I − Sim). Hasil: 20 angka untuk <feColorMatrix>. */
export function daltonizeMatrix(mode: Exclude<ColorBlindMode, 'off'>): number[] {
  const err = I3.map((row, i) => row.map((v, j) => v - SIM[mode][i][j]))
  const add = mul(SHIFT[mode], err)
  const T = I3.map((row, i) => row.map((v, j) => v + add[i][j]))
  const r = (n: number) => Math.round(n * 10000) / 10000
  // 4 baris × 5 kolom: [R G B A offset]. Alpha dibiarkan apa adanya.
  return [
    ...T[0].map(r), 0, 0,
    ...T[1].map(r), 0, 0,
    ...T[2].map(r), 0, 0,
    0, 0, 0, 1, 0,
  ]
}

export function ensureSvgFilters(doc: Document): void {
  if (doc.getElementById('moonable-svg-filters')) return
  const modes = Object.keys(SIM) as Exclude<ColorBlindMode, 'off'>[]
  const filters = modes
    .map((m) => {
      const t = daltonizeMatrix(m)
      return `<filter id="moonable-cb-${m}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${t.join(' ')}"/></filter>`
    })
    .join('')
  const wrap = doc.createElement('div')
  wrap.id = 'moonable-svg-filters'
  wrap.setAttribute('data-moonable-ui', '')
  wrap.setAttribute('aria-hidden', 'true')
  wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" focusable="false"><defs>${filters}</defs></svg>`
  doc.body.appendChild(wrap)
}
