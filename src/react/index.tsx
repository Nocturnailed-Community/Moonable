import * as React from 'react'
import {
  createMoonable, getInitScript, getPanelModel, ICON_ACCESS, stepValue, trapFocus, translate,
  createInactivityGuard,
} from '../core'
import type { Moonable, MoonableOptions, MoonableState, ControlVM, InactivityGuardOptions, Locale } from '../core'

export type * from '../core'

const Ctx = React.createContext<Moonable | null>(null)

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */
export interface MoonableProviderProps {
  children?: React.ReactNode
  /** Opsi createMoonable. Cukup diberikan sekali. */
  options?: MoonableOptions
  /** Pakai instance buatan sendiri (opsional). */
  instance?: Moonable
}

export function MoonableProvider({ children, options, instance }: MoonableProviderProps) {
  const [api] = React.useState<Moonable>(() => instance ?? createMoonable(options))
  React.useEffect(() => {
    api.init() // aman untuk StrictMode (init → destroy → init)
    return () => api.destroy()
  }, [api])
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

function useApi(): Moonable {
  const api = React.useContext(Ctx)
  if (!api) throw new Error('[moonable] Bungkus aplikasi dengan <MoonableProvider>.')
  return api
}

/** Hook utama: state reaktif + semua aksi. */
export function useMoonable() {
  const api = useApi()
  const state: MoonableState = React.useSyncExternalStore(api.subscribe, api.getState, api.getServerState)
  return React.useMemo(
    () => ({ ...api, api, state, settings: state.settings, t: api.t }),
    // `t` bergantung pada locale di state
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, state],
  )
}

/* ------------------------------------------------------------------ */
/* Skrip anti-kedip & tautan lompat                                    */
/* ------------------------------------------------------------------ */
/**
 * Letakkan di <head> (layout.tsx). Menerapkan pengaturan tersimpan sebelum paint pertama.
 * Tambahkan suppressHydrationWarning pada <html>.
 */
export function MoonableInitScript(props: { storageKey?: string; textScaling?: 'rem' | 'zoom'; nonce?: string }) {
  return (
    <script
      nonce={props.nonce}
      dangerouslySetInnerHTML={{ __html: getInitScript({ storageKey: props.storageKey, textScaling: props.textScaling }) }}
    />
  )
}

export interface SkipLinkProps {
  /** id elemen konten utama. Bawaan "main-content". */
  targetId?: string
  locale?: Locale
  children?: React.ReactNode
}

