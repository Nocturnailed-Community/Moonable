import { applySettingsToDom, clearDom, ensureSvgFilters } from './dom'
import { createMediaController, createReadingGuide } from './features'
import { translate, type MessageKey } from './i18n'
import { DEFAULT_SETTINGS, DEFAULT_STORAGE_KEY, PRESETS, isPresetActive, presetSettings, sanitizeSettings, settingsEqual } from './settings'
import { RANGE_STEPS, stepValue, type ActionId, type RangeKey } from './panel'
import { createSpeech, getReadableText } from './speech'
import { announceTo, ensureLiveRegions, showToast } from './ui'
import { createVoice, matchCommand } from './voice'
import { auditPage, logAudit, type AuditOptions } from './audit'
import type { MoonableSettings, MoonableState, Locale, PresetId, ToastType, VoiceCommand } from './types'

export interface MoonableOptions {
  locale?: Locale
  /** Kunci localStorage. Samakan dengan getInitScript({ storageKey }). */
  storageKey?: string
  /** Simpan pengaturan di peramban. Bawaan true. */
  persist?: boolean
  /** Ganti storage (mis. sessionStorage atau cookie-adapter). */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  /** 'rem' (bawaan, mengubah font-size root) atau 'zoom' (CSS zoom, untuk situs berbasis px). */
  textScaling?: 'rem' | 'zoom'
  /** Pintasan keyboard Alt+Shift+A/R/L/+/-. Bawaan true. */
  shortcuts?: boolean
  /** Nilai awal pengaturan (untuk "reset"). */
  defaults?: Partial<MoonableSettings>
  /** Ikuti prefers-reduced-motion / prefers-contrast jika pengguna belum pernah mengatur. Bawaan true. */
  respectSystemPreferences?: boolean
  /** Perintah suara tambahan. */
  voiceCommands?: VoiceCommand[]
  /** Jalankan audit otomatis & cetak ke console saat init (hanya development). */
  auditOnInit?: boolean | AuditOptions
}

export type Moonable = ReturnType<typeof createMoonable>

