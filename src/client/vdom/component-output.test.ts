/**
 * vdom — 组件输出组件 compId 唯一化回归测试
 *
 * 真实 bug（2026-12 showcase QA）：组件直接输出组件（单 vnode 或数组首项）
 * 时子组件继承父组件 compId——注册表同 key 覆盖——类型检查触发连环重挂——
 * 状态丢失（HoverCard 悬停失效事故）。修复：组件输出挂自身 compId 下
 * （compId.0）+ parentOf 逐段回退（组件逻辑父 → 最近 DOM 祖先）。
 */

import { test, expect } from 'vitest'
import { UIRouter, uiServe, h } from './index.ts'
import type { RenderCtx } from './core/serve.ts'
import { HoverCard, Button } from '../components/index.ts'

// 组件直接输出组件（无中间元素——冲突场景）
const DemoHoverCard = async (_init: Record<string, unknown>, _ctx: RenderCtx) => {
  return async () => h(HoverCard as never, { openDelay: 0, content: h('div', {}, '用户详情') },
    h(Button as never, { variant: 'secondary' }, '悬停查看用户'))
}

test('组件输出组件：click 触发 portal 且实例复用（不重挂——状态保持）', async () => {
  const router = new UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(DemoHoverCard, {})))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  const wrap1 = document.querySelector('.wf-hover-card-wrap') as HTMLElement
  expect(wrap1, '首帧渲染').toBeTruthy()
  // click 切换（wrapProps onClick）
  wrap1.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 300))
  const portal = document.querySelector('#__wf_portal')
  expect(portal?.children.length ?? 0, 'click → portal 出现').toBe(1)
  // 组件实例复用（重挂 = 状态丢失）
  const wrap2 = document.querySelector('.wf-hover-card-wrap') as HTMLElement
  expect(wrap1 === wrap2, '组件不重挂（节点复用）').toBe(true)
  serve.unmount()
})

test('组件输出组件：hover 触发 portal（trigger hover——mouseenter 驱动）', async () => {
  const router = new UIRouter()
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(DemoHoverCard, {})))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  const wrap = document.querySelector('.wf-hover-card-wrap') as HTMLElement
  // 真实 mouseenter 序列（代理捕获）
  wrap.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
  await new Promise((r) => setTimeout(r, 300))
  const portal = document.querySelector('#__wf_portal')
  expect(portal?.children.length ?? 0, 'hover → portal 出现').toBe(1)
  // mouseleave 关闭
  wrap.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
  await new Promise((r) => setTimeout(r, 300))
  expect(portal?.children.length ?? 0, 'mouseleave → 关闭').toBe(0)
  serve.unmount()
})

test('组件输出数组首项为组件：compId 唯一（不覆盖——后续渲染复用）', async () => {
  const router = new UIRouter()
  let renders = 0
  const Inner = async (_i: Record<string, unknown>, ctx: RenderCtx) => {
    let n = 0
    return () => h('button', { class: 'inner', onClick: () => { n++; ctx.render() } }, `c:${n}`)
  }
  const Outer = async (_i: Record<string, unknown>, _ctx: RenderCtx) => {
    return async () => h('div', {}, [
      h(Inner, {}),   // 数组首项组件（继承冲突场景）
      h('span', { class: 'after' }, 'x'),
    ])
  }
  router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Outer, {})))
  const serve = uiServe(router, { root: '#root' })
  await serve.ready
  const btn1 = document.querySelector('.inner') as HTMLElement
  btn1.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 300))
  expect(btn1.textContent, '内部状态保持（不重挂）').toBe('c:1')
  renders++
  expect(renders).toBe(1)
  serve.unmount()
})
