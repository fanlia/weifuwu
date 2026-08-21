import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage()
const ids = ['app-shell', 'workspace', 'focus-task', 'docs', 'dashboard', 'data-screen', 'list-page', 'detail-page', 'settings-page', 'landing', 'mobile']
for (const id of ids) {
  await p.goto('http://localhost:3200/patterns/' + id, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(400)
  const r = await p.evaluate(() => {
    const t = document.querySelector('main')?.textContent ?? ''
    const i = t.indexOf('活体预览')
    const preview = t.slice(i + 20, i + 80).replace(/\s+/g, ' ')
    return { h1: document.querySelector('main h1')?.textContent?.trim(), len: t.length, preview }
  })
  console.log(`${id} | h1=${r.h1} | len=${r.len} | 预览: ${r.preview}`)
}
b.close(); process.exit(0)
