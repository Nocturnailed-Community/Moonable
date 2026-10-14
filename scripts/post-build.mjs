// 1) salin CSS  2) tambahkan "use client" HANYA ke entry React (App Router Next.js)
import { copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs'

copyFileSync('src/styles.css', 'dist/styles.css')

for (const f of ['dist/react.mjs', 'dist/react.js']) {
  if (!existsSync(f)) continue
  const src = readFileSync(f, 'utf8')
  if (!src.startsWith('"use client"')) writeFileSync(f, '"use client";\n' + src)
}
console.log('post-build selesai')
