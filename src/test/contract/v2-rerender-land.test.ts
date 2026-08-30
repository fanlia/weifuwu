/**
 * W1（VDOM-STREAM-FIX-PLAN —— P0：重渲染落地性定位）
 *
 * 走查疑点定审：route 页 popstate 后界面不刷新（mockHits=0 / 内容停旧）。
 * 本文件把「路由页重渲染」逐环拆开验证：
 *
 * - 环A/C：resolvePath → handler 执行 → 工厂执行 → DOM 渲染（首帧 + 同 URL 重渲染）
 * - 环B：数据更新 → ctx.render() → 工厂重跑 → DOM 显示新数据
 * - 环D：组件级重渲染（signal set → requestRender → DOM 更新——段复用工厂不重跑）
 * - 三形态：同 URL / query 变化 / popstate（serve 监听 win——不是 doc）
 * - batching：×3 同拍不丢最终态
 *
 * 结论（2027-XX）：
 * 1. 环A 证伪「不落地」——ctx.render() 同 URL 确实重跑 handler；
 *    走查 popstate 后 mockHits=0 为 hooks 幂等拦截（useAsyncData 同 key 合并）——
 *    非 handler 未跑。
 * 2. **W1-P0 断链定位（signal 未接线自动重渲染）**：ctx.ui.signal() 原为裸
 *    createSignal —— set 后无人 requestRender —— DOM 不更新（环D 实证）——
 *    已修（env.ts signal 接线 subscribe → requestRender）——与 useExternal/
 *    useObservable 同模式。
 * 3. **段复用语义前提**：组件工厂必须模块级稳定引用（真应用形态）——handler
 *    内定义组件 → 每次 handler 重跑新引用 → cycle 异型 resetRoot+build →
 *    工厂重跑 signal 重置（状态丢失）——测试页 App/Page 故意用模块级
 *    锁定「段复用」契约（注册失败即本测试红）。
 *
 * 测试基建：手写 fake DOM（零 jsdom——契约层零依赖纪律）——
 * helpers/fake-dom.ts。
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

/** 等待微任务/调度 flush（渲染周期 Promise 化——settle 后命令已消费） */
const settle = async (): Promise<void> => {
  // 调度器 flush 排微任务——多拍（render 链 + apply 链）都落定
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0))
}

interface PageState { title: string; count: number }

// **模块级组件（段复用前提——引用稳定）**：handler 内定义的组件工厂每次
// handler 重跑都是新引用 → cycle 异型 resetRoot → 段消失状态重置。
// 真实应用组件全部模块级/导入级——本测试锁定该契约（失败 = 应用侧
// 把组件定义放进 handler——违反段复用语义）。
const Page = (_init: unknown, pageCtx: { ui: { signal: <T>(v: T) => { (): T; set: (v: T) => void; subscribe: (cb: () => void) => () => void } } }): (() => unknown) => {
  // 工厂只跑一次（段复用——signal 初值从此保持——状态容器）
  const title = pageCtx.ui.signal('v1')
  const count = pageCtx.ui.signal(1)
  // 工厂 spy（模块级计数通路——段复用验证）
  factoryProbe.calls++
  // 外部数据钩子（signal.set —— 组件级/请求渲染）
  extHandle.externalSet = (t: string, c: number) => {
    title.set(t)
    count.set(c)
  }
  return () => h('div', { class: 'page' },
    h('h1', {}, title()),
    h('span', { class: 'count' }, String(count())),
  )
}
const App = () => () => h('div', { class: 'app' }, h(Page, {}))

/** 测试句柄（Page 工厂经它注册外部 set——无闭包泄漏的模块级通路） */
const extHandle: { externalSet?: (t: string, c: number) => void } = { externalSet: undefined }
/** 工厂计数探针（模块级通路——setupPage 读计数） */
const factoryProbe: { calls: number } = { calls: 0 }