export function createMoonable(options: MoonableOptions = {}) {
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY
  const persist = options.persist !== false
  const baseDefaults = sanitizeSettings(options.defaults)

  const serverState: MoonableState = {
    ready: false,
    locale: options.locale ?? 'id',
    settings: baseDefaults,
    panelOpen: false,
    speaking: false,
    paused: false,
    listening: false,
    capabilities: { speech: false, recognition: false },
  }
  let state = serverState
  const listeners = new Set<() => void>()
  let initialized = false
  let root: HTMLElement | null = null
  let guide: ReturnType<typeof createReadingGuide> | null = null
  let media: ReturnType<typeof createMediaController> | null = null
  const cleanups: Array<() => void> = []

  const setState = (patch: Partial<MoonableState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  }
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(state.locale, key, vars)
  const langTag = () => (state.locale === 'id' ? 'id-ID' : 'en-US')

  /* ---------- storage ---------- */
  const store = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null => {
    if (options.storage) return options.storage
    try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
  }
  const readStored = (): MoonableSettings | null => {
    try {
      const raw = store()?.getItem(storageKey)
      return raw ? sanitizeSettings(JSON.parse(raw), baseDefaults) : null
    } catch { return null }
  }
  const save = () => {
    if (!persist) return
    try {
      const s = store()
      if (!s) return
      if (settingsEqual(state.settings, baseDefaults)) s.removeItem(storageKey)
      else s.setItem(storageKey, JSON.stringify(state.settings))
    } catch { /* storage penuh / diblokir */ }
  }

  const systemDefaults = (): MoonableSettings => {
    if (options.respectSystemPreferences === false || typeof matchMedia === 'undefined') return baseDefaults
    const patch: Partial<MoonableSettings> = {}
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) patch.reduceMotion = true
    if (matchMedia('(prefers-contrast: more)').matches) { patch.strongFocus = true; patch.highlightLinks = true }
    return sanitizeSettings(patch, baseDefaults)
  }

  const applyAll = () => {
    if (!root) return
    applySettingsToDom(state.settings, root, { textScaling: options.textScaling })
    guide?.update(state.settings.readingGuide)
    media?.update(state.settings)
  }

  /* ---------- pengumuman & notifikasi ---------- */
  const announce = (message: string, politeness: 'polite' | 'assertive' = 'polite') => {
    if (typeof document !== 'undefined') announceTo(document, message, politeness)
  }
  const notify = (
    message: string,
    opts: { type?: ToastType; politeness?: 'polite' | 'assertive'; visual?: boolean; duration?: number } = {},
  ) => {
    if (typeof document === 'undefined') return
    announce(message, opts.politeness ?? (opts.type === 'error' ? 'assertive' : 'polite'))
    if (opts.visual ?? state.settings.visualAlerts) showToast(document, message, { type: opts.type, duration: opts.duration })
    if (state.settings.visualAlerts && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function')
      navigator.vibrate(opts.type === 'error' ? [200, 100, 200] : 120)
  }

  /* ---------- suara ---------- */
  const speech = createSpeech({
    getLang: langTag,
    getRate: () => state.settings.speechRate,
    onState: (s) => setState({ speaking: s.speaking, paused: s.paused }),
  })

  const defaultCommands = (): VoiceCommand[] => [
    { id: 'bigger', phrases: { id: ['perbesar teks', 'perbesar tulisan', 'teks lebih besar', 'huruf lebih besar'], en: ['bigger text', 'increase text', 'larger text', 'zoom in'] }, run: (a) => a.increaseText() },
    { id: 'smaller', phrases: { id: ['perkecil teks', 'perkecil tulisan', 'teks lebih kecil'], en: ['smaller text', 'decrease text', 'zoom out'] }, run: (a) => a.decreaseText() },
    { id: 'contrast', phrases: { id: ['kontras tinggi', 'mode kontras', 'kontras gelap'], en: ['high contrast', 'contrast mode'] }, run: (a) => a.set({ contrast: a.getState().settings.contrast === 'off' ? 'dark' : 'off' }) },
    { id: 'elderly', phrases: { id: ['mode lansia', 'mode manula'], en: ['senior mode', 'elderly mode'] }, run: (a) => a.togglePreset('elderly') },
    { id: 'read', phrases: { id: ['baca halaman', 'bacakan halaman', 'bacakan', 'baca ini'], en: ['read page', 'read aloud', 'read this'] }, run: (a) => a.speakPage() },
    { id: 'stop', phrases: { id: ['berhenti', 'diam', 'stop'], en: ['stop', 'be quiet', 'stop reading'] }, run: (a) => a.stopSpeaking() },
    { id: 'down', phrases: { id: ['turun', 'gulir ke bawah', 'ke bawah'], en: ['scroll down', 'down'] }, run: () => window.scrollBy({ top: window.innerHeight * 0.8, behavior: state.settings.reduceMotion ? 'auto' : 'smooth' }) },
    { id: 'up', phrases: { id: ['naik', 'gulir ke atas', 'ke atas'], en: ['scroll up', 'up'] }, run: () => window.scrollBy({ top: -window.innerHeight * 0.8, behavior: state.settings.reduceMotion ? 'auto' : 'smooth' }) },
    { id: 'top', phrases: { id: ['ke paling atas', 'awal halaman'], en: ['go to top', 'top of page'] }, run: () => window.scrollTo({ top: 0 }) },
    { id: 'back', phrases: { id: ['kembali', 'halaman sebelumnya'], en: ['go back', 'previous page'] }, run: () => history.back() },
    { id: 'open', phrases: { id: ['buka aksesibilitas', 'buka pengaturan'], en: ['open accessibility', 'open settings'] }, run: (a) => a.openPanel() },
    { id: 'close', phrases: { id: ['tutup aksesibilitas', 'tutup pengaturan', 'tutup panel'], en: ['close accessibility', 'close settings', 'close panel'] }, run: (a) => a.closePanel() },
    { id: 'reset', phrases: { id: ['atur ulang', 'kembalikan pengaturan'], en: ['reset settings', 'reset everything'] }, run: (a) => a.reset() },
  ]

  const voice = createVoice({
    getLang: langTag,
    onFinal: (transcript) => {
      const cmds = [...defaultCommands(), ...(options.voiceCommands ?? [])]
      const hit = matchCommand(transcript, cmds, state.locale)
      if (hit) {
        notify(t('msg.voiceHeard', { cmd: transcript.trim() }), { visual: true, duration: 2500 })
        hit.run(api)
      }
    },
    onState: (listening) => setState({ listening }),
    onError: (code) => { if (code === 'not-allowed' || code === 'service-not-allowed') notify(t('msg.voiceDenied'), { type: 'error', visual: true }) },
  })

  /* ---------- API publik ---------- */
  const api = {
    /** State saat ini (objek baru setiap berubah; aman untuk useSyncExternalStore). */
    getState: () => state,
    /** State awal untuk SSR (selalu sama di server & hydration). */
    getServerState: () => serverState,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    t,

    /** Panggil sekali di browser setelah mount/hydrate. Aman dipanggil berulang. */
    init() {
      if (initialized || typeof document === 'undefined') return
      initialized = true
      root = document.documentElement
      const stored = readStored()
      const settings = stored ?? systemDefaults()
      ensureSvgFilters(document)
      ensureLiveRegions(document)
      guide = createReadingGuide(document)
      media = createMediaController(document)
      setState({
        ready: true,
        settings,
        capabilities: { speech: speech.supported, recognition: voice.supported },
      })
      applyAll()

      if (options.shortcuts !== false) {
        const onKey = (e: KeyboardEvent) => {
          if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return
          const act: Record<string, () => void> = {
            KeyA: () => api.togglePanel(),
            KeyR: () => (state.speaking ? api.stopSpeaking() : api.speakSelectionOrPage()),
            KeyL: () => api.togglePreset('elderly'),
            Equal: () => api.increaseText(),
            NumpadAdd: () => api.increaseText(),
            Minus: () => api.decreaseText(),
            NumpadSubtract: () => api.decreaseText(),
          }
          const fn = act[e.code]
          if (fn) { e.preventDefault(); fn() }
        }
        document.addEventListener('keydown', onKey)
        cleanups.push(() => document.removeEventListener('keydown', onKey))
      }
      if (persist) {
        // sinkronkan antar-tab
        const onStorage = (e: StorageEvent) => {
          if (e.key !== storageKey) return
          setState({ settings: e.newValue ? sanitizeSettings(JSON.parse(e.newValue), baseDefaults) : baseDefaults })
          applyAll()
        }
        window.addEventListener('storage', onStorage)
        cleanups.push(() => window.removeEventListener('storage', onStorage))
      }
      if (options.auditOnInit) {
        const run = () => logAudit(auditPage(document, typeof options.auditOnInit === 'object' ? options.auditOnInit : {}))
        const id = window.setTimeout(run, 1500)
        cleanups.push(() => window.clearTimeout(id))
      }
    },

    destroy() {
      if (!initialized) return
      initialized = false
      cleanups.splice(0).forEach((fn) => fn())
      speech.stop()
      voice.stop()
      guide?.destroy(); media?.destroy()
      guide = media = null
      if (root) clearDom(root)
      root = null
    },

    /* pengaturan */
    set(patch: Partial<MoonableSettings>) {
      const next = sanitizeSettings({ ...state.settings, ...patch }, baseDefaults)
      if (settingsEqual(next, state.settings)) return
      setState({ settings: next })
      applyAll()
      save()
    },
    reset() {
      setState({ settings: baseDefaults })
      applyAll()
      save()
      notify(t('msg.reset'))
    },
    step(key: RangeKey, dir: 1 | -1) {
      api.set({ [key]: stepValue(key, state.settings[key], dir) } as Partial<MoonableSettings>)
    },
    increaseText() { api.step('fontScale', 1); announce(t('msg.textSize', { n: Math.round(state.settings.fontScale * 100) })) },
    decreaseText() { api.step('fontScale', -1); announce(t('msg.textSize', { n: Math.round(state.settings.fontScale * 100) })) },
    applyPreset(id: PresetId) {
      setState({ settings: sanitizeSettings(presetSettings(id), baseDefaults) })
      applyAll()
      save()
      notify(t('msg.presetOn', { name: t(`preset.${id}` as MessageKey) }), { type: 'success' })
    },
    /** Aktifkan preset; jika sudah aktif, matikan (reset). */
    togglePreset(id: PresetId) {
      if (isPresetActive(id, state.settings)) api.reset()
      else api.applyPreset(id)
    },
    setLocale(locale: Locale) { setState({ locale }) },

    /* panel */
    openPanel() { setState({ panelOpen: true }) },
    closePanel() { setState({ panelOpen: false }) },
    togglePanel() { setState({ panelOpen: !state.panelOpen }) },

    /* suara keluar (TTS) */
    speak(text: string) { if (text.trim()) speech.speak(text); else notify(t('msg.noText')) },
    speakPage() {
      if (typeof document === 'undefined') return
      const text = getReadableText(document)
      if (text) speech.speak(text); else notify(t('msg.noText'))
    },
    speakSelection() {
      const sel = typeof window !== 'undefined' ? window.getSelection()?.toString().trim() : ''
      if (sel) speech.speak(sel); else notify(t('msg.noSelection'), { visual: true })
    },
    speakSelectionOrPage() {
      const sel = typeof window !== 'undefined' ? window.getSelection()?.toString().trim() : ''
      if (sel) speech.speak(sel); else api.speakPage()
    },
    stopSpeaking() { speech.stop() },
    pauseSpeaking() { speech.pause() },
    resumeSpeaking() { speech.resume() },

    /* perintah suara */
    startVoice() { if (voice.start()) announce(t('msg.voiceOn')) },
    stopVoice() { voice.stop(); announce(t('msg.voiceOff')) },
    toggleVoice() { if (state.listening) api.stopVoice(); else api.startVoice() },

    /** Jalankan aksi panel berdasarkan id. */
    runAction(id: ActionId) {
      const map: Record<ActionId, () => void> = {
        readPage: api.speakPage, readSelection: api.speakSelection, stopReading: api.stopSpeaking,
        pauseReading: api.pauseSpeaking, resumeReading: api.resumeSpeaking, toggleVoice: api.toggleVoice,
      }
      map[id]()
    },

    /* pengumuman untuk screen reader & notifikasi visual */
    announce,
    notify,

    /** Audit aksesibilitas halaman (untuk developer). */
    audit(rootEl?: Document | Element, opts?: AuditOptions) {
      if (typeof document === 'undefined') return null
      return auditPage(rootEl ?? document, opts)
    },
  }

  return api
}

export { DEFAULT_SETTINGS, PRESETS, RANGE_STEPS }
