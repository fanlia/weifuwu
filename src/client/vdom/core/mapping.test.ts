/**
 * vdom core — 映射与转化教学测试（真实例子：节点 → DOM + 类型转化）
 *
 * 展示 vdom 的核心规则（对照 design/vdom-transform-rules.md）：
 *
 * **① 节点 → DOM 映射**（首帧——build → patch）：
 *   - 元素 → 标签元素（data-wf-id 标记——事件代理查表基础）
 *   - 文本 → 文本节点；空洞（false/null）→ 注释占位（<!--wf-hole-->）
 *   - 组件 → 两阶段工厂输出（首帧 mount + renderFn）
 *   - 数组/Fragment → 展开为兄弟节点序列（隐式 Fragment）
 *   - Portal → 主树插槽锚 + 内容渲染到 #__wf_portal（body）
 *   - 事件 → EventRegistry 代理（不直接 addEventListener）
 *
 * **② 节点类型转化**（交互触发——diff → transform → patch——DOM 就地）
 *   - 空洞 ↔ 元素（条件渲染：占位锚 ↔ 真实节点互换——**childNodes 长度
 *     恒定**——同构不变量）
 *   - 空洞 ↔ 组件（条件渲染组件：mount/unmount + onUnmounts）
 *   - 组件 A ↔ B（同位置异类型：卸载重建——rec.type 比较）
 *   - 单节点 ↔ 数组（展开/收拢——transform 完整转换——旧区间递归清理）
 *   - 文本 ↔ 空洞（文本消失/恢复——占位锚保持）
 *   - keyed 列表增（身份复用——DOM 节点引用保持）
 *   - Portal 开/关（插槽锚 ↔ 浮层内容——removePortal 容器清理）
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import { UIRouter, uiServe } from '../index.ts'
import { h } from './vnode.ts'
import { Fragment } from './node/fragment.ts'
import { assertIsomorphic, assertKept, assertSlot, shapeOf } from '../testing.ts'
import { createPortal } from './node/portal.ts'
import type { Ctx } from '../context/Ctx.ts'
import type { RenderCtx } from './serve.ts'

/** 转化区域（位置 0-6 的槽——childNodes 同构断言） */
function slotCount(page: HTMLElement): number {
  return page.childNodes.length
}

