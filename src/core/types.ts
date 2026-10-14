export type Locale = 'id' | 'en'
export type ContrastMode = 'off' | 'dark' | 'light' | 'yellow'
export type SaturationMode = 'default' | 'low' | 'high' | 'gray'
export type ColorBlindMode = 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia'
export type FontFamilyMode = 'default' | 'readable' | 'dyslexia' | 'serif' | 'mono'
export type TextAlignMode = 'default' | 'left'
export type ReadingGuideMode = 'off' | 'line' | 'mask'
export type PresetId = 'elderly' | 'lowVision' | 'dyslexia' | 'focus' | 'colorBlind' | 'motor' | 'hearing'
export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface MoonableSettings {
  /** Skala ukuran teks. 1 = 100% */
  fontScale: number
  /** Tinggi baris. 0 = bawaan situs */
  lineHeight: number
  /** Jarak antar huruf (em). 0 = bawaan */
  letterSpacing: number
  /** Jarak antar kata (em). 0 = bawaan */
  wordSpacing: number
  fontFamily: FontFamilyMode
  textAlign: TextAlignMode
  contrast: ContrastMode
  saturation: SaturationMode
  colorBlind: ColorBlindMode
  highlightLinks: boolean
  highlightHeadings: boolean
  hideImages: boolean
  largeCursor: boolean
  largeTargets: boolean
  strongFocus: boolean
  reduceMotion: boolean
  readingGuide: ReadingGuideMode
  limitLineWidth: boolean
  /** Sembunyikan elemen bertanda [data-moonable-distraction] */
  simplify: boolean
  /** Cegah video/audio autoplay */
  pauseMedia: boolean
  /** Otomatis tampilkan subtitle/caption pada <video> */
  captions: boolean
  /** Notifikasi visual (toast) + getar untuk pengguna tuli/tuna rungu */
  visualAlerts: boolean
  /** Kecepatan suara TTS */
  speechRate: number
}

export interface MoonableState {
  /** true setelah init() berjalan di browser */
  ready: boolean
  locale: Locale
  settings: MoonableSettings
  panelOpen: boolean
  speaking: boolean
  paused: boolean
  listening: boolean
  capabilities: { speech: boolean; recognition: boolean }
}

export interface VoiceCommand {
  id: string
  /** Frasa pemicu. Array = berlaku untuk semua bahasa, atau per-locale. */
  phrases: string[] | Partial<Record<Locale, string[]>>
  run: (api: import('./instance').Moonable) => void
}
