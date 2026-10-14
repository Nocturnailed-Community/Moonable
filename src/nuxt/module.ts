import { addComponent, addImports, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'
import { getInitScript } from '../core'

export interface ModuleOptions {
  locale?: 'id' | 'en'
  storageKey?: string
  textScaling?: 'rem' | 'zoom'
  shortcuts?: boolean
  respectSystemPreferences?: boolean
  /** Otomatis impor styles.css. Bawaan true. */
  injectStyles?: boolean
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: 'moonable', configKey: 'moonable', compatibility: { nuxt: '>=3.0.0' } },
  defaults: {
    locale: 'id',
    storageKey: 'moonable:settings',
    textScaling: 'rem',
    shortcuts: true,
    respectSystemPreferences: true,
    injectStyles: true,
  },
  setup(options: ModuleOptions, nuxt: any) {
    const resolver = createResolver(import.meta.url)
    const { injectStyles, ...runtimeOptions } = options

    // opsi → runtime config publik (dibaca plugin)
    const pub = nuxt.options.runtimeConfig.public as Record<string, unknown>
    pub.moonable = { ...(pub.moonable as object | undefined), ...runtimeOptions }

    // gaya
    if (injectStyles) nuxt.options.css.push('moonable/styles.css')

    // skrip anti-kedip di <head>
    const head = (nuxt.options.app.head ||= {}) as { script?: unknown[] }
    head.script = [
      ...(head.script ?? []),
      { innerHTML: getInitScript({ storageKey: options.storageKey, textScaling: options.textScaling }), tagPosition: 'head', tagPriority: 'critical' },
    ]

    // plugin (server + client) agar useMoonable() tersedia saat SSR
    nuxt.options.build.transpile.push('moonable')
    addPlugin({ src: resolver.resolve('./nuxt-runtime.mjs') })

    // auto-import komponen & composable
    addComponent({ name: 'MoonablePanel', export: 'MoonablePanel', filePath: 'moonable/vue' })
    addComponent({ name: 'MoonableSkipLink', export: 'SkipLink', filePath: 'moonable/vue' })
    addImports([
      { name: 'useMoonable', from: 'moonable/vue' },
      { name: 'useInactivityGuard', from: 'moonable/vue' },
    ])
  },
})
