import { isPresetActive } from './settings'
import type { MessageKey, TFn } from './i18n'
import type { MoonableSettings, MoonableState, PresetId } from './types'

export type RangeKey = 'fontScale' | 'lineHeight' | 'letterSpacing' | 'wordSpacing' | 'speechRate'
export type SelectKey = 'fontFamily' | 'textAlign' | 'contrast' | 'saturation' | 'colorBlind' | 'readingGuide'
export type ToggleKey =
  | 'highlightLinks' | 'highlightHeadings' | 'hideImages' | 'largeCursor' | 'largeTargets'
  | 'strongFocus' | 'reduceMotion' | 'pauseMedia' | 'limitLineWidth' | 'simplify' | 'captions' | 'visualAlerts'
export type ActionId = 'readPage' | 'readSelection' | 'stopReading' | 'pauseReading' | 'resumeReading' | 'toggleVoice'

/** Nilai diskret untuk tombol −/+ (lebih mudah dipakai lansia & tremor daripada slider). */
export const RANGE_STEPS: Record<RangeKey, number[]> = {
  fontScale: [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2, 2.5],
  lineHeight: [0, 1.4, 1.6, 1.8, 2, 2.2, 2.5],
  letterSpacing: [0, 0.02, 0.05, 0.08, 0.12, 0.16, 0.2],
  wordSpacing: [0, 0.08, 0.16, 0.24, 0.32, 0.4],
  speechRate: [0.5, 0.7, 0.85, 1, 1.2, 1.5, 2],
}

export const SELECT_OPTIONS: Record<SelectKey, string[]> = {
  fontFamily: ['default', 'readable', 'dyslexia', 'serif', 'mono'],
  textAlign: ['default', 'left'],
  contrast: ['off', 'dark', 'light', 'yellow'],
  saturation: ['default', 'low', 'high', 'gray'],
  colorBlind: ['off', 'protanopia', 'deuteranopia', 'tritanopia'],
  readingGuide: ['off', 'line', 'mask'],
}

export const PRESET_ORDER: PresetId[] = ['elderly', 'lowVision', 'dyslexia', 'focus', 'colorBlind', 'motor', 'hearing']

/** Geser nilai ke langkah berikutnya (dir = +1 / −1). */
export function stepValue(key: RangeKey, current: number, dir: 1 | -1): number {
  const steps = RANGE_STEPS[key]
  let idx = 0
  let best = Infinity
  steps.forEach((v, i) => { const d = Math.abs(v - current); if (d < best) { best = d; idx = i } })
  return steps[Math.min(steps.length - 1, Math.max(0, idx + dir))]
}

/* ---------- View-model: dipakai React & Vue agar tampilannya identik ---------- */
export type ControlVM =
  | { kind: 'stepper'; id: string; key: RangeKey; label: string; display: string; canDec: boolean; canInc: boolean }
  | { kind: 'select'; id: string; key: SelectKey; label: string; hint?: string; value: string; options: { value: string; label: string }[] }
  | { kind: 'toggle'; id: string; key: ToggleKey; label: string; hint?: string; checked: boolean; stateLabel: string }
  | { kind: 'action'; id: string; action: ActionId; label: string; hint?: string; pressed?: boolean }
  | { kind: 'note'; id: string; text: string }

export interface SectionVM { id: string; title: string; icon: string; controls: ControlVM[] }
export interface PresetVM { id: PresetId; label: string; desc: string; active: boolean }
export interface PanelModel {
  title: string
  closeLabel: string
  resetLabel: string
  presetsLabel: string
  shortcutHint: string
  presets: PresetVM[]
  sections: SectionVM[]
}

const fmt = (key: RangeKey, v: number, t: TFn): string => {
  if (key === 'fontScale') return `${Math.round(v * 100)}%`
  if (key === 'speechRate') return `${v}×`
  if (v === 0) return t('opt.default')
  return key === 'lineHeight' ? `${v}` : `${v} em`
}

