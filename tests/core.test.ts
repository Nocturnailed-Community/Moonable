import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SETTINGS, applySettingsToDom, auditPage, contrastRatio, createMoonable, createInactivityGuard,
  daltonizeMatrix, getInitScript, getPanelModel, isPresetActive, matchCommand, sanitizeSettings, splitText, stepValue,
} from '../src/core'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('style')
  for (const a of Array.from(document.documentElement.attributes)) if (a.name.startsWith('data-moonable')) document.documentElement.removeAttribute(a.name)
  document.body.innerHTML = ''
})

describe('settings', () => {
  it('membersihkan & membatasi input tak tepercaya', () => {
    const s = sanitizeSettings({ fontScale: 99, contrast: 'hax', largeCursor: 'ya', speechRate: -5, lineHeight: 'x' })
    expect(s.fontScale).toBe(2.5)
    expect(s.contrast).toBe('off')
    expect(s.largeCursor).toBe(false)
    expect(s.speechRate).toBe(0.3)
    expect(s.lineHeight).toBe(0)
  })
  it('stepValue bergerak ke nilai terdekat & tidak keluar batas', () => {
    expect(stepValue('fontScale', 1, 1)).toBe(1.1)
    expect(stepValue('fontScale', 1.52, 1)).toBe(1.75)
    expect(stepValue('fontScale', 2.5, 1)).toBe(2.5)
    expect(stepValue('fontScale', 0.8, -1)).toBe(0.8)
  })
})

describe('dom', () => {
  it('menerapkan & membersihkan atribut', () => {
    const root = document.documentElement
    applySettingsToDom({ ...DEFAULT_SETTINGS, fontScale: 1.5, contrast: 'dark', largeCursor: true }, root)
    expect(root.getAttribute('data-moonable-font-scale')).toBe('on')
    expect(root.style.getPropertyValue('--moonable-font-scale')).toBe('1.5')
    expect(root.getAttribute('data-moonable-contrast')).toBe('dark')
    expect(root.getAttribute('data-moonable-large-cursor')).toBe('on')
    applySettingsToDom(DEFAULT_SETTINGS, root)
    expect(root.getAttribute('data-moonable-contrast')).toBeNull()
    expect(root.style.getPropertyValue('--moonable-font-scale')).toBe('')
  })
  it('init script menerapkan pengaturan tersimpan sebelum render', () => {
    localStorage.setItem('moonable:settings', JSON.stringify({ ...DEFAULT_SETTINGS, fontScale: 1.75, highlightLinks: true, fontFamily: 'dyslexia' }))
    new Function(getInitScript())()
    const r = document.documentElement
    expect(r.style.getPropertyValue('--moonable-font-scale')).toBe('1.75')
    expect(r.getAttribute('data-moonable-highlight-links')).toBe('on')
    expect(r.getAttribute('data-moonable-font-family')).toBe('dyslexia')
  })
  it('init script tidak error jika storage kosong / rusak', () => {
    expect(() => new Function(getInitScript())()).not.toThrow()
    localStorage.setItem('moonable:settings', '{rusak')
    expect(() => new Function(getInitScript())()).not.toThrow()
  })
  it('matriks daltonisasi: 20 angka & tiap baris RGB berjumlah 1 (putih tetap putih)', () => {
    for (const m of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      const t = daltonizeMatrix(m)
      expect(t).toHaveLength(20)
      for (const row of [0, 1, 2]) expect(t[row * 5] + t[row * 5 + 1] + t[row * 5 + 2]).toBeCloseTo(1, 3)
    }
  })
})

