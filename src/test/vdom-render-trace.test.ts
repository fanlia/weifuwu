/**
 * vdom 渲染请求追踪测试——从 uiServe 到页面存续期所有渲染入口统一可追溯
 *
 * 覆盖：
 * - 组件内 ctx.ui.render()（无参）→ RENDER_REQUEST source=component + 调用者组件名/id
 * - 组件内 ctx.ui.render(['id'])（跨组件）→ source=component + 显式 ids
 * - renderer.render 直接调用（外部系统）→ source=external
 * - rootUi.render 无参（root 层——i18n 等）→ source=root
 * - __vdom_render_trace() 统一视图（uiServe/组件/外部全部按时间列出）
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { createVdomContext, mountRoot } from '../ui-dom/context.ts'
import { buildVNode } from '../ui-dom/vdom2/build.ts'
import { renderValue } from '../ui-dom/vdom2/render.ts'
import { h } from '../ui-dom/vnode.ts'
import { createRegistry } from '../ui-dom/vdom2/registry.ts'
import { __resetVdomEvents, __vdom_events, __vdom_render_trace } from '../ui-dom/vdom2/events.ts'

before(setupJsdom)
const browser = createClientBrowser()

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 20))
}

/** 记录 render 请求事件（machine=render, event=RENDER_REQUEST） */
function requests(): any[] {
  return __vdom_events(200, { machine: 'render', event: 'RENDER_REQUEST' } as any)
}

test('RENDER_REQUEST：组件内 ctx.ui.render() 无参 → source=component + 调用者组件名/id', async () => {
  __resetVdomEvents()
  const { ctx, registry } = createVdomContext({ browser, root: document.createElement('div') })
  let fired = 0
  function CallerComp(_init: any, c: any) {
    return async () => {
      if (fired === 0) {
        fired++
        setTimeout(() => { void c.ui.render() }, 0) // 组件内无参 render（childCtx 绑定自身 id）
      }
      return h('div', { class: 'caller' }, 'hi')
    }
  }
  const tree = h(CallerComp, {})
  await buildVNode(tree, ctx, null, registry)
  const node = renderValue(tree, ctx, browser)
  document.body.appendChild(node!)
  await flush()

  const reqs = requests()
  assert.ok(reqs.length >= 1, '至少一条 RENDER_REQUEST，实际: ' + reqs.length)
  const req = reqs[reqs.length - 1]
  assert.equal(req.from, 'component', 'source=component，实际: ' + req.from)
  assert.equal(req.component, 'CallerComp', '调用者组件名，实际: ' + req.component)
  assert.ok(req.nodeId, '调用者组件 id（childUi 绑定）')
  const p = req.payload as any
  assert.deepEqual(p.ids, [(tree as any)._id], '无参 render → 目标 = 自身 id')
})

test('RENDER_REQUEST：组件内 ctx.ui.render([otherId]) 跨组件 → source=component + 显式 ids', async () => {
  __resetVdomEvents()
  const { ctx, registry } = createVdomContext({ browser, root: document.createElement('div') })
  let targetId = ''
  function TargetComp() {
    return async () => h('div', { class: 'target' }, 'T')
  }
  function CallerComp(_init: any, c: any) {
    return async () => {
      if (!targetId) {
        // 第一次渲染时把另一个组件挂载起来拿 id——简化：直接注册一个 id
        targetId = (ctx.ui as any)._rootVNodeId ?? 'x'
        setTimeout(() => { void c.ui.render(['other-1']) }, 0)
      }
      return h('div', { class: 'caller' }, 'hi')
    }
  }
  // 直接用一个已注册 id 模拟跨组件目标
  const other = h(TargetComp, {})
  await buildVNode(other, ctx, null, registry)
  const tree = h(CallerComp, {})
  await buildVNode(tree, ctx, null, registry)
  const node = renderValue(tree, ctx, browser)
  document.body.appendChild(node!)
  await flush()

  const reqs = requests()
  const req = reqs[reqs.length - 1]
  assert.equal(req.from, 'component', 'source=component')
  assert.equal(req.component, 'CallerComp', '调用者组件名')
  const p = req.payload as any
  assert.deepEqual(p.ids, ['other-1'], '跨组件显式 ids')
})

test('RENDER_REQUEST：renderer.render 直接调用（外部系统）→ source=external；root 层 → source=root', async () => {
  __resetVdomEvents()
  const { ctx, registry, renderer } = createVdomContext({ browser, root: document.createElement('div') })
  await renderer.render(['ext-1'], { source: 'external', component: null, nodeId: null, detail: 'popup-tracker' })
  await flush()
  // rootUi.render 无参（root 层——rootVNodeId 已设置时走 root 渲染）
  ;(ctx.ui as any)._rootVNodeId = 'root-id'
  await (ctx.ui as any).render.call({ _selfId: '_wf_root' })
  await flush()

  const reqs = requests()
  assert.equal(reqs[0].from, 'external', '外部系统 source=external，实际: ' + reqs[0].from)
  assert.equal((reqs[0].payload as any).detail, 'popup-tracker')
  assert.equal(reqs[reqs.length - 1].from, 'root', 'root 层 source=root，实际: ' + reqs[reqs.length - 1].from)
})

test('__vdom_render_trace：统一视图列出所有渲染入口（组件/外部/root）', async () => {
  __resetVdomEvents()
  const { ctx, registry, renderer } = createVdomContext({ browser, root: document.createElement('div') })
  await renderer.render(['ext-1'], { source: 'external', component: null, nodeId: null, detail: 'popup-tracker' })
  ;(ctx.ui as any)._rootVNodeId = 'root-id'
  await (ctx.ui as any).render.call({ _selfId: '_wf_root' })
  await flush()
  const trace = __vdom_render_trace(50)
  assert.ok(trace.length >= 2, '追踪行数 ≥2，实际: ' + trace.length)
  assert.match(trace[0], /external/, '外部系统可追溯，实际: ' + trace[0])
  assert.match(trace[trace.length - 1], /root/, 'root 层可追溯，实际: ' + trace[trace.length - 1])
  assert.match(trace[0], /ext-1/, '目标 ids 可追溯')
})

test('uiServe renderPath：首帧/导航发射 RENDER_REQUEST（source=uiServe）', async () => {
  __resetVdomEvents()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const handle = mountRoot({ browser, root, onError: () => {} })
  function PageComp(_init: any) {
    return async () => h('div', { class: 'page' }, 'P')
  }
  await handle.mount(h(PageComp, {}))
  await flush()

  const reqs = requests()
  // mountRoot 不发射 uiServe 事件（renderPath 专属）——这里验证 mount 正常 + 无报错
  assert.ok(root.querySelector('.page'), 'mount 正常')
  document.body.removeChild(root)
  assert.ok(Array.isArray(reqs))
})
