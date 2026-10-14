# Moonable 🌙

**Terang untuk semua.** Toolkit aksesibilitas universal untuk **Next.js** dan **Nuxt** (TypeScript maupun JavaScript), dengan **Mode Lansia** untuk dosen/pengguna lanjut usia, serta dukungan disabilitas penglihatan, pendengaran, motorik, dan kognitif.

Satu inti netral-framework + adapter React/Next dan Vue/Nuxt. Tanpa dependensi runtime. Dua bahasa (Indonesia & Inggris).

## Fitur

| Kebutuhan | Fitur |
|---|---|
| **Lansia** | Preset **Mode Lansia** (teks 150%, huruf mudah dibaca, tombol & kursor besar, fokus tebal, tanpa animasi/autoplay, suara TTS lebih pelan), tombol −/+ (bukan slider), peringatan sesi habis yang jelas (`createInactivityGuard`) |
| **Penglihatan** | Ukuran teks 80–250%, tinggi baris, jarak huruf/kata, kontras (putih/hitam, hitam/putih, kuning/hitam), hitam-putih, saturasi, bantuan buta warna (protan/deutan/tritan), kursor besar, tandai tautan/judul, bacakan halaman (TTS), sembunyikan gambar |
| **Pendengaran** | Subtitle video otomatis, notifikasi visual (toast) + getar, audit video tanpa caption |
| **Motorik** | Target klik ≥44px, fokus keyboard tebal, pintasan keyboard, perintah suara, hentikan animasi |
| **Kognitif / disleksia / ADHD** | Huruf ramah disleksia, panduan baca (garis / sorot satu baris), batasi lebar baris, sembunyikan elemen pengganggu, cegah autoplay |
| **Developer** | `auditPage()` (alt, label, nama tombol/tautan, heading, kontras, ukuran target, zoom terkunci, caption, id ganda, dll.), focus trap, `announce()` untuk screen reader, `SkipLink` |

Pintasan: `Alt+Shift+A` panel · `Alt+Shift+L` Mode Lansia · `Alt+Shift+R` baca · `Alt+Shift++/-` ukuran teks.

## Instalasi

```bash
npm install moonable
# atau
yarn add moonable
# atau
pnpm add moonable
```

## Next.js (App Router)

```tsx
// app/layout.tsx  (Server Component)
import { getInitScript } from 'moonable'                 // ⚠ dari entry utama, bukan /react
import { MoonableProvider, MoonablePanel, SkipLink } from 'moonable/react'
import 'moonable/styles.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: getInitScript() }} /></head>
      <body>
        <MoonableProvider options={{ locale: 'id' }}>
          <SkipLink />
          <main id="main-content">{children}</main>
          <MoonablePanel />
        </MoonableProvider>
      </body>
    </html>
  )
}
```

Memakai di komponen client: `const { settings, set, applyPreset, speakPage } = useMoonable()`.
Pages Router: letakkan Provider/Panel di `_app.tsx` dan skrip di `_document.tsx`.

## Nuxt 3

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['moonable/nuxt'],
  moonable: { locale: 'id' },          // opsi opsional
})
```
```vue
<!-- app.vue -->
<template>
  <MoonableSkipLink />
  <main id="main-content"><NuxtPage /></main>
  <MoonablePanel />
</template>
```
`useMoonable()` otomatis tersedia. CSS, skrip anti-kedip, dan plugin dipasang oleh modul.

**Vue biasa (tanpa Nuxt):** `app.use(MoonablePlugin)` dari `moonable/vue` + `import 'moonable/styles.css'`.

## JavaScript biasa (tanpa TypeScript)

Semua API sama; tipe bersifat opsional. Tanpa framework:

```js
import { createMoonable } from 'moonable'
import 'moonable/styles.css'
const a11y = createMoonable(); a11y.init()
a11y.applyPreset('elderly')
```

## Contoh API

```ts
a11y.set({ fontScale: 1.5, contrast: 'yellow' })
a11y.applyPreset('elderly')      // 'lowVision' | 'dyslexia' | 'focus' | 'colorBlind' | 'motor' | 'hearing'
a11y.speakPage(); a11y.stopSpeaking()
a11y.startVoice()                // perintah suara (Chrome/Edge/Safari)
a11y.notify('Tersimpan', { type: 'success' })   // screen reader + toast visual bila diaktifkan
a11y.audit()                     // { issues, summary }
createMoonable({ auditOnInit: true })  // cetak audit ke console saat development
```

Perintah suara bawaan: "perbesar teks", "perkecil teks", "kontras tinggi", "mode lansia", "baca halaman", "berhenti", "turun", "naik", "kembali", "buka aksesibilitas", "atur ulang". Tambah sendiri lewat opsi `voiceCommands`.

### Peringatan sesi habis (untuk portal dosen/SIAKAD)

```ts
import { createInactivityGuard } from 'moonable'
createInactivityGuard({ timeoutMs: 20 * 60_000, warnBeforeMs: 3 * 60_000, onTimeout: () => logout() }).start()
// React: useInactivityGuard({...})   Vue/Nuxt: useInactivityGuard({...})
```

## Penanda di HTML Anda

- `data-moonable-distraction` — iklan/popup/carousel yang disembunyikan saat "Sembunyikan elemen pengganggu".
- `data-moonable-keep-font` — ikon/font khusus yang tidak boleh diganti jenis hurufnya.
- `id="main-content"` — target `SkipLink`.

## Catatan penting

- **Ukuran teks** memakai skala `rem`. Situs yang memakai `px` untuk font sebaiknya diubah ke `rem`, atau gunakan `textScaling: 'zoom'`.
- Jenis huruf "ramah disleksia" memakai OpenDyslexic/Lexend jika terpasang di perangkat; muat font-nya sendiri bila ingin pasti tampil.
- Bantuan buta warna adalah filter koreksi (daltonisasi), bukan pengganti desain yang tidak bergantung warna saja.
- Toolkit ini **membantu pengguna menyesuaikan tampilan**, tetapi tidak otomatis membuat situs memenuhi WCAG. Perbaiki sumbernya (HTML semantik, alt, label, kontras) dan gunakan `audit()` untuk menemukannya. Uji juga dengan pembaca layar (NVDA/VoiceOver) dan pengguna nyata.
- TTS dan perintah suara bergantung pada dukungan peramban/OS (suara bahasa Indonesia harus terpasang; perintah suara umumnya mengirim audio ke layanan peramban dan butuh izin mikrofon).

## Pengembangan

```bash
npm install && npm test && npm run build
```