export function getPanelModel(state: MoonableState, t: TFn): PanelModel {
  const s: MoonableSettings = state.settings
  const key = (k: string) => `ctl.${k}` as MessageKey

  const stepper = (k: RangeKey): ControlVM => {
    const steps = RANGE_STEPS[k]
    return { kind: 'stepper', id: k, key: k, label: t(key(k)), display: fmt(k, s[k], t),
      canDec: s[k] > steps[0], canInc: s[k] < steps[steps.length - 1] }
  }
  const select = (k: SelectKey, hint?: MessageKey): ControlVM => ({
    kind: 'select', id: k, key: k, label: t(key(k)), hint: hint ? t(hint) : undefined, value: s[k] as string,
    options: SELECT_OPTIONS[k].map((v) => ({ value: v, label: t(`opt.${v}` as MessageKey) })),
  })
  const toggle = (k: ToggleKey, hint?: MessageKey): ControlVM => ({
    kind: 'toggle', id: k, key: k, label: t(key(k)), hint: hint ? t(hint) : undefined,
    checked: s[k], stateLabel: s[k] ? t('panel.on') : t('panel.off'),
  })
  const action = (a: ActionId, label: MessageKey, extra: Partial<ControlVM & { kind: 'action' }> = {}): ControlVM =>
    ({ kind: 'action', id: a, action: a, label: t(label), ...extra }) as ControlVM

  const sound: ControlVM[] = []
  if (state.capabilities.speech) {
    if (state.speaking) {
      sound.push(action(state.paused ? 'resumeReading' : 'pauseReading', state.paused ? 'act.resumeReading' : 'act.pauseReading'))
      sound.push(action('stopReading', 'act.stopReading'))
    } else {
      sound.push(action('readPage', 'act.readPage'))
      sound.push(action('readSelection', 'act.readSelection'))
    }
    sound.push(stepper('speechRate'))
  } else if (state.ready) {
    sound.push({ kind: 'note', id: 'no-speech', text: t('note.noSpeech') })
  }
  sound.push(toggle('captions'), toggle('visualAlerts', 'hint.visualAlerts'))
  if (state.capabilities.recognition) {
    sound.push(action('toggleVoice', state.listening ? 'act.voiceStop' : 'act.voiceStart',
      { pressed: state.listening, hint: t('hint.voice') }))
  } else if (state.ready) {
    sound.push({ kind: 'note', id: 'no-voice', text: t('note.noVoice') })
  }

  return {
    title: t('panel.title'),
    closeLabel: t('panel.close'),
    resetLabel: t('panel.reset'),
    presetsLabel: t('panel.presets'),
    shortcutHint: t('panel.shortcut'),
    presets: PRESET_ORDER.map((id) => ({
      id, label: t(`preset.${id}` as MessageKey), desc: t(`preset.${id}.desc` as MessageKey), active: isPresetActive(id, s),
    })),
    sections: [
      { id: 'text', title: t('section.text'), icon: 'Aa', controls: [
        stepper('fontScale'), stepper('lineHeight'), stepper('letterSpacing'), stepper('wordSpacing'),
        select('fontFamily'), select('textAlign') ] },
      { id: 'color', title: t('section.color'), icon: '◐', controls: [
        select('contrast'), select('saturation'), select('colorBlind', 'hint.colorBlind'),
        toggle('highlightLinks'), toggle('highlightHeadings'), toggle('hideImages') ] },
      { id: 'motor', title: t('section.motor'), icon: '☝', controls: [
        toggle('largeCursor'), toggle('largeTargets'), toggle('strongFocus'), toggle('reduceMotion'), toggle('pauseMedia') ] },
      { id: 'focus', title: t('section.focus'), icon: '≡', controls: [
        select('readingGuide'), toggle('limitLineWidth'), toggle('simplify', 'hint.simplify') ] },
      { id: 'sound', title: t('section.sound'), icon: '♪', controls: sound },
    ],
  }
}

/** Ikon "akses universal" (SVG string, aman dipakai via innerHTML/dangerouslySetInnerHTML). */
export const ICON_ACCESS =
  '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false"><circle cx="12" cy="4.5" r="2.2" fill="currentColor"/><path d="M4.5 8.5l7.5 1.6 7.5-1.6M12 10.1V15m0 0l-3.2 6M12 15l3.2 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
