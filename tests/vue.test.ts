import { createApp, createSSRApp, defineComponent, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { MoonablePanel, MoonablePlugin, SkipLink, useMoonable } from '../src/vue'

const Demo = defineComponent({
  setup() {
    const { settings } = useMoonable()
    return () => h('span', { id: 'size' }, String(Math.round(settings.value.fontScale * 100)))
  },
})
const Root = defineComponent({ render: () => h('div', [h(SkipLink), h(MoonablePanel), h(Demo)]) })

describe('vue adapter', () => {
  it('SSR: render tanpa error', async () => {
    const app = createSSRApp(Root)
    app.use(MoonablePlugin)
    const html = await renderToString(app)
    expect(html).toContain('moonable-fab')
    expect(html).toContain('Lewati ke konten utama')
    expect(html).not.toContain('role="dialog"')
  })
  it('client: autoInit setelah mount, panel, preset, escape', async () => {
    document.body.innerHTML = '<div id="app"></div>'
    localStorage.clear()
    const app = createApp(Root)
    app.use(MoonablePlugin)
    app.mount('#app')
    await nextTick()
    document.querySelector<HTMLButtonElement>('.moonable-fab')!.click()
    await nextTick(); await nextTick()
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog).toBeTruthy()
    expect(dialog.contains(document.activeElement)).toBe(true)
    const elderly = Array.from(document.querySelectorAll<HTMLButtonElement>('.moonable-preset')).find((b) => b.textContent!.includes('Mode Lansia'))!
    elderly.click(); await nextTick()
    expect(document.documentElement.style.getPropertyValue('--moonable-font-scale')).toBe('1.5')
    expect(document.getElementById('size')!.textContent).toBe('150')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    app.unmount()
  })
})
