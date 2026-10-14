import { defineNuxtPlugin, useRuntimeConfig } from '#app'
import { MoonablePlugin } from '../vue'

// Plugin Nuxt: dipasang otomatis oleh modul `moonable/nuxt`
export default defineNuxtPlugin((nuxtApp: any) => {
  const cfg = (useRuntimeConfig().public as any).moonable ?? {}
  nuxtApp.vueApp.use(MoonablePlugin, { ...cfg, autoInit: false })
  const api = nuxtApp.vueApp.config.globalProperties.$moonable

  // init SETELAH hydrate agar state client = state server (tanpa hydration mismatch)
  nuxtApp.hook('app:mounted', () => api.init())

  return { provide: { moonable: api } }
})
