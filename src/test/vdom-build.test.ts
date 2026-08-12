/**
 * vdom build 测试——async 预构建（阶段 1）
 *
 * 核心不变量：
 * 1. 组件构建后 _render 已设，工厂只跑一次
 * 2. 旧树同位置同类型复用 _render（工厂不重跑）
 * 3. 剪枝：同 props + 旧 _child 有值 → renderFn 不重跑
 * 4. 兄弟并行
 * 5. 动态挂载组件（.then 后首次出现）在 build 中 await——构建完成
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { h, type VNode } from '../ui-dom/vnode.ts'
import { buildVNode, mountAsyncComponent, componentPropsEqual } from '../ui-dom/vdom2/build.ts'
import { createRegistry } from '../ui-dom/vdom2/registry.ts'

function makeCtx(): any {
  const reg = createRegistry()
  return {
    __registry: reg,
    browser: undefined,
    ui: {
      _selfId: '_wf_root',
      setMounting: () => {},
      endMounting: () => {},
    },
  }
}

// ── 1. 基础：文本/数组透传 ──

test('buildVNode: 文本/数字/null 透传', async () => {
  const ctx = makeCtx()
  assert.equal(await buildVNode('hello', ctx), 'hello')
  assert.equal(await buildVNode(42, ctx), 42)
  assert.equal(await buildVNode(null, ctx), null)
})

test('buildVNode: 数组递归展开（兄弟并行）', async () => {
  const ctx = makeCtx()
  const arr = ['a', 1, null, 'b']
  const out = await buildVNode(arr, ctx)
  assert.deepEqual(out, ['a', 1, null, 'b'])
})

// ── 2. 组件：async 工厂 → renderFn 缓存 ──

test('组件构建：_render 已设，工厂只跑一次', async () => {
  const ctx = makeCtx()
  let calls = 0
  const Comp = async (_init: any) => { calls++; return () => h('div', {}, 'x') }
  const vnode = h(Comp, {})
  await buildVNode(vnode, ctx)
  assert.equal(typeof vnode._render, 'function', '_render 已设')
  assert.equal(calls, 1, '工厂一次')
  // 再次构建同一 vnode：不重跑工厂
  await buildVNode(vnode, ctx)
  assert.equal(calls, 1, '二次构建工厂不重跑')
})

test('组件构建：_child 展开为 renderFn 输出（含子树）', async () => {
  const ctx = makeCtx()
  const Inner = async (_init: any) => () => h('span', {}, 'inner')
  const Comp = async (_init: any) => () => h('div', {}, h(Inner, {}))
  const vnode = h(Comp, {})
  await buildVNode(vnode, ctx)
  const child = vnode._child as VNode
  assert.equal(child.type, 'div')
  const inner = (child.props.children as VNode)
  assert.equal(typeof inner._render, 'function', '子树组件也已构建')
})

test('组件构建：旧树同位置同类型复用 _render（工厂不重跑）', async () => {
  const ctx = makeCtx()
  let calls = 0
  const Comp = async (_init: any) => { calls++; return () => h('div', {}, 'x') }
  const oldV = h(Comp, {})
  await buildVNode(oldV, ctx)
  assert.equal(calls, 1)
  // 新 vnode（同类型）对照旧树构建
  const newV = h(Comp, {})
  await buildVNode(newV, ctx, oldV)
  assert.equal(calls, 1, '复用旧 _render——工厂不重跑')
  assert.equal(newV._render, oldV._render, '_render 引用复用')
})

test('组件构建：同 props + 旧 _child 有值 → 剪枝（renderFn 不重跑）', async () => {
  const ctx = makeCtx()
  let renderCalls = 0
  const Comp = async (_init: any) => () => { renderCalls++; return h('div', {}, 'x') }
  const oldV = h(Comp, { a: 1 })
  await buildVNode(oldV, ctx)
  assert.equal(renderCalls, 1)
  // 同 props 重建：剪枝——renderFn 不重跑，_child 复用
  const newV = h(Comp, { a: 1 })
  await buildVNode(newV, ctx, oldV)
  assert.equal(renderCalls, 1, '剪枝 renderFn 不重跑')
  assert.equal(newV._child, oldV._child, '_child 复用')
  // props 变化：renderFn 重跑
  const newV2 = h(Comp, { a: 2 })
  await buildVNode(newV2, ctx, oldV)
  assert.equal(renderCalls, 2, 'props 变 renderFn 重跑')
})

// ── 3. 兄弟并行 ──

test('兄弟组件并行：50ms×2 总时长 < 90ms', async () => {
  const ctx = makeCtx()
  const Slow = async (_init: any) => { await new Promise(r => setTimeout(r, 50)); return () => h('div', {}, 's') }
  const start = Date.now()
  await buildVNode([h(Slow, {}), h(Slow, {})], ctx)
  const elapsed = Date.now() - start
  assert.ok(elapsed < 90, `并行 ${elapsed}ms`)
})

// ── 4. 动态挂载：.then 后首次出现的 async 组件在 build 中 await ──

test('动态挂载：未构建组件在 build 中 await（_render 设 + _child 展开）', async () => {
  const ctx = makeCtx()
  let gate!: () => void
  const gateP = new Promise<void>(r => { gate = r })
  const Slow = async (_init: any) => { await gateP; return () => h('div', { class: 'slow' }, 'S') }
  const vnode = h(Slow, {})
  const building = buildVNode(vnode, ctx)
  // 构建中（工厂 await）：_render 未设——构建完成（await）后才设
  assert.equal(typeof vnode._render, 'undefined', '构建中 _render 未设')
  gate()
  await building
  const child = vnode._child as VNode
  assert.equal(child.type, 'div')
  assert.equal((child.props as any).class, 'slow')
})

// ── 5. mountAsyncComponent：id 分配 + childCtx ──

test('mountAsyncComponent: 分配 id + childCtx._selfId', async () => {
  const ctx = makeCtx()
  const Comp = async (_init: any, c: any) => {
    assert.equal(c.ui._selfId, vnode._id, 'childCtx selfId = vnode id')
    return () => h('div', {}, 'x')
  }
  const vnode = h(Comp, {})
  const { childCtx } = await mountAsyncComponent(vnode, ctx, ctx.__registry)
  assert.equal(typeof vnode._id, 'string')
  assert.equal(ctx.__registry.idRegistry.get(vnode._id), vnode)
  assert.equal(childCtx.ui._selfId, vnode._id)
})

test('componentPropsEqual: 浅比较', () => {
  assert.ok(componentPropsEqual({ a: 1 }, { a: 1 }))
  assert.ok(!componentPropsEqual({ a: 1 }, { a: 2 }))
  assert.ok(!componentPropsEqual({ a: 1 }, { a: 1, b: 2 }))
  assert.ok(componentPropsEqual({}, {}))
})
