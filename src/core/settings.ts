import type { MoonableSettings, PresetId } from './types'

export const DEFAULT_STORAGE_KEY = 'moonable:settings'

export const DEFAULT_SETTINGS: MoonableSettings = {
  fontScale: 1,
  lineHeight: 0,
  letterSpacing: 0,
  wordSpacing: 0,
  fontFamily: 'default',
  textAlign: 'default',
  contrast: 'off',
  saturation: 'default',
  colorBlind: 'off',
  highlightLinks: false,
  highlightHeadings: false,
  hideImages: false,
  largeCursor: false,
  largeTargets: false,
  strongFocus: false,
  reduceMotion: false,
  readingGuide: 'off',
  limitLineWidth: false,
  simplify: false,
  pauseMedia: false,
  captions: false,
  visualAlerts: false,
  speechRate: 1,
}

/** Key yang dipetakan menjadi atribut data-moonable-* pada <html>. */
export const DOM_KEYS = [
  'fontScale', 'lineHeight', 'letterSpacing', 'wordSpacing', 'fontFamily', 'textAlign',
  'contrast', 'saturation', 'colorBlind', 'highlightLinks', 'highlightHeadings', 'hideImages',
  'largeCursor', 'largeTargets', 'strongFocus', 'reduceMotion', 'readingGuide',
  'limitLineWidth', 'simplify',
] as const satisfies readonly (keyof MoonableSettings)[]

const ENUMS: Partial<Record<keyof MoonableSettings, readonly string[]>> = {
  fontFamily: ['default', 'readable', 'dyslexia', 'serif', 'mono'],
  textAlign: ['default', 'left'],
  contrast: ['off', 'dark', 'light', 'yellow'],
  saturation: ['default', 'low', 'high', 'gray'],
  colorBlind: ['off', 'protanopia', 'deuteranopia', 'tritanopia'],
  readingGuide: ['off', 'line', 'mask'],
}

const RANGES: Partial<Record<keyof MoonableSettings, [number, number]>> = {
  fontScale: [0.8, 2.5],
  lineHeight: [0, 3],
  letterSpacing: [0, 0.5],
  wordSpacing: [0, 1],
  speechRate: [0.3, 2.5],
}

/** Validasi + clamp input apa pun menjadi pengaturan yang aman (data dari storage tidak dipercaya). */
export function sanitizeSettings(input: unknown, base: MoonableSettings = DEFAULT_SETTINGS): MoonableSettings {
  const out: Record<string, unknown> = { ...base }
  if (!input || typeof input !== 'object') return out as unknown as MoonableSettings
  const src = input as Record<string, unknown>
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof MoonableSettings)[]) {
    const v = src[key]
    if (v === undefined) continue
    const def = DEFAULT_SETTINGS[key]
    if (typeof def === 'boolean') {
      if (typeof v === 'boolean') out[key] = v
    } else if (typeof def === 'number') {
      if (typeof v === 'number' && Number.isFinite(v)) {
        const [min, max] = RANGES[key] ?? [-Infinity, Infinity]
        out[key] = Math.round(Math.min(max, Math.max(min, v)) * 1000) / 1000
      }
    } else if (typeof v === 'string' && ENUMS[key]?.includes(v)) {
      out[key] = v
    }
  }
  return out as unknown as MoonableSettings
}

export function settingsEqual(a: MoonableSettings, b: MoonableSettings): boolean {
  return (Object.keys(DEFAULT_SETTINGS) as (keyof MoonableSettings)[]).every((k) => a[k] === b[k])
}

/** Preset siap pakai. Preset menimpa SEMUA pengaturan (kembali ke bawaan + nilai preset). */
export const PRESETS: Record<PresetId, Partial<MoonableSettings>> = {
  // Dosen / pengguna lanjut usia: huruf besar, tombol besar, tanpa gerakan, suara lebih pelan
  elderly: {
    fontScale: 1.5, lineHeight: 1.8, letterSpacing: 0.02, fontFamily: 'readable',
    highlightLinks: true, largeTargets: true, largeCursor: true, strongFocus: true,
    reduceMotion: true, pauseMedia: true, limitLineWidth: true, simplify: true,
    captions: true, visualAlerts: true, speechRate: 0.85,
  },
  lowVision: {
    fontScale: 2, lineHeight: 1.8, letterSpacing: 0.05, fontFamily: 'readable', contrast: 'dark',
    highlightLinks: true, largeTargets: true, largeCursor: true, strongFocus: true,
    reduceMotion: true, limitLineWidth: true, speechRate: 0.9,
  },
  dyslexia: {
    fontScale: 1.2, fontFamily: 'dyslexia', lineHeight: 2, letterSpacing: 0.12, wordSpacing: 0.16,
    textAlign: 'left', limitLineWidth: true, readingGuide: 'line',
  },
  focus: {
    lineHeight: 1.8, textAlign: 'left', highlightHeadings: true, simplify: true, reduceMotion: true,
    pauseMedia: true, limitLineWidth: true, readingGuide: 'mask',
  },
  colorBlind: { colorBlind: 'deuteranopia', highlightLinks: true },
  motor: { largeTargets: true, largeCursor: true, strongFocus: true, reduceMotion: true, pauseMedia: true },
  hearing: { captions: true, visualAlerts: true, pauseMedia: true },
}

export function presetSettings(id: PresetId): MoonableSettings {
  return sanitizeSettings(PRESETS[id], DEFAULT_SETTINGS)
}

export function isPresetActive(id: PresetId, s: MoonableSettings): boolean {
  const p = PRESETS[id]
  return (Object.keys(p) as (keyof MoonableSettings)[]).every((k) => s[k] === p[k])
}
