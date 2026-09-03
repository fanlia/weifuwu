import { chromium } from 'playwright'
const B = 'http://localhost:3000'
const EMAIL = `wf-dbg3-${Date.now()}@test.com`
const browser = await chromium.launch()
const page = await browser.newPage()
const reg = await (await page.request.post(`${B}/api/auth/register`, { data: { email: EMAIL, password: 'pass1234', name: 'W' } })).json()
const slug = reg?.app?.slug
const token = (await (await page.request.post(`${B}/api/auth/apps/${slug}/login`, { data: { email: EMAIL, password: 'pass1234' } })).json()).token
const h = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
const ag = await (await page.request.post(`${B}/api/agents`, { headers: h, data: { name: 'wf', type: 'ai', model: 'deepseek-v4-flash' } })).json()
const aid = ag.agent?.id
const resp = await page.request.post(`${B}/api/agents/${aid}/preview`, { headers: h, data: { content: '用 create_workflow 建一个：请求 http://localhost:3000/api/demo/stock?stock=1 然后 log 数量' } })
const text = await resp.text()
console.log('流完成:', text.includes('wf:done'))
await page.waitForTimeout(500)
await browser.close()
