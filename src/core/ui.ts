import type { ToastType } from './types'

/* ---------- Region pengumuman untuk screen reader ---------- */
export interface LiveRegions { polite: HTMLElement; assertive: HTMLElement }

export function ensureLiveRegions(doc: Document): LiveRegions {
  const make = (id: string, mode: 'polite' | 'assertive') => {
    let el = doc.getElementById(id)
    if (!el) {
      el = doc.createElement('div')
      el.id = id
      el.className = 'moonable-sr-only'
      el.setAttribute('data-moonable-ui', '')
      el.setAttribute('aria-live', mode)
      el.setAttribute('aria-atomic', 'true')
      el.setAttribute('role', mode === 'assertive' ? 'alert' : 'status')
      doc.body.appendChild(el)
    }
    return el
  }
  return { polite: make('moonable-live-polite', 'polite'), assertive: make('moonable-live-assertive', 'assertive') }
}

export function announceTo(doc: Document, message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  const regions = ensureLiveRegions(doc)
  const el = regions[politeness]
  el.textContent = ''
  // jeda singkat agar pesan yang sama tetap dibacakan ulang
  setTimeout(() => { el.textContent = message }, 60)
}

/* ---------- Toast visual (untuk pengguna tuli / tuna rungu) ---------- */
export function showToast(doc: Document, message: string, opts: { type?: ToastType; duration?: number } = {}): void {
  let host = doc.getElementById('moonable-toasts')
  if (!host) {
    host = doc.createElement('div')
    host.id = 'moonable-toasts'
    host.className = 'moonable-toasts'
    host.setAttribute('data-moonable-ui', '')
    doc.body.appendChild(host)
  }
  const toast = doc.createElement('div')
  toast.className = `moonable-toast moonable-toast--${opts.type ?? 'info'}`
  toast.textContent = message
  host.appendChild(toast)
  setTimeout(() => toast.remove(), opts.duration ?? 6000)
}

/* ---------- Focus trap ---------- */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])'

export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
  )
}

/**
 * Kunci fokus keyboard di dalam `container` (dialog/modal). Mengembalikan fungsi pelepas
 * yang juga mengembalikan fokus ke elemen sebelumnya.
 */
export function trapFocus(
  container: HTMLElement,
  opts: { onEscape?: () => void; initialFocus?: HTMLElement | null; restoreFocus?: boolean } = {},
): () => void {
  const doc = container.ownerDocument
  const previous = doc.activeElement as HTMLElement | null
  const first = opts.initialFocus ?? getFocusable(container)[0] ?? container
  if (first === container && !container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1')
  first.focus()

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      opts.onEscape?.()
      return
    }
    if (e.key !== 'Tab') return
    const items = getFocusable(container)
    if (!items.length) { e.preventDefault(); return }
    const head = items[0]
    const tail = items[items.length - 1]
    const active = doc.activeElement
    if (e.shiftKey && (active === head || !container.contains(active))) { e.preventDefault(); tail.focus() }
    else if (!e.shiftKey && (active === tail || !container.contains(active))) { e.preventDefault(); head.focus() }
  }
  doc.addEventListener('keydown', onKey, true)

  return () => {
    doc.removeEventListener('keydown', onKey, true)
    if (opts.restoreFocus !== false && previous && doc.contains(previous)) previous.focus()
  }
}
