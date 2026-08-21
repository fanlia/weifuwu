import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage()
async function demoOf(id) {
  await p.goto('http://localhost:3200/patterns/' + id, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(500)
  return await p.evaluate(() => {
    // PatternLive 的 demo 容器（活体预览的 surface）
    const live = Array.from(document.querySelectorAll('main .wf-surface')).find(x => x.querySelector('input, button, table, nav, img'))
    const comp = live?.querySelector('[data-wf-id]') // 第一个组件根
    return (live?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 150)
  })
}
const a = await demoOf('focus-task')
const c = await demoOf('settings-page')
const d = await demoOf('list-page')
console.log('focus-task :', a)
console.log('settings  :', c)
console.log('list-page  :', d)
console.log('focus==settings:', a === c, '| settings==list:', c === d)
b.close(); process.exit(0)
