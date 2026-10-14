import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { MoonablePanel, MoonableProvider, SkipLink, useMoonable } from '../src/react'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function Demo() {
  const { settings, increaseText } = useMoonable()
  return <button id="demo" onClick={() => increaseText()}>{Math.round(settings.fontScale * 100)}</button>
}

describe('react adapter', () => {
  it('SSR: render tanpa error dan tanpa panel terbuka', () => {
    const html = renderToString(<MoonableProvider><SkipLink /><MoonablePanel /><Demo /></MoonableProvider>)
    expect(html).toContain('moonable-fab')
    expect(html).toContain('Lewati ke konten utama')
    expect(html).not.toContain('role="dialog"')
    expect(html).toContain('>100<')
  })
  it('client: buka panel, pilih Mode Lansia, fokus terkunci, Escape menutup', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    localStorage.clear()
    const root = createRoot(document.getElementById('root')!)
    await act(async () => { root.render(<MoonableProvider><MoonablePanel /><Demo /></MoonableProvider>) })

    const fab = document.querySelector<HTMLButtonElement>('.moonable-fab')!
    await act(async () => { fab.click() })
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog).toBeTruthy()
    expect(dialog.contains(document.activeElement)).toBe(true)

    const elderly = Array.from(document.querySelectorAll<HTMLButtonElement>('.moonable-preset')).find((b) => b.textContent!.includes('Mode Lansia'))!
    await act(async () => { elderly.click() })
    expect(document.documentElement.style.getPropertyValue('--moonable-font-scale')).toBe('1.5')
    expect(document.getElementById('demo')!.textContent).toBe('150')
    expect(elderly.getAttribute('aria-pressed')).toBe('true')

    // tombol + ukuran teks
    const plus = document.querySelector<HTMLButtonElement>('[aria-label^="Tambah: Ukuran teks"]')!
    await act(async () => { plus.click() })
    expect(document.documentElement.style.getPropertyValue('--moonable-font-scale')).toBe('1.75')

    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await act(async () => { root.unmount() })
    expect(document.documentElement.getAttribute('data-moonable-font-scale')).toBeNull()
  })
})
