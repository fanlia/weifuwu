/**
 * component-standards.test.ts — 组件编写标准的强制检测审计（L2 运行时检测的防护网）
 *
 * 验证标准（content/guides/component-standards.md）的 L2 检测确实触发：
 *  - S2.1 非法 children 值域（对象/Symbol → warn + 占位）
 *  - S2.5/S3.1 A 级检测（长度变化 + 无 key 组件项 → dev error——filter 红线）
 *  - S4.1 受控缺回调 warn（useControlled/useOpen——按 name 幂等）
 *  - S6.3 浏览器审计基线（组件库 grep window./document. 必须为 0）
 * 检测机制缺失 = 本文件红（强制标准空转）。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './setup.ts'
import { createRoot } from './engines/vdom4/root.ts'
import { h } from './engines/vdom4/jsx.ts'
import { resetSemanticService } from './services/hook-env.ts'

before(setupJsdom)

function mkRoot(): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return root
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('S2.1 非法 children 值域（对象/Symbol → warn + 占位——兄弟保留）', async () => {
  const root = mkRoot()
  const warns: string[] = []
  const ow = console.warn
  console.warn = (m: string) => { warns.push(String(m)) }
  try {
    const App = () => () => h('div', {}, [
      h('span', { class: 'a' }, 'A'),
      { x: 1 } as any,
      h('span', { class: 'b' }, 'B'),
    ])
    const handle = createRoot(h(App, {}), root)
    await handle.ready
    assert.ok(warns.some((w) => w.includes('非法 children 值')), '对象 children → warn')
    assert.strictEqual(root.querySelectorAll('span').length, 2, '非法输入占位——正常兄弟保留')
    handle.unmount()
  } finally { console.warn = ow }
  document.body.removeChild(root)
})

test('S2.5/S3.1 A 级检测（filter(Boolean) 长度变化 + 无 key 组件项 → dev error）', async () => {
  const root = mkRoot()
  const errs: string[] = []
  const oe = console.error
  console.error = (m: string) => { errs.push(String(m)) }
  try {
    const Item = () => () => h('span', {}, 'x')
    const App = (_i: Record<string, unknown>, ctx: any) => {
      let cond = true
      return () => h('div', {}, [
        h('button', { id: 't', onClick: () => { cond = !cond; ctx.render() } }, 't'),
        h('div', {}, [cond && h(Item, {}), h(Item, {})].filter(Boolean)),
      ])
    }
    const handle = createRoot(h(App, {}), root)
    await handle.ready
    ;(root.querySelector('[id="t"]') as HTMLElement).click()
    await sleep(10)
    assert.ok(errs.some((e) => e.includes('[vdom4/audit]') && e.includes('缺少 key')), 'filter 场景 → A 级检测 dev error')
    handle.unmount()
  } finally { console.error = oe }
  document.body.removeChild(root)
})

test('S4.1 受控缺回调 warn（useControlled——按 name 幂等）', async () => {
  const root = mkRoot()
  const warns: string[] = []
  const ow = console.warn
  console.warn = (m: string) => { warns.push(String(m)) }
  try {
    const C = (_i: { value: string[] }, ctx: any) => {
      return () => {
        ctx.ui.useControlled<string[]>({ value: _i.value, name: 'AuditCtrl' })
        return h('span', {}, 'x')
      }
    }
    const App = () => () => h('div', {}, h(C, { value: ['a'] }))
    const handle = createRoot(h(App, {}), root)
    await handle.ready
    assert.ok(warns.some((w) => w.includes('AuditCtrl') && w.includes('受控模式')), '受控缺回调 → warn')
    handle.unmount()
  } finally { console.warn = ow }
  document.body.removeChild(root)
})

test('S6.3 浏览器审计基线（组件库无裸 window./document. 等 DOM 全局）', async () => {
  const { readdir, readFile } = await import('node:fs/promises')
  const dirs = await readdir('src/client/components', { withFileTypes: true })
  const pattern = /\bwindow\.|\bdocument\.|\bnavigator\.|\blocation\.|\bhistory\.|\blocalStorage|\bgetSelection\(|\brequestAnimationFrame|\bMutationObserver|\bIntersectionObserver|matchMedia\(/
  const hits: string[] = []
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    const files = await readdir(`src/client/components/${d.name}`)
    for (const f of files) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue
      const src = await readFile(`src/client/components/${d.name}/${f}`, 'utf-8')
      src.split('\n').forEach((l, i) => {
        const t = l.trim()
        // 注释行（// 或 /*/*** 块）+ import 行（路径含 history.ts 等误报）——跳过
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/**') || t.startsWith('import ')) return
        if (pattern.test(l)) {
          const code = l.split('//')[0].trim()
          if (code) hits.push(`${d.name}/${f}:${i + 1}: ${code.slice(0, 80)}`)
        }
      })
    }
  }
  assert.ok(hits.length === 0, `浏览器全局审计基线——发现 ${hits.length} 处：\n${hits.slice(0, 5).join('\n')}`)
  resetSemanticService()
})