test('节点 → DOM 映射 + 类型转化全流程（映射规则 + 转化规则教学验证）', async () => {
  const router = new UIRouter()
  const unEvents: string[] = []

  // ── 组件（两阶段工厂——首帧 mount + renderFn） ──
  const Chip = (init: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => unEvents.push(`un:chip:${String(init.label)}`))
    let n = 0
    const onAdd = () => { n++; void ctx.render() }
    return () => h('span', { class: 'chip' },
      `${String(init.label)}(${n})`,
      h('button', { class: 'chip-add', onClick: onAdd }, '+'),
    )
  }
  const CompA = () => () => h('span', { class: 'a' }, 'A组件')
  const CompB = () => () => h('span', { class: 'b' }, 'B组件')

  // ── 页面：7 个转化槽 + 控制按钮 ──
  const Page = (_init: Record<string, unknown>, ctx: Ctx) => {
    let show = false      // ① 空洞 ↔ 元素
    let comp = false      // ② 空洞 ↔ 组件
    let swap = false      // ③ 组件 A ↔ B
    let arr = false       // ④ 单节点 ↔ 数组
    let txt = false       // ⑤ 文本 ↔ 空洞
    let ids = [1, 2]      // ⑥ keyed 列表
    let open = false      // ⑦ Portal 开/关
    return () => h('div', { class: 'page' },
      // ① 条件元素（false → 空洞占位）
      show ? h('span', { class: 'cond' }, '条件元素') : null,
      // ② 条件组件（false → 空洞占位）
      comp ? h(Chip, { label: 'C1' }) : null,
      // ③ 组件类型切换（swap=false → CompB）
      swap ? h(CompA, {}) : h(CompB, {}),
      // ④ 单节点 ↔ 数组（arr=false → 单节点）
      arr
        ? [h('span', { class: 'a2' }, '乙'), h('span', { class: 'a3' }, '丙')]
        : h('span', { class: 'a1' }, '甲'),
      // ⑤ 文本 ↔ 空洞
      txt ? '内联文本' : null,
      // ⑥ keyed 列表（业务 key——身份复用）
      h('ul', { class: 'list' }, ids.map((i) => h('li', { key: i }, `项${i}`))),
      // ⑦ Portal（浮层——主树插槽锚 + 内容进 #__wf_portal）
      open ? createPortal(h('div', { class: 'menu' }, '浮层内容'), 'dd') : null,
      // 控制按钮（事件代理——不直接 addEventListener）
      h('button', { id: 't-cond', onClick: () => { show = !show; void ctx.render() } }, '条件'),
      h('button', { id: 't-comp', onClick: () => { comp = !comp; void ctx.render() } }, '组件'),
      h('button', { id: 't-swap', onClick: () => { swap = !swap; void ctx.render() } }, '切换'),
      h('button', { id: 't-arr', onClick: () => { arr = !arr; void ctx.render() } }, '数组'),
      h('button', { id: 't-txt', onClick: () => { txt = !txt; void ctx.render() } }, '文本'),
      h('button', { id: 't-add', onClick: () => { ids = [...ids, ids.length + 1]; void ctx.render() } }, '加项'),
      h('button', { id: 't-portal', onClick: () => { open = !open; void ctx.render() } }, '浮层'),
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Page, {})))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready

  const page = document.querySelector('.page') as HTMLElement
  const list = () => document.querySelector('.list') as HTMLElement
  const btn = (id: string) => document.querySelector(`#${id}`) as HTMLElement

  // ═══════════════════ ① 首帧：节点 → DOM 映射 ═══════════════════
  // 元素：data-wf-id 标记（事件代理查表基础）
  const pageEl = page
  expect(pageEl.getAttribute('data-wf-id'), '元素 → 标签 + data-wf-id（事件代理查表）').toBe('root.0')
  // 空洞 ×4（①show=false / ②comp=false / ⑤txt=false / ⑦portal=false）：
  // 注释占位——同构（portal 关闭槽 = null → 插槽锚）
  const holes = [...page.childNodes].filter((n) => n.nodeType === 8)
  expect(holes.length, '空洞 → 注释占位（<!--wf-hole-->——childNodes 长度恒定）').toBe(4)
  expect(holes.every((n) => (n as Comment).textContent?.startsWith('wf-hole')), '占位锚内容 wf-hole').toBeTruthy()
  // 组件：两阶段工厂输出（CompB——swap=false）
  expect(page.querySelector('.b')?.textContent, '组件 → 工厂输出（B 分支）').toBe('B组件')
  expect(page.querySelector('.a'), 'A 分支未渲染').toBe(null)
  // 单节点（arr=false）
  expect(page.querySelector('.a1')?.textContent, '单节点 → 单一元素').toBe('甲')
  // keyed 列表：业务 key——li ×2
  expect(list().querySelectorAll('li').length, 'keyed 列表 2 项').toBe(2)
  expect(list().querySelectorAll('li')[0]?.textContent).toBe('项1')
  // Portal：关闭 → 插槽锚（注释）在主树——无浮层内容
  expect(page.querySelector('.menu'), 'Portal 关闭——无浮层内容').toBe(null)
  // 同构：7 槽 + 7 按钮 = 14 个 childNodes（数组第 i 项 ⟷ 第 i 个节点）
  assertIsomorphic(page, [
    'hole', 'hole', 'element', 'element', 'hole', 'element', 'hole',
    'element', 'element', 'element', 'element', 'element', 'element', 'element',
  ], '首帧 14 项（7 槽 + 7 按钮）——逐位同构')

  // ═══════════════════ ② 转化①：空洞 ↔ 元素（条件渲染） ═══════════════════
  btn('t-cond').click()
  await waitFor(() => page.querySelector('.cond') !== null)
  expect(page.querySelector('.cond')?.textContent, '空洞 → 元素（占位锚 ↔ 真实节点互换）').toBe('条件元素')
  assertSlot(page, 0, 'element', '位置 0 = 条件元素（原空洞位置——边界位置）')
  expect(slotCount(page), '互换后长度仍 14（同构——占位法）').toBe(14)
  btn('t-cond').click()
  await waitFor(() => page.querySelector('.cond') === null)
  assertSlot(page, 0, 'hole', '元素 → 空洞（注释占位回来——长度不塌缩）')
  expect(slotCount(page), '再次互换长度仍 14').toBe(14)
  // **往返可逆**：再开一次（A→B→A→B）——位置 0 状态不漂移
  btn('t-cond').click()
  await waitFor(() => page.querySelector('.cond') !== null)
  assertSlot(page, 0, 'element', '往返后再开——位置 0 仍正确')
  btn('t-cond').click()
  await waitFor(() => page.querySelector('.cond') === null)
  assertSlot(page, 0, 'hole', '往返后再关——回到空洞（可逆）')

  // ═══════════════════ ③ 转化②：空洞 ↔ 组件（条件渲染组件） ═══════════════════
  btn('t-comp').click()
  await waitFor(() => page.querySelector('.chip') !== null)
  expect(page.querySelector('.chip')?.textContent?.includes('C1'), '空洞 → 组件（mount——两阶段工厂）').toBe(true)
  expect(slotCount(page), '组件输出单节点——长度仍 14').toBe(14)
  // 组件内部交互（mount 闭包状态——组件自身 render）
  ;(page.querySelector('.chip-add') as HTMLElement).click()
  await waitFor(() => page.querySelector('.chip')?.textContent?.includes('C1(1)'))
  expect(page.querySelector('.chip')?.textContent?.includes('C1(1)'), '组件内部状态（let + render）').toBe(true)
  btn('t-comp').click()
  await waitFor(() => page.querySelector('.chip') === null)
  expect(page.querySelector('.chip'), '组件 → 空洞（unmount——占位锚回来）').toBe(null)
  expect(unEvents, '组件卸载 → onUnmounts 执行').toEqual(['un:chip:C1'])
  expect(slotCount(page), '长度仍 14').toBe(14)

  // ═══════════════════ ④ 转化③：组件 A ↔ B（同位置异类型——卸载重建） ═══════════════════
  btn('t-swap').click()
  await waitFor(() => page.querySelector('.a') !== null)
  expect(page.querySelector('.b'), 'A 替换 B（同位置——异类型组件——rec.type 比较）').toBe(null)
  expect(page.querySelector('.a')?.textContent).toBe('A组件')
  expect(slotCount(page)).toBe(14)
  btn('t-swap').click()
  await waitFor(() => page.querySelector('.b') !== null)
  expect(page.querySelector('.a'), 'B 替换 A（往返切换——重建）').toBe(null)

  // ═══════════════════ ⑤ 转化④：单节点 ↔ 数组（transform 完整转换） ═══════════════════
  btn('t-arr').click()
  await waitFor(() => page.querySelector('.a2') !== null)
  expect(page.querySelector('.a1'), '单节点 → 数组（旧元素让位）').toBe(null)
  expect(page.querySelector('.a2')?.textContent).toBe('乙')
  expect(page.querySelector('.a3')?.textContent).toBe('丙')
  expect(slotCount(page), '数组展开——长度 15（隐式 Fragment 展开 2 项替换 1 项——位置身份）').toBe(15)
  btn('t-arr').click()
  await waitFor(() => page.querySelector('.a1') !== null)
  expect(page.querySelector('.a2'), '数组 → 单节点（旧区间递归清理——收拢）').toBe(null)
  expect(page.querySelector('.a3')).toBe(null)
  expect(slotCount(page), '收拢——回到 14（可逆）').toBe(14)

  // ═══════════════════ ⑥ 转化⑤：文本 ↔ 空洞 ═══════════════════
  btn('t-txt').click()
  await waitFor(() => page.childNodes[4]?.nodeType === 3)
  expect((page.childNodes[4] as Text).textContent, '空洞 → 文本节点（位置 4）').toBe('内联文本')
  expect(slotCount(page)).toBe(14)
  btn('t-txt').click()
  await waitFor(() => page.childNodes[4]?.nodeType === 8)
  expect(page.childNodes[4].nodeType, '文本 → 空洞（占位锚回来）').toBe(8)

  // ═══════════════════ ⑦ 转化⑥：keyed 列表增（身份复用） ═══════════════════
  const li1Before = list().querySelectorAll('li')[0]
  btn('t-add').click()
  await waitFor(() => list().querySelectorAll('li').length === 3)
  expect(list().querySelectorAll('li').length, 'keyed 增——新项 3（身份跟随 key）').toBe(3)
  assertKept(list(), 'li', li1Before, 'keyed 增——旧项 DOM 引用保持（身份复用——不重建）')
  expect(list().querySelectorAll('li')[2]?.textContent, '新项在末尾').toBe('项3')

  // ═══════════════════ ⑧ 转化⑦：Portal 开/关（插槽锚 ↔ 浮层内容） ═══════════════════
  btn('t-portal').click()
  await waitFor(() => document.querySelector('.menu') !== null)
  const menu = document.querySelector('.menu') as HTMLElement
  expect(menu.closest('#__wf_portal') !== null, 'Portal 开——内容渲染到 #__wf_portal（body）').toBe(true)
  expect(menu.textContent).toBe('浮层内容')
  expect(slotCount(page), '插槽锚保持（主树同构——浮层内容不进主树）').toBe(14)
  btn('t-portal').click()
  await waitFor(() => document.querySelector('.menu') === null)
  expect(document.querySelector('#__wf_portal-dd'), 'Portal 关——removePortal 容器移除（无残留）').toBe(null)
  expect(slotCount(page)).toBe(14)
})

