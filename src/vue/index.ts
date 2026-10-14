import {
  computed, defineComponent, h, inject, nextTick, onBeforeUnmount, onMounted, shallowRef, watch,
  type App, type ComputedRef, type InjectionKey, type PropType, type ShallowRef, type VNode,
} from 'vue'
import {
  createMoonable, createInactivityGuard, getPanelModel, ICON_ACCESS, trapFocus, translate,
} from '../core'
import type { Moonable, MoonableOptions, MoonableSettings, MoonableState, ControlVM, InactivityGuardOptions, Locale } from '../core'

export type * from '../core'

export interface MoonableContext { api: Moonable; state: ShallowRef<MoonableState> }

// Symbol.for → tetap sama walau modul ini ter-bundle dua kali (mis. oleh modul Nuxt)
export const MOONABLE_KEY: InjectionKey<MoonableContext> = Symbol.for('moonable')

export interface MoonableVueOptions extends MoonableOptions {
  /** Panggil init() otomatis setelah app.mount(). Matikan jika Anda memanggil init() sendiri (mis. Nuxt). */
  autoInit?: boolean
}

/* ------------------------------------------------------------------ */
/* Composable                                                          */
/* ------------------------------------------------------------------ */
export function useMoonable() {
  const ctx = inject(MOONABLE_KEY)
  if (!ctx) throw new Error('[moonable] Pasang plugin dulu: app.use(MoonablePlugin) atau tambahkan modul Nuxt.')
  const { api, state } = ctx
  const settings: ComputedRef<MoonableSettings> = computed(() => state.value.settings)
  /** t() reaktif terhadap perubahan bahasa */
  const t: Moonable['t'] = (key, vars) => { void state.value.locale; return api.t(key, vars) }
  return { ...api, api, state, settings, t }
}