/** Tautan "Lewati ke konten utama" untuk pengguna keyboard & pembaca layar. Taruh sebagai elemen pertama <body>. */
export function SkipLink({ targetId = 'main-content', locale, children }: SkipLinkProps) {
  const ctx = React.useContext(Ctx)
  const loc = locale ?? ctx?.getState().locale ?? 'id'
  return (
    <a
      className="moonable-skip-link"
      data-moonable-ui=""
      href={`#${targetId}`}
      onClick={(e) => {
        const el = document.getElementById(targetId)
        if (!el) return
        e.preventDefault()
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
        el.focus()
        el.scrollIntoView()
      }}
    >
      {children ?? translate(loc, 'panel.skip')}
    </a>
  )
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */
export interface MoonablePanelProps {
  position?: 'left' | 'right'
  /** Sembunyikan tombol melayang (buka panel dari tombol Anda sendiri via useMoonable().openPanel()). */
  hideButton?: boolean
}

export function MoonablePanel({ position = 'right', hideButton = false }: MoonablePanelProps) {
  const { api, state } = useMoonable()
  const t = api.t
  const model = getPanelModel(state, t)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()

  React.useEffect(() => {
    if (!state.panelOpen || !panelRef.current) return
    return trapFocus(panelRef.current, { onEscape: () => api.closePanel() })
  }, [state.panelOpen, api])

  const renderControl = (c: ControlVM) => {
    switch (c.kind) {
      case 'stepper':
        return (
          <div className="moonable-control" role="group" aria-label={c.label} key={c.id}>
            <span className="moonable-control-label" aria-hidden="true">{c.label}</span>
            <div className="moonable-stepper">
              <button type="button" className="moonable-btn" disabled={!c.canDec} aria-label={`${t('panel.decrease')}: ${c.label}`}
                onClick={() => api.step(c.key, -1)}>−</button>
              <output className="moonable-stepper-value" aria-live="polite">{c.display}</output>
              <button type="button" className="moonable-btn" disabled={!c.canInc} aria-label={`${t('panel.increase')}: ${c.label}`}
                onClick={() => api.step(c.key, 1)}>+</button>
            </div>
          </div>
        )
      case 'select': {
        const id = `${titleId}-${c.id}`
        return (
          <div className="moonable-control" key={c.id}>
            <label className="moonable-control-label" htmlFor={id}>{c.label}</label>
            <select id={id} className="moonable-select" value={c.value}
              onChange={(e) => api.set({ [c.key]: e.target.value } as never)}>
              {c.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {c.hint && <p className="moonable-hint">{c.hint}</p>}
          </div>
        )
      }
      case 'toggle':
        return (
          <div className="moonable-control" key={c.id}>
            <button type="button" role="switch" aria-checked={c.checked} className="moonable-btn moonable-switch"
              onClick={() => api.set({ [c.key]: !c.checked } as never)}>
              <span>{c.label}</span>
              <span className="moonable-switch-state">{c.stateLabel}</span>
            </button>
            {c.hint && <p className="moonable-hint">{c.hint}</p>}
          </div>
        )
      case 'action':
        return (
          <div className="moonable-control" key={c.id}>
            <button type="button" className="moonable-btn" aria-pressed={c.pressed} onClick={() => api.runAction(c.action)}>{c.label}</button>
            {c.hint && <p className="moonable-hint">{c.hint}</p>}
          </div>
        )
      case 'note':
        return <p className="moonable-note" key={c.id}>{c.text}</p>
    }
  }

  return (
    <div className="moonable-root" data-moonable-ui="" data-position={position}>
      {!hideButton && (
        <button type="button" className="moonable-fab" aria-haspopup="dialog" aria-expanded={state.panelOpen}
          aria-label={t('fab.aria')} onClick={() => api.togglePanel()}>
          <span aria-hidden="true" style={{ display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: ICON_ACCESS }} />
          <span>{t('fab.label')}</span>
        </button>
      )}
      {state.panelOpen && (
        <>
          <div className="moonable-backdrop" aria-hidden="true" onClick={() => api.closePanel()} />
          <div ref={panelRef} className="moonable-panel" role="dialog" aria-modal="true" aria-labelledby={`${titleId}-t`} tabIndex={-1}>
            <div className="moonable-panel-head">
              <h2 id={`${titleId}-t`}>{model.title}</h2>
              <button type="button" className="moonable-btn" onClick={() => api.closePanel()}>{model.closeLabel}</button>
            </div>
            <div className="moonable-panel-body">
              <h3 id={`${titleId}-p`}>{model.presetsLabel}</h3>
              <ul className="moonable-presets" aria-labelledby={`${titleId}-p`}>
                {model.presets.map((p, i) => (
                  <li key={p.id}>
                    <button type="button" aria-pressed={p.active}
                      className={`moonable-btn moonable-preset${i === 0 ? ' moonable-preset--lead' : ''}`}
                      onClick={() => api.togglePreset(p.id)}>
                      <span>{p.label}</span>
                      <small>{p.desc}</small>
                    </button>
                  </li>
                ))}
              </ul>
              {model.sections.map((s, i) => (
                <details className="moonable-section" key={s.id} open={i === 0}>
                  <summary>
                    <span className="moonable-section-icon" aria-hidden="true">{s.icon}</span>
                    {s.title}
                  </summary>
                  <div className="moonable-controls">{s.controls.map(renderControl)}</div>
                </details>
              ))}
            </div>
            <div className="moonable-panel-foot">
              <button type="button" className="moonable-btn" onClick={() => api.reset()}>{model.resetLabel}</button>
              <p>{model.shortcutHint}</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Hook penjaga sesi                                                   */
/* ------------------------------------------------------------------ */
/** Peringatan sesi habis yang ramah lansia. Aktif selama komponen terpasang. */
export function useInactivityGuard(options: InactivityGuardOptions) {
  const ref = React.useRef(options)
  ref.current = options
  React.useEffect(() => {
    const guard = createInactivityGuard({
      ...ref.current,
      onTimeout: () => ref.current.onTimeout(),
      onWarn: () => ref.current.onWarn?.(),
      onExtend: () => ref.current.onExtend?.(),
    })
    guard.start()
    return () => guard.stop()
  }, [options.timeoutMs, options.warnBeforeMs])
}

export { stepValue }
