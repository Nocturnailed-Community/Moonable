import type { Locale, VoiceCommand } from './types'

export interface VoiceController {
  readonly supported: boolean
  start(): boolean
  stop(): void
}

export function createVoice(o: {
  getLang: () => string
  onFinal: (transcript: string) => void
  onState: (listening: boolean) => void
  onError: (code: string) => void
}): VoiceController {
  const w = (typeof window !== 'undefined' ? window : undefined) as any
  const Ctor = w?.SpeechRecognition ?? w?.webkitSpeechRecognition
  let rec: any = null
  let want = false

  return {
    supported: !!Ctor,
    start() {
      if (!Ctor) return false
      rec = new Ctor()
      rec.lang = o.getLang()
      rec.continuous = true
      rec.interimResults = false
      rec.onresult = (e: any) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) o.onFinal(String(e.results[i][0].transcript))
        }
      }
      rec.onerror = (e: any) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { want = false; o.onError(e.error); o.onState(false) }
      }
      // peramban menghentikan sesi secara berkala — sambung lagi selama pengguna masih ingin aktif
      rec.onend = () => {
        if (want) { try { rec.start() } catch { /* sudah berjalan */ } } else o.onState(false)
      }
      want = true
      try { rec.start() } catch { /* abaikan */ }
      o.onState(true)
      return true
    },
    stop() {
      want = false
      try { rec?.stop() } catch { /* abaikan */ }
      o.onState(false)
    },
  }
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()

/** Cari perintah dengan frasa terpanjang yang cocok dengan ucapan. */
export function matchCommand(transcript: string, commands: VoiceCommand[], locale: Locale): VoiceCommand | null {
  const said = ' ' + normalize(transcript) + ' '
  let best: { cmd: VoiceCommand; len: number } | null = null
  for (const cmd of commands) {
    const phrases = Array.isArray(cmd.phrases) ? cmd.phrases : cmd.phrases[locale] ?? []
    for (const p of phrases) {
      const n = normalize(p)
      if (n && said.includes(' ' + n + ' ') && (!best || n.length > best.len)) best = { cmd, len: n.length }
    }
  }
  return best?.cmd ?? null
}
