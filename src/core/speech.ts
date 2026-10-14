/** Pecah teks panjang jadi potongan pendek (Chrome menghentikan TTS yang terlalu panjang). */
export function splitText(text: string, max = 180): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const sentences = clean.match(/[^.!?;:]+[.!?;:]*\s*/g) ?? [clean]
  const out: string[] = []
  let buf = ''
  const flush = () => { if (buf.trim()) out.push(buf.trim()); buf = '' }
  for (const sent of sentences) {
    if (sent.length > max) {
      flush()
      let part = ''
      for (const w of sent.split(' ')) {
        if ((part + ' ' + w).length > max) { out.push(part.trim()); part = w } else part += ' ' + w
      }
      if (part.trim()) out.push(part.trim())
    } else if ((buf + sent).length > max) { flush(); buf = sent } else buf += sent
  }
  flush()
  return out
}

/** Ambil teks yang terlihat dari halaman (abaikan skrip, elemen tersembunyi, dan UI aksesibilitas). */
export function getReadableText(doc: Document): string {
  const root = (doc.querySelector('main, [role="main"], article') as HTMLElement | null) ?? doc.body
  const win = doc.defaultView as Window
  const skip = 'script,style,noscript,template,svg,[data-moonable-ui],[aria-hidden="true"],[hidden]'
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */)
  const parts: string[] = []
  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim()
    const el = node.parentElement
    if (!text || !el || el.closest(skip)) continue
    const cs = win.getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    parts.push(text)
  }
  return parts.join(' ')
}

export interface SpeechController {
  readonly supported: boolean
  speak(text: string): void
  stop(): void
  pause(): void
  resume(): void
}

export function createSpeech(o: {
  getLang: () => string
  getRate: () => number
  onState: (s: { speaking: boolean; paused: boolean }) => void
}): SpeechController {
  const synth: SpeechSynthesis | undefined =
    typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : undefined
  let queue: string[] = []
  let token = 0
  let paused = false

  const pickVoice = (lang: string) => {
    const voices = synth?.getVoices() ?? []
    const l = lang.toLowerCase()
    return voices.find((v) => v.lang.toLowerCase() === l) ?? voices.find((v) => v.lang.toLowerCase().startsWith(l.slice(0, 2)))
  }

  const finish = () => { paused = false; o.onState({ speaking: false, paused: false }) }

  const next = (mine: number) => {
    if (!synth || mine !== token) return
    const chunk = queue.shift()
    if (!chunk) return finish()
    const u = new SpeechSynthesisUtterance(chunk)
    const lang = o.getLang()
    u.lang = lang
    u.rate = o.getRate()
    const voice = pickVoice(lang)
    if (voice) u.voice = voice
    u.onend = () => next(mine)
    u.onerror = (e) => { if (e.error !== 'canceled' && e.error !== 'interrupted') next(mine) }
    synth.speak(u)
  }

  return {
    supported: !!synth,
    speak(text) {
      if (!synth) return
      synth.cancel()
      token++
      queue = splitText(text)
      if (!queue.length) return finish()
      paused = false
      o.onState({ speaking: true, paused: false })
      const mine = token
      setTimeout(() => next(mine), 50)
    },
    stop() {
      if (!synth) return
      token++
      queue = []
      synth.cancel()
      finish()
    },
    pause() { if (synth) { synth.pause(); paused = true; o.onState({ speaking: true, paused: true }) } },
    resume() { if (synth) { synth.resume(); paused = false; o.onState({ speaking: true, paused: false }) } },
  }
}