describe('instance', () => {
  it('init memuat tersimpan, set menyimpan, reset menghapus', () => {
    localStorage.setItem('moonable:settings', JSON.stringify({ fontScale: 1.3 }))
    const a = createMoonable()
    expect(a.getState().ready).toBe(false)
    a.init()
    expect(a.getState().ready).toBe(true)
    expect(a.getState().settings.fontScale).toBe(1.3)
    a.set({ contrast: 'yellow' })
    expect(JSON.parse(localStorage.getItem('moonable:settings')!).contrast).toBe('yellow')
    expect(document.documentElement.getAttribute('data-moonable-contrast')).toBe('yellow')
    a.reset()
    expect(localStorage.getItem('moonable:settings')).toBeNull()
    expect(document.documentElement.getAttribute('data-moonable-contrast')).toBeNull()
    a.destroy()
  })
  it('preset lansia mengaktifkan banyak fitur & togglePreset mematikannya', () => {
    const a = createMoonable(); a.init()
    a.applyPreset('elderly')
    const s = a.getState().settings
    expect(s.fontScale).toBe(1.5); expect(s.largeTargets).toBe(true); expect(s.reduceMotion).toBe(true); expect(s.speechRate).toBe(0.85)
    expect(isPresetActive('elderly', s)).toBe(true)
    a.togglePreset('elderly')
    expect(a.getState().settings.fontScale).toBe(1)
    a.destroy()
  })
  it('increaseText/decreaseText & subscribe', () => {
    const a = createMoonable(); a.init()
    const spy = vi.fn(); const off = a.subscribe(spy)
    a.increaseText()
    expect(a.getState().settings.fontScale).toBe(1.1)
    expect(spy).toHaveBeenCalled()
    off(); a.destroy()
  })
  it('SSR-safe: tidak menyentuh DOM sebelum init, state server stabil', () => {
    const a = createMoonable()
    expect(a.getServerState()).toBe(a.getServerState())
    a.set({ fontScale: 2 })
    expect(document.documentElement.getAttribute('data-moonable-font-scale')).toBeNull()
  })
  it('sinkron antar-tab lewat event storage & destroy membersihkan DOM', () => {
    const a = createMoonable(); a.init()
    window.dispatchEvent(new StorageEvent('storage', { key: 'moonable:settings', newValue: JSON.stringify({ largeCursor: true }) }))
    expect(a.getState().settings.largeCursor).toBe(true)
    a.destroy()
    expect(document.documentElement.getAttribute('data-moonable-large-cursor')).toBeNull()
  })
  it('pintasan keyboard Alt+Shift+A membuka panel', () => {
    const a = createMoonable(); a.init()
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', altKey: true, shiftKey: true }))
    expect(a.getState().panelOpen).toBe(true)
    a.destroy()
  })
  it('panel model: bahasa & status', () => {
    const a = createMoonable({ locale: 'en' }); a.init()
    const m = getPanelModel(a.getState(), a.t)
    expect(m.title).toBe('Accessibility Settings')
    expect(m.presets[0].id).toBe('elderly')
    expect(m.sections.map((s) => s.id)).toEqual(['text', 'color', 'motor', 'focus', 'sound'])
    a.destroy()
  })
  it('notify menampilkan toast visual saat visualAlerts aktif', () => {
    const a = createMoonable(); a.init()
    a.set({ visualAlerts: true })
    a.notify('Halo', { type: 'success' })
    expect(document.querySelector('.moonable-toast')?.textContent).toBe('Halo')
    a.destroy()
  })
})

describe('audit', () => {
  it('menemukan masalah umum', () => {
    document.documentElement.removeAttribute('lang')
    document.head.innerHTML = '<meta name="viewport" content="width=device-width, user-scalable=no">'
    document.body.innerHTML = `
      <h1>A</h1><h3>Lompat</h3>
      <img src="a.png">
      <a href="/x"></a><a href="/y">klik di sini</a>
      <button></button>
      <input type="text">
      <video autoplay><source src="v.mp4"></video>
      <div id="d"></div><div id="d"></div>
      <div tabindex="3">x</div>`
    const { issues, summary } = auditPage(document)
    const rules = new Set(issues.map((i) => i.rule))
    for (const r of ['html-lang', 'document-title', 'viewport-zoom', 'img-alt', 'link-name', 'link-generic', 'button-name',
      'form-label', 'video-captions', 'heading-order', 'duplicate-id', 'tabindex-positive']) expect(rules.has(r), r).toBe(true)
    expect(summary.total).toBe(issues.length)
    expect(summary.critical).toBeGreaterThan(0)
  })
  it('halaman bersih tidak melaporkan masalah dasar', () => {
    document.documentElement.setAttribute('lang', 'id'); document.title = 'Tes'
    document.body.innerHTML = '<main><h1>Judul</h1><label for="n">Nama</label><input id="n"><button>Kirim</button><img src="a.png" alt="Logo"></main>'
    const { issues } = auditPage(document, { disable: ['contrast'] })
    expect(issues.filter((i) => ['img-alt', 'form-label', 'button-name', 'html-lang'].includes(i.rule))).toHaveLength(0)
  })
  it('kontras WCAG: hitam/putih 21:1', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0)
  })
})

describe('suara & sesi', () => {
  it('splitText memecah teks panjang', () => {
    const long = 'Ini kalimat satu. '.repeat(40)
    const parts = splitText(long, 100)
    expect(parts.length).toBeGreaterThan(3)
    expect(parts.every((p) => p.length <= 110)).toBe(true)
  })
  it('matchCommand memilih frasa terpanjang & per-bahasa', () => {
    const cmds = [
      { id: 'a', phrases: { id: ['teks'] }, run: () => {} },
      { id: 'b', phrases: { id: ['perbesar teks'] }, run: () => {} },
    ] as any
    expect(matchCommand('Tolong, perbesar teks!', cmds, 'id')?.id).toBe('b')
    expect(matchCommand('perbesar teks', cmds, 'en')).toBeNull()
  })
  it('penjaga sesi: peringatan → perpanjang → habis', () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn(); const onWarn = vi.fn()
    const g = createInactivityGuard({ timeoutMs: 10_000, warnBeforeMs: 4_000, onTimeout, onWarn })
    g.start()
    vi.advanceTimersByTime(6_100)
    expect(onWarn).toHaveBeenCalledTimes(1)
    const btn = document.querySelector<HTMLButtonElement>('.moonable-modal button')!
    expect(btn).toBeTruthy()
    btn.click() // perpanjang
    expect(document.querySelector('.moonable-modal')).toBeNull()
    vi.advanceTimersByTime(6_100)
    expect(onWarn).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(4_100)
    expect(onTimeout).toHaveBeenCalledTimes(1)
    g.stop(); vi.useRealTimers()
  })
})
