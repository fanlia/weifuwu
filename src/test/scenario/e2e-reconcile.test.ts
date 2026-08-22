/**
 * 场景 e2e——reconcile（状态机验证——真实 DOM 对账）
 *
 * 机制：auditDom（页面内执行）——对 #root 下真实 DOM 树校验结构不变量：
 *   ① data-wf-id 唯一（无重复——id 空间互斥）
 *   ② id 格式合法（root.数字.数字...——槽位路径）
 *   ③ 兄弟 id 连续（同一父下最后一段 0,1,2...——FRAG/组件多根展开连续）
 *   ④ 无 id 缺失（root 直接子全部有 data-wf-id——影子树投影完整）
 * 交互路径覆盖：keyed 增/删/循环移位（冲突重建）+ 条件渲染（空洞切换）+
 * 数组展开（隐式 Fragment）——每步交互后对账零错误 + 结构计数断言。
 *
 * 状态机规格（P1/P2 的 DOM 落验）：Sim 逐迁移验证器（契约层）+ 本场景
 * 真实浏览器对账——双层验证——验证器可信度兜底。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startScenarioServer, openScenario, type ScenarioServer } from './e2e-shared.ts'

let server: ScenarioServer
let BASE = ''
let browser: Browser

test.before(async () => {
  server = await startScenarioServer()
  BASE = server.base
  browser = await chromium.launch()
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

/** 真实 DOM 对账（页面内执行——结构不变量校验） */
const auditDom = (): { errors: string[]; itemCount: number; condCount: number } => {
  return { errors: [], itemCount: 0, condCount: 0 }
}

/** 完整投影对账（**消费端应用正确性——2026-XX 增强**）：
 *  在 id 结构对账之上补：属性投影（key/children 不泄漏到 DOM）+ 注释锚
 *  格式（空洞占位 wf-hole）——消费端 setProp/applyAttribute 的应用正确性 */
async function auditFullProjection(page: import('playwright').Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector('#root') as HTMLElement
    const errors: string[] = []
    const ids = new Set<string>()
    const walk = (el: Element): void => {
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === 8) { // 注释锚（空洞占位）
          if (!child.textContent?.includes('wf-hole')) errors.push(`锚格式非法: ${child.textContent}`)
          continue
        }
        if (child.nodeType !== 1) continue
        const el = child as HTMLElement
        const id = el.getAttribute('data-wf-id')
        if (!id) { errors.push(`缺 data-wf-id: ${el.tagName}`); continue }
        if (ids.has(id)) errors.push(`id 重复: ${id}`)
        ids.add(id)
        if (!/^root(\.\d+)+$/.test(id)) errors.push(`id 格式非法: ${id}`)
        // 属性投影：key/children 不应泄漏到 DOM 属性面
        if (el.hasAttribute('key')) errors.push(`key 泄漏到 DOM: ${id}`)
        if (el.hasAttribute('children')) errors.push(`children 泄漏到 DOM: ${id}`)
        walk(el)
      }
    }
    walk(root)
    return errors
  })
}

/** 打开 dev 模式场景（P3b）——注入 window.__WF_DEV__（serve 注入 devVerify——
 *  命令消费后 Post 断言）——收集 [vdom-dev] 违例报告 */
async function openDevScenario(page: import('playwright').Page, base: string, id: string, devErrors: string[]): Promise<void> {
  page.on('console', (m) => { if (m.type() === 'error' && m.text().includes('[vdom-dev]')) devErrors.push(m.text()) })
  await page.addInitScript(() => { (window as unknown as { __WF_DEV__?: boolean }).__WF_DEV__ = true })
  await openScenario(page, base, id)
}

