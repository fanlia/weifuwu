/**
 * vdom core — diff 测试（旧树 vs 新树 → 增量更新命令——就地 patch 现有 DOM）
 *
 * 四阶段管线（route → build → diff → patch）：
 * - 首帧（无旧树）→ 全量 build 命令
 * - 同类型元素 → 就地 patch（属性 setProp + children 递归——不重建）
 * - 文本 → setText 就地更新（不重建节点）
 * - 组件同类型复用（工厂不重跑——renderFn 重新调用）
 * - 异类型/空洞 ↔ 真实节点 → transform 让位（childNodes 同构——长度恒定）
 *
 * **无 hydration**（2026-12 决策）：diff/patch 的标准就是现有 DOM 节点——
 * 增量命令就地更新——无收养/无整树重建。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testBrowser } from '../setup.ts'
import { h } from './vnode.ts'
import { diffStream } from './diff.ts'
import { renderToStream } from './build.ts'
import { CommandApplier } from './patch.ts'
import { createComponentRegistry } from './node/component.ts'
import type { Ctx } from '../context/Ctx.ts'

/** 两阶段 harness：首帧 build（渲染旧树）→ diff 增量（就地 patch） */
function harness(browser: ReturnType<typeof testBrowser>) {
  const registry = createComponentRegistry()
  const root = browser.document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, browser.document)
  const apply = async (stream: ReadableStream) => {
    const reader = stream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      applier.apply(value)
    }
  }
  return {
    root, registry,
    mount: (tree: ReturnType<typeof h>) => apply(renderToStream(tree, {} as Ctx, registry)),
    update: (oldTree: ReturnType<typeof h>, newTree: ReturnType<typeof h>) =>
      apply(diffStream(oldTree, newTree, {} as Ctx, registry)),
  }
}

test('首帧：无旧树 → 全量 build（等价 renderToStream）', async () => {
  const hz = harness(testBrowser())
  await hz.mount(h('div', { class: 'a' }, 'hello'))
  assert.equal(hz.root.querySelector('.a')?.textContent, 'hello')
})

test('同类型元素：属性更新 + children 递归 patch（就地——不重建）', async () => {
  const hz = harness(testBrowser())
  await hz.mount(h('div', { class: 'old', id: 'x' }, [h('span', {}, 'a'), h('span', {}, 'b')]))
  await hz.update(
    h('div', { class: 'old', id: 'x' }, [h('span', {}, 'a'), h('span', {}, 'b')]),
    h('div', { class: 'new', id: 'x' }, [h('span', {}, 'A'), h('span', {}, 'b')]),
  )
  const div = hz.root.querySelector('div')!
  assert.equal(div.className, 'new', '属性就地更新')
  assert.equal(div.querySelectorAll('span').length, 2)
  assert.equal(div.querySelectorAll('span')[0].textContent, 'A', '文本就地 setText 更新')
  assert.equal(div.querySelectorAll('span')[1].textContent, 'b', '未变项保持')
})

test('文本变化：setText 就地更新（节点不重建——焦点保持前提）', async () => {
  const hz = harness(testBrowser())
  await hz.mount(h('div', {}, 'v1'))
  const divBefore = hz.root.querySelector('div')
  await hz.update(h('div', {}, 'v1'), h('div', {}, 'v2'))
  assert.equal(hz.root.querySelector('div')?.textContent, 'v2')
  assert.equal(hz.root.querySelector('div'), divBefore, '同一 div 节点——不重建')
})

test('新增/移除 children：新项插入 + 旧项移除（就地）', async () => {
  const hz = harness(testBrowser())
  await hz.mount(h('div', {}, [h('span', { class: 'a' }, 'a'), h('span', { class: 'b' }, 'b')]))
  await hz.update(
    h('div', {}, [h('span', { class: 'a' }, 'a'), h('span', { class: 'b' }, 'b')]),
    h('div', {}, [h('span', { class: 'a' }, 'a'), h('span', { class: 'c' }, 'c')]),
  )
  const div = hz.root.querySelector('div')!
  assert.equal(div.querySelectorAll('span').length, 2)
  assert.equal(div.querySelector('.a')?.textContent, 'a')
  assert.equal(div.querySelector('.c')?.textContent, 'c')
  assert.equal(div.querySelector('.b'), null, '旧项移除')
})

