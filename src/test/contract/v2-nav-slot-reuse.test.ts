/**
 * vdom v2 — 导航链残留回归（同槽位组件替换——cleanup 误杀新段）
 *
 * **病灶（2027-10——showcase 用户实测）**：
 * /components/accordion → 面包屑 → /components（index）→ 点卡片 →
 * /components/actionsheet —— 页面仍残留组件列表 160 卡。
 *
 * **根因链**：nav1（accordion→index）周期内——① 生成期处置旧段（acc，
 * compId root.0.1.0）② 新段（index）同槽位 id（root.0.1.0）挂载 ③
 * cleanup 阶段处理生成流里的 `unmount root.0.1.0`（目标=旧段）→ 命中
 * 同 id 的**新段** → 误杀（index 段消失——DOM 残留）→ nav2 的
 * disposeComponentWithOutput 查段落空 → 旧输出零清理命令 → 列表残留。
 *
 * **修复**：段生命周期纪元（Segment.epoch——createSegment 打上创建时纪元；
 * 渲染周期开始递推 nextSegmentEpoch）——cleanup 的防御性 dispose 只处理
 * `seg.epoch < 周期纪元` 的段（unmount 目标永远是旧树段——同槽位复用
 * 的新段不是目标）。
 *
 * 断言形态：三段导航（A→B→C——同槽位组件替换）× onUnmount 计数 × DOM
 * 终态（残留内容零出现）——Sim 顺序消费不覆盖此路径（Sim 的 unmount 在
 * 新段挂载前——真实消费端是 apply→cleanup 两阶段——本测试走真实
 * uiServeV2 管线）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UIRouter } from '../../client/vdom/core/router.ts'
import { uiServeV2 } from '../../client/vdom/core/v2/serve.ts'
import { h } from '../../client/vdom/core/vnode.ts'
import { FakeDocument, FakeElement, FakeWindow } from './helpers/fake-dom.ts'

// ── 全局 DOM 桩（uiServeV2 直接读 document/window 全局） ──
const doc = new FakeDocument()
const win = new FakeWindow() as unknown as Window & typeof globalThis
const root = new FakeElement('div')
root.id = 'root'
doc.appendChild(root)
;(globalThis as Record<string, unknown>).document = doc
;(globalThis as Record<string, unknown>).window = win
// 首帧路径 /a（fake 默认 '/'——直接置位——boot 走 /a）
win.location.pathname = '/a'

/** 等待微任务/调度 flush（渲染周期 Promise 化——settle 后命令已消费） */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0))
}

// ── 三段模块级组件（段复用前提——工厂引用稳定） ──
// **B 带 keyed 列表 + input（贴近 showcase index 形态——残留载体）**
const unmounts: Record<string, number> = { a: 0, b: 0, c: 0 }
const PageA = (_init: unknown, ctx: { onUnmount: (fn: () => void) => void }) => {
  ctx.onUnmount(() => { unmounts.a++ })
  return () => h('div', { class: 'page-a' }, h('h1', {}, 'AAA'))
}
const PageB = (_init: unknown, ctx: { onUnmount: (fn: () => void) => void }) => {
  ctx.onUnmount(() => { unmounts.b++ })
  return () => h('div', { class: 'page-b' },
    h('h1', {}, 'BBB'),
    h('input', { value: '' }),
    h('ul', {}, ['x', 'y', 'z'].map((s) => h('li', { key: s }, `item-${s}`))),
  )
}
const PageC = (_init: unknown, ctx: { onUnmount: (fn: () => void) => void }) => {
  ctx.onUnmount(() => { unmounts.c++ })
  return () => h('div', { class: 'page-c' }, h('h1', {}, 'CCC'))
}
// **App 路由包裹（页面组件挂同一槽位——同 comId 复用起点）**
const App = (_init: unknown, _ctx: unknown) => (p: { page: unknown }) =>
  h('main', { class: 'app' }, p.page as never)

const pages = { '/a': PageA, '/b': PageB, '/c': PageC } as const

test('NAV-SLOT-REUSE 导航链残留：A→B→C 同槽位替换——cleanup 不误杀新段（终态零残留 + onUnmount 恰一次）', async () => {
  unmounts.a = unmounts.b = unmounts.c = 0
  const router = new UIRouter()
  for (const [path, Comp] of Object.entries(pages)) {
    router.get(path, (req: Request, ctx: unknown) =>
      (ctx as { stream: (v: unknown) => Response }).stream(h(App, { page: h(Comp, {}) })))
  }
  const serve = uiServeV2(router, { root: '#root' as never } as never) as unknown as {
    navigate: (p: string) => Promise<void>
    unmount: () => void
  }

  // 首帧 /a —— 段挂载（工厂计数 1——onUnmount 0）
  await settle()
  assert.ok(root.getFullText().includes('AAA'), `首帧 A——实际「${root.getFullText()}」`)
  assert.deepEqual(unmounts, { a: 0, b: 0, c: 0 }, '首帧零卸载')

  // nav1 A→B：旧段生成期处置 + 新段 B 同槽位挂载——cleanup 的 unmount
  // A（同 id root.0.0.0）不得误杀新段 B（纪元守卫）
  await serve.navigate('/b')
  await settle()
  assert.ok(root.getFullText().includes('BBB'), `nav1 后 B——实际「${root.getFullText()}」`)
  assert.ok(!root.getFullText().includes('AAA'), 'nav1 后 A 零残留')
  assert.equal(unmounts.a, 1, 'A 卸载恰一次（nav1）')
  assert.equal(unmounts.b, 0, 'B 段存活（cleanup 未误杀新段——本回归核心）')

  // nav2 B→C：B 段存在 → 输出区间移除命令 + 卸载——旧 B 内容零残留
  await serve.navigate('/c')
  await settle()
  const text = root.getFullText()
  assert.ok(text.includes('CCC'), `nav2 后 C——实际「${text}」`)
  assert.ok(!text.includes('BBB'), 'nav2 后 B 零残留（列表残留复现点）')
  assert.ok(!text.includes('item-'), 'nav2 后 keyed 列表零残留')
  assert.equal(unmounts.b, 1, 'B 卸载恰一次（nav2——非 nav1 误杀）')
  assert.equal(unmounts.c, 0, 'C 段存活')

  serve.unmount()
  assert.equal(unmounts.c, 1, 'unmount 后 C 清理')
})