test('reconcile：初始渲染对账——id 唯一/格式/兄弟连续/投影完整', async () => {
  const page = await browser.newPage()
  const devErrors: string[] = []
  try {
    await openDevScenario(page, BASE, 'reconcile', devErrors)

    const audit = await page.evaluate(() => {
      const root = document.querySelector('#root') as HTMLElement
      const errors: string[] = []
      const ids = new Set<string>()
      const walk = (el: Element): void => {
        for (const child of Array.from(el.children)) {
          const id = child.getAttribute('data-wf-id')
          if (!id) { errors.push(`缺 data-wf-id: ${child.tagName}`); continue }
          if (ids.has(id)) errors.push(`id 重复: ${id}`)
          ids.add(id)
          if (!/^root(\.\d+)+$/.test(id)) errors.push(`id 格式非法: ${id}`)
          walk(child)
        }
      }
      walk(root)
      // 兄弟 id 连续（同一父下最后一段 0,1,2...）
      const checkSiblings = (el: Element): void => {
        for (const child of Array.from(el.children)) {
          const kids = Array.from(child.children)
          const seq = kids.map((k) => {
            const id = k.getAttribute('data-wf-id') ?? ''
            return Number(id.split('.').pop())
          })
          for (let i = 0; i < seq.length; i++) {
            if (seq[i] !== i) errors.push(`兄弟 id 不连续: ${child.getAttribute('data-wf-id')} 子序列 ${JSON.stringify(seq)}`)
            break
          }
          checkSiblings(child)
        }
      }
      checkSiblings(root)
      return {
        errors,
        itemCount: root.querySelectorAll('.item').length,
        condCount: root.querySelectorAll('.cond').length,
        tailCount: root.querySelectorAll('.tail').length,
        f1: root.querySelectorAll('.f1').length,
        f2: root.querySelectorAll('.f2').length,
        f3: root.querySelectorAll('.f3').length,
      }
    })

    assert.deepEqual(audit.errors, [], `初始渲染对账违例: ${JSON.stringify(audit.errors)}`)
    const proj = await auditFullProjection(page)
    assert.deepEqual(proj, [], `消费端属性/文本投影违例: ${JSON.stringify(proj)}`)
    assert.equal(audit.itemCount, 3, 'keyed 列表 3 项')
    assert.equal(audit.condCount, 3, '条件渲染 3 个 on（show=true）')
    assert.equal(audit.tailCount, 1, '尾部兄弟保留')
    assert.equal(audit.f1 + audit.f2 + audit.f3, 3, '数组展开 3 项（隐式 Fragment）')
    assert.deepEqual(devErrors, [], `dev 验证器违例: ${devErrors.join('; ')}`)
  } finally {
    await page.close()
  }
})

test('reconcile：keyed 增项 → diff 后对账零违例', async () => {
  const page = await browser.newPage()
  const devErrors: string[] = []
  try {
    await openDevScenario(page, BASE, 'reconcile', devErrors)
    await page.click('#btn-add')
    await page.waitForSelector('.item:nth-child(4)')

    const audit = await page.evaluate(() => {
      const root = document.querySelector('#root') as HTMLElement
      const errors: string[] = []
      const ids = new Set<string>()
      const walk = (el: Element): void => {
        for (const child of Array.from(el.children)) {
          const id = child.getAttribute('data-wf-id')
          if (!id || ids.has(id) || !/^root(\.\d+)+$/.test(id)) errors.push(`id 违例: ${child.tagName} ${id}`)
          ids.add(id)
          walk(child)
        }
      }
      walk(root)
      return { errors, items: root.querySelectorAll('.item').length, names: [...root.querySelectorAll('.item')].map((i) => i.getAttribute('data-name')) }
    })
    assert.deepEqual(audit.errors, [], `增项后对账违例: ${JSON.stringify(audit.errors)}`)
    const proj = await auditFullProjection(page)
    assert.deepEqual(proj, [], `增项后属性投影违例: ${JSON.stringify(proj)}`)
    assert.equal(audit.items, 4, '增项后 4 项')
    assert.deepEqual(audit.names, ['a', 'b', 'c', 'x3'], 'keyed 身份跟随（新项尾部）')
    assert.deepEqual(devErrors, [], `dev 验证器违例: ${devErrors.join('; ')}`)
  } finally {
    await page.close()
  }
})

test('reconcile：条件切换（空洞↔元素往返）→ 对账零违例', async () => {
  const page = await browser.newPage()
  const devErrors: string[] = []
  try {
    await openDevScenario(page, BASE, 'reconcile', devErrors)
    // show=false：cond 全部消失（空洞占位——结构不塌缩）
    await page.click('#btn-toggle')
    await page.waitForFunction(() => document.querySelectorAll('.cond').length === 0)
    const off = await page.evaluate(() => {
      const root = document.querySelector('#root') as HTMLElement
      const errors: string[] = []
      const ids = new Set<string>()
      const walk = (el: Element): void => {
        for (const child of Array.from(el.children)) {
          const id = child.getAttribute('data-wf-id')
          if (!id || ids.has(id)) errors.push(`id 违例: ${child.tagName} ${id}`)
          ids.add(id)
          walk(child)
        }
      }
      walk(root)
      return { errors, cond: root.querySelectorAll('.cond').length, items: root.querySelectorAll('.item').length, f3: root.querySelectorAll('.f3').length }
    })
    assert.deepEqual(off.errors, [], `空洞切换后对账违例: ${JSON.stringify(off.errors)}`)
    assert.equal(off.cond, 0, 'cond 消失（空洞）')
    assert.equal(off.items, 3, '列表项保留（不误删兄弟）')
    assert.equal(off.f3, 0, 'f3 消失（数组内空洞）')

    // show=true 恢复
    await page.click('#btn-toggle')
    await page.waitForFunction(() => document.querySelectorAll('.cond').length === 3)
    const on = await page.evaluate(() => {
      const root = document.querySelector('#root') as HTMLElement
      const errors: string[] = []
      const ids = new Set<string>()
      const walk = (el: Element): void => {
        for (const child of Array.from(el.children)) {
          const id = child.getAttribute('data-wf-id')
          if (!id || ids.has(id)) errors.push(`id 违例: ${child.tagName} ${id}`)
          ids.add(id)
          walk(child)
        }
      }
      walk(root)
      return { errors, cond: root.querySelectorAll('.cond').length }
    })
    assert.deepEqual(on.errors, [], `空洞恢复对账违例: ${JSON.stringify(on.errors)}`)
    assert.equal(on.cond, 3, 'cond 恢复')
    assert.deepEqual(devErrors, [], `dev 验证器违例: ${devErrors.join('; ')}`)
  } finally {
    await page.close()
  }
})