/* ------------------------------------------------------------------ */
/* Tautan lompat                                                       */
/* ------------------------------------------------------------------ */
export const SkipLink = defineComponent({
  name: 'MoonableSkipLink',
  props: {
    targetId: { type: String, default: 'main-content' },
    locale: { type: String as PropType<Locale>, default: undefined },
  },
  setup(props, { slots }) {
    const ctx = inject(MOONABLE_KEY, null)
    return () => {
      const loc = props.locale ?? ctx?.state.value.locale ?? 'id'
      return h('a', {
        class: 'moonable-skip-link',
        'data-moonable-ui': '',
        href: `#${props.targetId}`,
        onClick: (e: Event) => {
          const el = document.getElementById(props.targetId)
          if (!el) return
          e.preventDefault()
          if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
          el.focus()
          el.scrollIntoView()
        },
      }, slots.default ? slots.default() : translate(loc, 'panel.skip'))
    }
  },
})

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */
export const MoonablePanel = defineComponent({
  name: 'MoonablePanel',
  props: {
    position: { type: String as PropType<'left' | 'right'>, default: 'right' },
    hideButton: { type: Boolean, default: false },
  },
  setup(props) {
    const { api, state, t } = useMoonable()
    const panelEl = shallowRef<HTMLElement | null>(null)
    const uid = 'moonable-' + Math.random().toString(36).slice(2, 8)
    let release: (() => void) | null = null

    watch(() => state.value.panelOpen, async (open) => {
      release?.(); release = null
      if (!open) return
      await nextTick()
      if (panelEl.value) release = trapFocus(panelEl.value, { onEscape: () => api.closePanel() })
    })
    onBeforeUnmount(() => release?.())

    const control = (c: ControlVM): VNode => {
      switch (c.kind) {
        case 'stepper':
          return h('div', { class: 'moonable-control', role: 'group', 'aria-label': c.label, key: c.id }, [
            h('span', { class: 'moonable-control-label', 'aria-hidden': 'true' }, c.label),
            h('div', { class: 'moonable-stepper' }, [
              h('button', { type: 'button', class: 'moonable-btn', disabled: !c.canDec, 'aria-label': `${t('panel.decrease')}: ${c.label}`, onClick: () => api.step(c.key, -1) }, '−'),
              h('output', { class: 'moonable-stepper-value', 'aria-live': 'polite' }, c.display),
              h('button', { type: 'button', class: 'moonable-btn', disabled: !c.canInc, 'aria-label': `${t('panel.increase')}: ${c.label}`, onClick: () => api.step(c.key, 1) }, '+'),
            ]),
          ])
        case 'select': {
          const id = `${uid}-${c.id}`
          return h('div', { class: 'moonable-control', key: c.id }, [
            h('label', { class: 'moonable-control-label', for: id }, c.label),
            h('select', { id, class: 'moonable-select', value: c.value, onChange: (e: Event) => api.set({ [c.key]: (e.target as HTMLSelectElement).value } as never) },
              c.options.map((o) => h('option', { value: o.value, selected: o.value === c.value }, o.label))),
            c.hint ? h('p', { class: 'moonable-hint' }, c.hint) : null,
          ])
        }
        case 'toggle':
          return h('div', { class: 'moonable-control', key: c.id }, [
            h('button', { type: 'button', role: 'switch', 'aria-checked': String(c.checked), class: 'moonable-btn moonable-switch', onClick: () => api.set({ [c.key]: !c.checked } as never) }, [
              h('span', c.label),
              h('span', { class: 'moonable-switch-state' }, c.stateLabel),
            ]),
            c.hint ? h('p', { class: 'moonable-hint' }, c.hint) : null,
          ])
        case 'action':
          return h('div', { class: 'moonable-control', key: c.id }, [
            h('button', { type: 'button', class: 'moonable-btn', 'aria-pressed': c.pressed === undefined ? undefined : String(c.pressed), onClick: () => api.runAction(c.action) }, c.label),
            c.hint ? h('p', { class: 'moonable-hint' }, c.hint) : null,
          ])
        case 'note':
          return h('p', { class: 'moonable-note', key: c.id }, c.text)
      }
    }

    return () => {
      const s = state.value
      const model = getPanelModel(s, t)
      const children: (VNode | null)[] = []

      if (!props.hideButton) {
        children.push(h('button', {
          type: 'button', class: 'moonable-fab', 'aria-haspopup': 'dialog', 'aria-expanded': String(s.panelOpen),
          'aria-label': t('fab.aria'), onClick: () => api.togglePanel(),
        }, [
          h('span', { 'aria-hidden': 'true', style: 'display:inline-flex', innerHTML: ICON_ACCESS }),
          h('span', t('fab.label')),
        ]))
      }

      if (s.panelOpen) {
        children.push(h('div', { class: 'moonable-backdrop', 'aria-hidden': 'true', onClick: () => api.closePanel() }))
        children.push(h('div', { ref: panelEl, class: 'moonable-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${uid}-t`, tabindex: '-1' }, [
          h('div', { class: 'moonable-panel-head' }, [
            h('h2', { id: `${uid}-t` }, model.title),
            h('button', { type: 'button', class: 'moonable-btn', onClick: () => api.closePanel() }, model.closeLabel),
          ]),
          h('div', { class: 'moonable-panel-body' }, [
            h('h3', { id: `${uid}-p` }, model.presetsLabel),
            h('ul', { class: 'moonable-presets', 'aria-labelledby': `${uid}-p` }, model.presets.map((p, i) =>
              h('li', { key: p.id }, [
                h('button', {
                  type: 'button', 'aria-pressed': String(p.active),
                  class: `moonable-btn moonable-preset${i === 0 ? ' moonable-preset--lead' : ''}`,
                  onClick: () => api.togglePreset(p.id),
                }, [h('span', p.label), h('small', p.desc)]),
              ]))),
            ...model.sections.map((sec, i) =>
              h('details', { class: 'moonable-section', key: sec.id, open: i === 0 }, [
                h('summary', [h('span', { class: 'moonable-section-icon', 'aria-hidden': 'true' }, sec.icon), sec.title]),
                h('div', { class: 'moonable-controls' }, sec.controls.map(control)),
              ])),
          ]),
          h('div', { class: 'moonable-panel-foot' }, [
            h('button', { type: 'button', class: 'moonable-btn', onClick: () => api.reset() }, model.resetLabel),
            h('p', model.shortcutHint),
          ]),
        ]))
      }

      return h('div', { class: 'moonable-root', 'data-moonable-ui': '', 'data-position': props.position }, children)
    }
  },
})

/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */
export const MoonablePlugin = {
  install(app: App, options: MoonableVueOptions = {}) {
    const { autoInit = true, ...opts } = options
    const api = createMoonable(opts)
    const state = shallowRef(api.getState())
    api.subscribe(() => { state.value = api.getState() })

    app.provide(MOONABLE_KEY, { api, state })
    app.config.globalProperties.$moonable = api
    app.component('MoonablePanel', MoonablePanel)
    app.component('MoonableSkipLink', SkipLink)

    if (autoInit && typeof window !== 'undefined') {
      const mount = app.mount.bind(app)
      app.mount = ((...args: Parameters<App['mount']>) => {
        const vm = mount(...args)
        api.init() // setelah hydrate → tidak ada hydration mismatch
        return vm
      }) as App['mount']
    }
  },
}

/* ------------------------------------------------------------------ */
/* Composable penjaga sesi                                             */
/* ------------------------------------------------------------------ */
export function useInactivityGuard(options: InactivityGuardOptions) {
  let guard: ReturnType<typeof createInactivityGuard> | null = null
  onMounted(() => { guard = createInactivityGuard(options); guard.start() })
  onBeforeUnmount(() => guard?.stop())
  return { extend: () => guard?.extend() }
}

export { createMoonable }
