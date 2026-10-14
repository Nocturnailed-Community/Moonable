declare module '#app' {
  export function defineNuxtPlugin(fn: (nuxtApp: any) => any): any
  export function useRuntimeConfig(): any
}
