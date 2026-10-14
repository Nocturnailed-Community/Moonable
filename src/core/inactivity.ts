import { translate } from './i18n'
import { trapFocus } from './ui'
import type { Locale } from './types'

export interface InactivityGuardOptions {
  /** Total waktu tanpa aktivitas sebelum sesi berakhir. Bawaan 15 menit. */
  timeoutMs?: number
  /** Peringatan muncul sekian ms sebelum habis. Bawaan 2 menit. */
  warnBeforeMs?: number
  locale?: Locale
  /** Tampilkan dialog peringatan besar bawaan. Bawaan true. */
  showDialog?: boolean
  onWarn?: () => void
  onExtend?: () => void
  onTimeout: () => void
}

export interface InactivityGuard {
  start(): void
  stop(): void
  /** Perpanjang sesi (dipanggil juga oleh tombol di dialog). */
  extend(): void
}

/**
 * Penjaga sesi ramah lansia / pengguna lambat: peringatan jelas dulu, lalu logout.
 * Setelah peringatan muncul, hanya klik tombol "Saya masih di sini" yang memperpanjang sesi
 * (gerakan mouse tidak sengaja tidak dihitung).
 */
export function createInactivityGuard(options: InactivityGuardOptions): InactivityGuard {
  const timeout = options.timeoutMs ?? 15 * 60_000
  const warnBefore = Math.min(options.warnBeforeMs ?? 2 * 60_000, Math.max(0, timeout - 1000))
  const locale = options.locale ?? 'id'
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']
  let idle: ReturnType<typeof setTimeout> | undefined
  let expire: ReturnType<typeof setTimeout> | undefined
  let tick: ReturnType<typeof setInterval> | undefined
  let warning = false
  let running = false
  let last = 0
  let overlay: HTMLElement | null = null
  let release: (() => void) | null = null

  const clearTimers = () => { clearTimeout(idle); clearTimeout(expire); clearInterval(tick) }

  const hide = () => { release?.(); release = null; overlay?.remove(); overlay = null }

  const show = () => {
    if (typeof document === 'undefined') return
    overlay = document.createElement('div')
    overlay.className = 'moonable-modal-backdrop'
    overlay.setAttribute('data-moonable-ui', '')
    const box = document.createElement('div')
    box.className = 'moonable-modal'
    box.setAttribute('role', 'alertdialog')
    box.setAttribute('aria-modal', 'true')
    box.setAttribute('aria-labelledby', 'moonable-idle-title')
    box.setAttribute('aria-describedby', 'moonable-idle-body')
    const h = document.createElement('h2')
    h.id = 'moonable-idle-title'
    h.textContent = translate(locale, 'inactivity.title')
    const p = document.createElement('p')
    p.id = 'moonable-idle-body'
    let left = Math.round(warnBefore / 1000)
    const label = () => translate(locale, 'inactivity.body', { s: left })
    p.textContent = label()
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'moonable-btn moonable-btn--primary'
    btn.textContent = translate(locale, 'inactivity.extend')
    btn.addEventListener('click', () => api.extend())
    box.append(h, p, btn)
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    release = trapFocus(box, { initialFocus: btn })
    tick = setInterval(() => { left = Math.max(0, left - 1); p.textContent = label() }, 1000)
  }

  const schedule = () => {
    clearTimers()
    idle = setTimeout(warn, timeout - warnBefore)
  }

  const warn = () => {
    warning = true
    options.onWarn?.()
    if (options.showDialog !== false) show()
    expire = setTimeout(() => { hide(); api.stop(); options.onTimeout() }, warnBefore)
  }

  const onActivity = () => {
    if (warning) return
    const now = Date.now()
    if (now - last < 1000) return
    last = now
    schedule()
  }

  const api: InactivityGuard = {
    start() {
      if (running || typeof window === 'undefined') return
      running = true
      events.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }))
      schedule()
    },
    stop() {
      running = false
      warning = false
      clearTimers()
      hide()
      if (typeof window !== 'undefined') events.forEach((e) => window.removeEventListener(e, onActivity, { capture: true } as EventListenerOptions))
    },
    extend() {
      warning = false
      hide()
      options.onExtend?.()
      schedule()
    },
  }
  return api
}