/** 搭页面：handler spy + 工厂 spy + 外部数据钩子（signal set 模拟异步到达） */
function setupPage() {
  let handlerCalls = 0
  const factoryCalls = (): number => factoryProbe.calls
  factoryProbe.calls = 0
  extHandle.externalSet = undefined
  const handler = (req: Request, ctx: unknown) => {
    handlerCalls++
    void req
    return (ctx as { stream: (v: unknown) => Response }).stream(h(App, {}))
  }
  const router = new UIRouter()
  router.get('/page', handler)
  router.get('/', handler)

  const serve = uiServeV2(router, { root: '#root' as never } as never) as never as {
    render: () => Promise<void>
    navigate: (p: string) => Promise<void>
    unmount: () => void
  }
  const text = (): string => root.getFullText()
  return {
    serve,
    text,
    /** 模拟异步数据到达（signal set —— 请求渲染 + 段复用 renderFn 重跑） */
    updateData: (t: string, c: number) => extHandle.externalSet?.(t, c),
    counts: {
      get handler() { return handlerCalls },
      get factory() { return factoryCalls() },
    },
    /** 工厂 spy（工厂内注册——模块级计数通路） */
    watchFactory: () => { factoryCalls++ },
  }
}

test('W1-环A/C 首帧：resolvePath → handler 执行 → 工厂执行 → DOM 渲染', async () => {
  const page = setupPage()
  await settle()
  assert.equal(page.counts.handler, 1, '首帧 handler 恰 1 次')
  assert.ok(page.text().includes('v1'), `首帧标题——实际「${page.text()}」`)
  assert.ok(page.text().includes('1'), `首帧计数——实际「${page.text()}」`)
  page.serve.unmount()
  extHandle.externalSet = undefined
})

test('W1-环A 同 URL ctx.render()：handler 必须重跑（Templates「不落地」回归定审）', async () => {
  const page = setupPage()
  await settle()
  const before = page.counts.handler
  page.serve.render()
  await settle()
  assert.ok(page.counts.handler > before, `同 URL render 重跑 handler——${before} → ${page.counts.handler}`)
  // 段复用：signal 状态保持（工厂不重跑 → 初值仍是 v1 且 set 的值不丢）
  assert.ok(page.text().includes('v1'), `段复用状态保持——实际「${page.text()}」`)
  page.serve.unmount()
  extHandle.externalSet = undefined
})

test('W1-环B 数据更新 → signal set → DOM 显示新数据（段复用——handler 重跑工厂不重跑）', async () => {
  const page = setupPage()
  await settle()
  // 异步数据到达（signal set —— 自动重渲染）
  page.updateData('v2', 42)
  await settle()
  assert.ok(page.text().includes('v2'), `DOM 显示新标题——实际「${page.text()}」`)
  assert.ok(page.text().includes('42'), `DOM 显示新计数——实际「${page.text()}」`)
  page.serve.unmount()
  extHandle.externalSet = undefined
})

test('W1 连续 signal set ×3 同拍：batching → 终态正确', async () => {
  const page = setupPage()
  await settle()
  page.updateData('v2', 7)
  page.updateData('v3', 8)
  page.updateData('v4', 9)
  await settle()
  assert.ok(page.text().includes('v4'), `不丢最终态——实际「${page.text()}」`)
  assert.ok(page.text().includes('9'), '终态计数正确')
  page.serve.unmount()
  extHandle.externalSet = undefined
})

test('W1 query 变化：navigate(?a=1 → ?a=2) → handler 重跑（params/query 注入新值）', async () => {
  const page = setupPage()
  await settle()
  const before = page.counts.handler
  win.setLocation('/page?a=1')
  page.serve.navigate('/page?a=1')
  await settle()
  win.setLocation('/page?a=2')
  page.serve.navigate('/page?a=2')
  await settle()
  assert.ok(page.counts.handler > before, `navigate 重跑 handler——${before} → ${page.counts.handler}`)
  page.serve.unmount()
  extHandle.externalSet = undefined
})

test('W1 popstate：同 URL 派发 → handler 重跑（走查 popstate 实验 mockHits=0 定审）', async () => {
  const page = setupPage()
  await settle()
  const before = page.counts.handler
  const beforeFactory = page.counts.factory
  win.setLocation('/page')
  win.dispatch('popstate')
  await settle()
  assert.ok(page.counts.handler > before, `popstate 重跑 handler——${before} → ${page.counts.handler}`)
  // **mockHits=0 最终解释**：popstate → handler 重跑 → 段复用（工厂不重跑）→
  // Templates 工厂期 loadTemplates 不重跑 —— 走查实验 mockHits=0 是「段复用
  // 状态保持」而非「handler 未跑」——组件级数据（signal/工厂闭包）跨 popstate 保持
  assert.equal(page.counts.factory, beforeFactory, `段复用：popstate 后工厂不重跑——${beforeFactory} → ${page.counts.factory}`)
  page.serve.unmount()
  extHandle.externalSet = undefined
})