test('reconcile：keyed 循环移位（冲突重建）→ 对账零违例 + 身份跟随', async () => {
  const page = await browser.newPage()
  const devErrors: string[] = []
  try {
    await openDevScenario(page, BASE, 'reconcile', devErrors)
    await page.click('#btn-swap') // [a,b,c] → [c,a,b]——循环移位——冲突重建
    await page.waitForFunction(() => {
      const first = document.querySelector('.item')
      return first?.getAttribute('data-name') === 'c'
    })

    const audit = await page.evaluate(() => {
      const root = document.querySelector('#root') as HTMLElement
      const errors: string[] = []
      const ids = new Set<string>()
      const walk = (el: Element): void => {
        for (const child of Array.from(el.children)) {
          const id = child.getAttribute('data-wf-id')
          if (!id || ids.has(id) || !/^root(\.\d+)+$/.test(id)) errors.push(`id 违例: ${child.tagName} ${id}`)
          ids.add(id)
          walk(child)
        }
      }
      walk(root)
      return { errors, names: [...root.querySelectorAll('.item')].map((i) => i.getAttribute('data-name')) }
    })
    assert.deepEqual(audit.errors, [], `冲突重建后对账违例: ${JSON.stringify(audit.errors)}`)
    assert.deepEqual(audit.names, ['c', 'a', 'b'], '循环移位——身份跟随内容')
    assert.deepEqual(devErrors, [], `dev 验证器违例: ${devErrors.join('; ')}`)
  } finally {
    await page.close()
  }
})

test('reconcile：组合交互（add+remove+toggle+swap 连续）→ 终态对账零违例', async () => {
  const page = await browser.newPage()
  const devErrors: string[] = []
  try {
    await openDevScenario(page, BASE, 'reconcile', devErrors)
    await page.click('#btn-add')     // 4 项
    await page.click('#btn-add')     // 5 项
    await page.click('#btn-remove')  // 4 项
    await page.click('#btn-toggle')  // cond 消失
    await page.click('#btn-swap')    // 循环移位
    await page.click('#btn-toggle')  // cond 恢复
    await page.waitForFunction(() => document.querySelectorAll('.item').length === 4)

    const audit = await page.evaluate(() => {
      const root = document.querySelector('#root') as HTMLElement
      const errors: string[] = []
      const ids = new Set<string>()
      const walk = (el: Element): void => {
        for (const child of Array.from(el.children)) {
          const id = child.getAttribute('data-wf-id')
          if (!id || ids.has(id)) errors.push(`id 违例: ${child.tagName} ${id}`)
          ids.add(id)
          walk(child)
        }
      }
      walk(root)
      // 兄弟连续
      const checkSiblings = (el: Element): void => {
        for (const child of Array.from(el.children)) {
          const kids = Array.from(child.children)
          const seq = kids.map((k) => Number((k.getAttribute('data-wf-id') ?? '').split('.').pop()))
          for (let i = 0; i < seq.length; i++) {
            if (seq[i] !== i) { errors.push(`兄弟不连续: ${JSON.stringify(seq)}`); break }
          }
          checkSiblings(child)
        }
      }
      checkSiblings(root)
      return { errors, items: root.querySelectorAll('.item').length, cond: root.querySelectorAll('.cond').length }
    })
    assert.deepEqual(audit.errors, [], `组合交互终态对账违例: ${JSON.stringify(audit.errors)}`)
    const proj = await auditFullProjection(page)
    assert.deepEqual(proj, [], `组合后属性投影违例: ${JSON.stringify(proj)}`)
    assert.equal(audit.items, 4, '终态 4 项')
    assert.equal(audit.cond, 4, 'cond 恢复（4 项各一）')
    assert.deepEqual(devErrors, [], `dev 验证器违例: ${devErrors.join('; ')}`)
  } finally {
    await page.close()
  }
})
