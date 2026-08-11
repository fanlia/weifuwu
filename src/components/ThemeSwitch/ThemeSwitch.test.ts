import { describe, it, before, beforeEach } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
import { ThemeSwitch, applyTheme, getTheme } from './ThemeSwitch.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

before(setupJsdom)

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  const renders: Array<() => void> = []
  return {
    ui: {
      $: () => ({}),
      render: () => { for (const fn of renders) fn() },
      dirty: () => {},
      ready: true,
    },
  } as any
}

describe('ThemeSwitch', () => {
  it('renders segmented control with 3 modes', async () => {
    const vnode = await renderVNode(ThemeSwitch, {}, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-theme-switch/)
    const segs = vnode.props.children as any[]
    assert.equal(segs.length, 3)
    assert.equal(segs[0].props.children, '自动')
    assert.equal(segs[1].props.children, '亮色')
    assert.equal(segs[2].props.children, '暗色')
  })

  it('defaults to auto when nothing stored', async () => {
    const vnode = await renderVNode(ThemeSwitch, {}, createTestCtx())!
    const segs = vnode.props.children as any[]
    assert.match(segs[0].props.class, /wf-theme-seg--active/)
    assert.equal(document.documentElement.hasAttribute('data-theme'), false)
  })

  it('applies stored theme on mount (persisted dark)', async () => {
    localStorage.setItem('wf_theme', 'dark')
    await renderVNode(ThemeSwitch, {}, createTestCtx())
    assert.equal(document.documentElement.getAttribute('data-theme'), 'dark')
    // 重新渲染时 active 段为暗色
    const vnode = await renderVNode(ThemeSwitch, {}, createTestCtx())!
    const segs = vnode.props.children as any[]
    assert.match(segs[2].props.class, /wf-theme-seg--active/)
  })

  it('clicking a segment switches theme and persists', async () => {
    let changed: any = null
    const vnode = await renderVNode(ThemeSwitch, { onChange: (m: any) => { changed = m } }, createTestCtx())!
    const segs = vnode.props.children as any[]
    // 点击「暗色」
    segs[2].props.onClick()
    assert.equal(changed, 'dark')
    assert.equal(document.documentElement.getAttribute('data-theme'), 'dark')
    assert.equal(localStorage.getItem('wf_theme'), 'dark')
    // 点击「自动」→ 移除属性
    segs[0].props.onClick()
    assert.equal(changed, 'auto')
    assert.equal(document.documentElement.hasAttribute('data-theme'), false)
    assert.equal(localStorage.getItem('wf_theme'), 'auto')
  })

  it('clicking active segment is a no-op', async () => {
    const vnode = await renderVNode(ThemeSwitch, { mode: 'light' }, createTestCtx())!
    const segs = vnode.props.children as any[]
    segs[1].props.onClick()
    // 无变化：仍是 light，且未触发 onChange（undefined 时不应报错）
    assert.equal(document.documentElement.getAttribute('data-theme'), 'light')
  })

  it('respects custom storageKey', async () => {
    const vnode = await renderVNode(ThemeSwitch, { storageKey: 'app_theme', mode: 'dark' }, createTestCtx())!
    const segs = vnode.props.children as any[]
    // 点「亮色」触发真实切换
    segs[1].props.onClick()
    assert.equal(localStorage.getItem('app_theme'), 'light')
    assert.equal(localStorage.getItem('wf_theme'), null)
  })
})

describe('applyTheme / getTheme 工具', () => {
  it('applyTheme 设置/移除 data-theme', async () => {
    applyTheme('dark')
    assert.equal(document.documentElement.getAttribute('data-theme'), 'dark')
    applyTheme('light')
    assert.equal(document.documentElement.getAttribute('data-theme'), 'light')
    applyTheme('auto')
    assert.equal(document.documentElement.hasAttribute('data-theme'), false)
  })

  it('getTheme 读取 localStorage 偏好', async () => {
    assert.equal(getTheme(), 'auto')
    localStorage.setItem('wf_theme', 'dark')
    assert.equal(getTheme(), 'dark')
  })
})
