/**
 * 嵌套数组 key 冲突回归 — agent-platform /login ↔ /register 切换字段重复残留
 *
 * 根因（第一代修复）：buildVNode 数组分支在嵌套数组上按外层/内层各自从 0 计数分配默认
 * 下标 key（[[F1,F2],btn] → F2.key='1' 与 btn.key='1' 冲突）——平铺展开后 keyed diff
 * 遇重复 key 错乱 → 旧字段残留（"姓名*邮箱*密码*密码*"）。
 * 根治（第二代）：数组项 = 隐式 Fragment（规则表 §1-20）——vnode 保持用户嵌套结构，
 * key 层级独立（§3-46）+ fragment-start/end 边界标记——diff 按嵌套递归配对，不再平铺。
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { h } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/context.ts'
import { patchValue } from '../ui-dom/vdom2/patch.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'

before(setupJsdom)

/** AuthPage 式结构：children（数组）嵌套在输出 children 数组里（布局插槽 + 固定按钮） */
const Field = async (_init: any, _ctx: any) => async (props: any) =>
  h('label', { class: 'f', 'data-l': props.label }, props.label)

const AuthLike = async (_init: any, _ctx: any) => async (props: any) =>
  h('div', { class: 'auth' }, [props.children, h('button', {}, 'submit')])

// 顶层页面（模拟 Login / Register——children 数组来自 JSX props 展开）
const PageA = async (_init: any, _ctx: any) => async (_props: any) =>
  h(AuthLike, {}, h(Field, { label: 'A1' }), h(Field, { label: 'A2' }))

const PageB = async (_init: any, _ctx: any) => async (_props: any) =>
  h(AuthLike, {}, h(Field, { label: 'B1' }), h(Field, { label: 'B2' }), h(Field, { label: 'B3' }))

/** 同型但原生 label（无 Field 组件——隔离组件分支） */
const NativeLike = async (_init: any, _ctx: any) => async (props: any) =>
  h('div', { class: 'auth' }, [props.children, h('button', {}, 'submit')])

const PageC = async (_init: any, _ctx: any) => async (_props: any) =>
  h(NativeLike, {}, h('label', { class: 'f', 'data-l': 'C1' }), h('label', { class: 'f', 'data-l': 'C2' }))

const PageD = async (_init: any, _ctx: any) => async (_props: any) =>
  h(NativeLike, {}, h('label', { class: 'f', 'data-l': 'D1' }), h('label', { class: 'f', 'data-l': 'D2' }), h('label', { class: 'f', 'data-l': 'D3' }))

async function switchPage(PageA_: any, PageB_: any): Promise<string[]> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })
  const vA = h(PageA_, {})
  await handle.mount(vA)
  const { buildVNode } = await import('../ui-dom/vdom2/build.ts')
  const { createRegistry } = await import('../ui-dom/vdom2/registry.ts')
  const reg = createRegistry()
  const vB = h(PageB_, {})
  const builtB = await buildVNode(vB, ctx, vA, reg)
  const prevNode = (vA as any).el ?? (vA as any)._refNode ?? null
  patchValue(container, prevNode, vA, builtB, { browser, registry: reg })
  const got = [...container.querySelectorAll('.f')].map(e => e.dataset.l)
  handle.close?.()
  document.body.removeChild(container)
  return got
}

describe('嵌套数组 key 冲突（auth 切换复现——agent-platform 字段重复残留）', () => {
  it('嵌套 children + Field 组件：切换后无残留', async () => {
    assert.deepEqual(await switchPage(PageA, PageB), ['B1', 'B2', 'B3'])
  })
  it('嵌套 children + 原生 label：切换后无残留', async () => {
    assert.deepEqual(await switchPage(PageC, PageD), ['D1', 'D2', 'D3'])
  })
})
