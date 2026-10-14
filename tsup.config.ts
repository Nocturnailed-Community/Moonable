import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/core/index.ts',
    react: 'src/react/index.tsx',
    vue: 'src/vue/index.ts',
    nuxt: 'src/nuxt/module.ts',
    'nuxt-runtime': 'src/nuxt/runtime.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  shims: true,
  target: 'es2020',
  external: ['react', 'react/jsx-runtime', 'vue', '@nuxt/kit', '#app', '#imports'],
})