test('组件同类型复用：工厂不重跑——renderFn 重新调用读最新状态', async () => {
  const hz = harness(testBrowser())
  let mounts = 0
  let renders = 0
  const Counter = () => {
    mounts++
    return (props: Record<string, unknown>) => {
      renders++
      return h('span', { class: 'c' }, `v:${String(props.value)}`)
    }
  }
  await hz.mount(h(Counter, { value: 1 }))
  assert.equal(mounts, 1)
  assert.equal(hz.root.querySelector('.c')?.textContent, 'v:1')
  await hz.update(h(Counter, { value: 1 }), h(Counter, { value: 2 }))
  assert.equal(mounts, 1, '工厂不重跑——实例复用')
  assert.equal(renders, 2, 'renderFn 重新调用')
  assert.equal(hz.root.querySelector('.c')?.textContent, 'v:2', 'props 变化 → DOM 更新')
})

test('异类型转换：element 移除（数组缩短——同构 1:1——就地）', async () => {
  const hz = harness(testBrowser())
  await hz.mount(h('div', {}, [h('span', {}, 'a'), h('b', {}, 'bold')]))
  await hz.update(
    h('div', {}, [h('span', {}, 'a'), h('b', {}, 'bold')]),
    h('div', {}, [h('span', {}, 'a')]),
  )
  const div = hz.root.querySelector('div')!
  assert.equal(div.childNodes.length, 1, '新树 1 项 ⟷ DOM 1 节点（长度 1:1——同构）')
  assert.equal(div.querySelector('b'), null, 'b 移除')
  assert.equal(div.querySelector('span')?.textContent, 'a', 'a 保留')
})

test('条件渲染：null → 元素（空洞 ↔ 真实节点互换——长度恒定）', async () => {
  const hz = harness(testBrowser())
  await hz.mount(h('div', {}, [h('span', {}, 'a'), null, h('span', {}, 'c')]))
  await hz.update(
    h('div', {}, [h('span', {}, 'a'), null, h('span', {}, 'c')]),
    h('div', {}, [h('span', {}, 'a'), h('b', {}, 'new'), h('span', {}, 'c')]),
  )
  const div = hz.root.querySelector('div')!
  assert.equal(div.childNodes.length, 3, '长度恒定（锚 → b 互换）')
  assert.equal(div.childNodes[1].textContent, 'new', '空洞位置被新元素占据')
})

test('diff 本质：精准命令流——counter 点击只发文本 setText（不重建/不重发属性）', async () => {
  const browser = testBrowser()
  const hz = harness(browser)
  let count = 0
  let rc: { render: () => void } = { render: () => {} }
  const onInc = () => { count++; rc.render() } // 工厂层稳定引用（AGENTS §3.1——零重绑）
  const Counter = () => {
    return () => h('div', {},
      h('button', { id: 'inc', onClick: onInc }, `count:${count}`),
    )
  }
  // 首帧（全量 build）
  await hz.mount(h(Counter, {}))
  assert.equal(hz.root.querySelector('#inc')?.textContent, 'count:0')

  // 点击模拟：count++ → 新树 → diff —— 捕获命令流断言精准性
  const oldTree = h(Counter, {})
  count = 1
  const newTree = h(Counter, {})
  const cmds: unknown[] = []
  const stream = diffStream(oldTree, newTree, {} as Ctx, hz.registry)
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    cmds.push(value)
  }
  // 精准断言：只 setText（文本节点）+ done——无 create/insert/remove/setProp
  const ops = cmds.map((c) => (c as { op: string }).op)
  assert.deepEqual(ops, ['setText', 'done'], '精准命令流——只修改文本节点')
  const setText = cmds[0] as { id: string; value: string }
  assert.equal(setText.id, 'root.0.0.0', '文本节点 id 精准定位')
  assert.equal(setText.value, 'count:1')
})

test('diff 本质：属性变化只发 setProp（不重建元素）', async () => {
  const hz = harness(testBrowser())
  await hz.mount(h('div', { class: 'a', id: 'x' }, 'text'))
  const cmds: unknown[] = []
  const stream = diffStream(
    h('div', { class: 'a', id: 'x' }, 'text'),
    h('div', { class: 'b', id: 'x' }, 'text'),
    {} as Ctx, hz.registry,
  )
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    cmds.push(value)
  }
  const ops = cmds.map((c) => (c as { op: string }).op)
  assert.deepEqual(ops, ['setProp', 'done'], '只发属性更新——元素不重建')
})
