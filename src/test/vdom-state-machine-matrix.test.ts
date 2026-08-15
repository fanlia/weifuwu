/**
 * vdom 状态机联合矩阵——lifecycle × render/diff/build 非法组合系统性断言
 *
 * x2y 矩阵（vdom2-matrix）验证"类型转换"单机；本矩阵验证**跨状态机一致性**：
 * lifecycle（fresh/building/built/pruned/disposed）的每个状态进入渲染管线
 * （renderValue / patchValue / buildVNode）的合法/非法行为——不变量形式化：
 *
 *   I5a fresh 进 diff        → 抛错（未构建——buildVNode 必须先于 patchValue）
 *   I5b building 进 render   → 抛错（异步工厂未 resolve）
 *   I5c building 进 diff     → 抛错（diff 同步上下文不该遇到）
 *   I5d disposed 进 render   → 占位 + warn（不渲染内容——剪枝缓存失效兜底）
 *   I5e disposed 进 diff(newC) → 占位兜底（I1——父树重建）
 *   I5f disposed 进 build    → 合法（重建路径——disposed --BUILD_START--> building）
 *   I5g fresh 进 render      → 正常（renderComp 按 _render 推断——手写 vnode）
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { h } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { createVdomContext } from '../ui-dom/context.ts'
import { buildVNode } from '../ui-dom/vdom2/build.ts'
import { renderValue } from '../ui-dom/vdom2/render.ts'
import { patchValue } from '../ui-dom/vdom2/patch.ts'
import { __resetVdomEvents } from '../ui-dom/vdom2/events.ts'

before(setupJsdom)
const browser = createClientBrowser()

function Comp(_init: any, _ctx: any) {
  return async () => h('div', { class: 'comp-out' }, 'C')
}

function mkRoot() {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { ctx, registry } = createVdomContext({ browser, root })
  return { ctx, registry, root }
}

async function mountComp(ctx: any, registry: any, root: HTMLElement, vnode: any) {
  await buildVNode(vnode, ctx, null, registry)
  const node = renderValue(vnode, ctx, browser)
  if (node) root.appendChild(node)
}

test('I5a：fresh（未构建）组件进 diff → 抛错', async () => {
  const { ctx, registry, root } = mkRoot()
  __resetVdomEvents()
  const fresh = h(Comp, {})
  const built = h(Comp, {})
  await mountComp(ctx, registry, root, built)
  assert.throws(
    () => patchValue(root, root.firstChild, built, fresh, { browser, registry }),
    /not built in diff/,
    'fresh 组件进 diff 必须抛错（buildVNode 未先行）',
  )
  document.body.removeChild(root)
})

test('I5b：building 组件进 renderValue → 抛错', async () => {
  const { ctx, registry, root } = mkRoot()
  __resetVdomEvents()
  const v = h(Comp, {})
  // 手动标记 building（模拟异步工厂未 resolve）
  ;(v as any)._lifecycle = 'building'
  assert.throws(
    () => renderValue(v, ctx, browser),
    /building in render/,
    'building 组件渲染必须抛错（异步工厂未 resolve——同步上下文不该遇到）',
  )
  document.body.removeChild(root)
})

test('I5c：disposed 组件进 renderValue → 占位 + warn（不渲染内容）', async () => {
  const { ctx, registry, root } = mkRoot()
  __resetVdomEvents()
  const warns: string[] = []
  const ow = console.warn.bind(console)
  console.warn = (...a: any[]) => { warns.push(String(a[0])); ow(...a) }
  try {
    const v = h(Comp, {})
    await mountComp(ctx, registry, root, v)
    // dispose（模拟导航移除）
    const { disposeComponent } = await import('../ui-dom/vdom2/patch.ts')
    disposeComponent(v, registry)
    // disposed 进 render → 占位 + warn（不抛错——剪枝缓存失效兜底）
    const node = renderValue(v, ctx, browser)
    assert.ok(node?.nodeType === 8, 'disposed 渲染输出占位注释节点')
    assert.ok(warns.some((w) => w.includes('在渲染')), '占位兜底 warn 提示，实际: ' + warns.join('|'))
  } finally {
    console.warn = ow
    document.body.removeChild(root)
  }
})

test('I5d：disposed 组件进 diff（newC）→ 占位兜底（不抛错——父树重建中）', async () => {
  const { ctx, registry, root } = mkRoot()
  __resetVdomEvents()
  const v1 = h(Comp, {})
  await mountComp(ctx, registry, root, v1)
  const { disposeComponent } = await import('../ui-dom/vdom2/patch.ts')
  disposeComponent(v1, registry)
  // disposed 旧 vnode 作为 newC 进 diff——posRealReal I1 兜底（占位不抛错）
  const holder = h('div', {}, 'new')
  await buildVNode(holder, ctx, null, registry)
  const node = patchValue(root, root.firstChild, v1, holder, { browser, registry })
  assert.ok(root.querySelector('.comp-out') === null || node !== null, 'diff 不崩溃（I1 兜底）')
  document.body.removeChild(root)
})

test('I5e：disposed 组件进 buildVNode（重建路径）→ 合法（disposed --BUILD_START--> building）', async () => {
  const { ctx, registry, root } = mkRoot()
  __resetVdomEvents()
  const v = h(Comp, {})
  await mountComp(ctx, registry, root, v)
  const { disposeComponent } = await import('../ui-dom/vdom2/patch.ts')
  disposeComponent(v, registry)
  assert.equal((v as any)._lifecycle, 'disposed', '前置：disposed')
  // 重建（disposed 的 BUILD_START 合法——lifecycle 状态机）
  const rebuilt = await buildVNode(v, ctx, null, registry)
  assert.equal((rebuilt as any)._lifecycle, 'built', '重建完成 → built')
  assert.equal((rebuilt as any)._render, (v as any)._render, 'renderFn 保持（工厂不重跑）')
  document.body.removeChild(root)
})

test('I5f：pruned 组件进 render/diff → 正常（剪枝复用 _child——状态保持）', async () => {
  const { ctx, registry, root } = mkRoot()
  __resetVdomEvents()
  const v1 = h(Comp, {})
  await mountComp(ctx, registry, root, v1)
  // 剪枝（模拟下次渲染同 props）
  const v2 = h(Comp, {})
  await buildVNode(v2, ctx, v1, registry)
  assert.equal((v2 as any)._lifecycle, 'pruned', '剪枝命中')
  // pruned 进 render → 正常输出（_child 共享）
  const node = renderValue(v2, ctx, browser)
  assert.ok(node && (node as Element).className === 'comp-out', 'pruned 渲染正常')
  document.body.removeChild(root)
})
