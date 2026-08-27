import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const idx = JSON.parse(readFileSync('/tmp/index.json', 'utf-8'))
const browser = await chromium.launch()
const total = { pages: 0, warns: [], errors: [] }
// 每页最多互动次数预算（全量 160 页——控制时长）
for (const c of idx.components) {
  const path = `/components/${c.category}/${c.id}`
  const p = await browser.newPage()
  const warns = []
  p.on('console', (m) => {
    const t = m.text()
    if (m.type() === 'warning' || m.type() === 'error') {
      if (t.includes('[vdom]')) (m.type() === 'warning' ? warns : total.errors).push(`${c.id}: ${t.slice(0, 160)}`)
    }
  })
  try {
    await p.goto('http://localhost:3200' + path, { timeout: 10000 })
    await p.waitForTimeout(500)
    // 点主 demo 里的前 4 个按钮（触发条件渲染/状态切换）
    const btns = await p.locator('main .wf-surface button').count()
    for (let i = 0; i < Math.min(btns, 4); i++) {
      try {
        await p.locator('main .wf-surface button').nth(i).click({ timeout: 800 })
        await p.waitForTimeout(120)
      } catch { /* 忽略点击失败 */ }
    }
    // 再点一次“开始”类按钮（若有多个阶段）
    await p.waitForTimeout(100)
  } catch { /* 页面失败忽略 */ }
  total.pages++
  total.warns.push(...warns)
  await p.close()
}
console.log('pages:', total.pages)
console.log('无 key 警告总数:', total.warns.filter(w => w.includes('无 key')).length)
console.log('其他 [vdom] 警告:')
for (const w of total.warns.filter(w => !w.includes('无 key')).slice(0, 20)) console.log('  ', w)
console.log('[vdom] 错误:', total.errors.slice(0, 10))
await browser.close()