/** 确定性等待（渲染链路异步完成信号） */
async function waitFor(fn: () => boolean, timeout = 500): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('waitFor timeout')
    await new Promise((r) => setTimeout(r, 5))
  }
}

test('边界位置：末尾槽转化（空洞 ↔ 元素——末尾 insert 语义）+ 三处边界矩阵', async () => {
  const router = new UIRouter()
  const Page = (_i: Record<string, unknown>, ctx: Ctx) => {
    let show = false
    return () => h('div', { class: 'page' },
      h('span', { class: 'first' }, '首'),
      h('span', { class: 'mid' }, '中'),
      // 末尾槽（位置 2——边界：insert 语义与位置 0 对称验证）
      show ? h('span', { class: 'last' }, '末') : null,
      h('button', { id: 't', onClick: () => { show = !show; void ctx.render() } }, '切换'),
    )
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Page, {})))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  const page = document.querySelector('.page') as HTMLElement
  // 边界矩阵：位置 0（mapping 主测试）/ 中间（mapping ⑤ 文本槽）/ 末尾（本测试）
  assertIsomorphic(page, ['element', 'element', 'hole', 'element'], '首帧：2 元素 + 末尾空洞 + 按钮')
  // 末尾空洞 → 元素：元素出现在位置 2（按钮之前——不是 append 到按钮后）
  ;(document.querySelector('#t') as HTMLElement).click()
  await waitFor(() => page.querySelector('.last') !== null)
  assertSlot(page, 2, 'element', '末尾空洞 → 元素（位置 2——按钮前）')
  expect(page.querySelector('.last')?.textContent).toBe('末')
  expect(page.childNodes[3].nodeName, '按钮保持位置 3（不位移）').toBe('BUTTON')
  // 往返 ×2（可逆——末尾状态不漂移）
  for (let r = 0; r < 2; r++) {
    ;(document.querySelector('#t') as HTMLElement).click()
    await waitFor(() => page.querySelector('.last') === null)
    assertSlot(page, 2, 'hole', `往返 ${r + 1} 关——回到空洞（可逆）`)
    ;(document.querySelector('#t') as HTMLElement).click()
    await waitFor(() => page.querySelector('.last') !== null)
    assertSlot(page, 2, 'element', `往返 ${r + 1} 开——位置 2（可逆）`)
  }
})
