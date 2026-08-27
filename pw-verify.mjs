import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto('http://localhost:3000/login')
await page.waitForTimeout(1500)
await page.fill('input[type=email], input[name=email]', 'admin@demo.com')
await page.fill('input[type=password]', 'admin123')
await page.click('button[type=submit], button.wf-btn--primary')
await page.waitForTimeout(3500)
// 慢速单页面访问 admin + deliverables（限流冷却后）
await page.waitForTimeout(5000)
for (const p of ['/admin', '/deliverables']) {
  await page.goto('http://localhost:3000' + p)
  await page.waitForTimeout(2000)
  const body = await page.evaluate(() => document.body.textContent?.trim().length ?? 0)
  console.log(p, 'body=', body, 'ch')
}
await browser.close()
