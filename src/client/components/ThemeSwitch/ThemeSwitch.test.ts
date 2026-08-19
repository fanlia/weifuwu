import { describe, it, before, beforeEach } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../vdom/setup.ts'
import { ThemeSwitch, applyTheme, applyPreset, getTheme } from './ThemeSwitch.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx as officialCreateTestCtx } from '../../vdom/testing.ts'

before(setupJsdom)

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-preset')
})

/** Call component and get VNode (two-phase compat) */


function createTestCtx(overrides?: Record<string, unknown>): UIContext {
  // 官方测试 ctx（vdom/testing——render/ui hooks mock——组件消费面）
  return officialCreateTestCtx(overrides as never)
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

describe('ThemeSwitch 预设主题', () => {
  it('不传 preset 时不渲染预设行（向后兼容）', async () => {
    const vnode = await renderVNode(ThemeSwitch, {}, createTestCtx())!
    const segs = vnode.props.children as any[]
    assert.equal(segs.length, 3)
  })

  it('传 preset 渲染 4 段预设行并应用 data-preset', async () => {
    const vnode = await renderVNode(ThemeSwitch, { preset: 'compact' }, createTestCtx())!
    const children = vnode.props.children as any[]
    assert.equal(children.length, 2) // [模式行, 预设行]
    const presetSegs = children[1].props.children as any[]
    assert.equal(presetSegs.length, 4)
    assert.match(presetSegs[2].props.class, /wf-theme-seg--active/) // compact 激活
    assert.equal(document.documentElement.getAttribute('data-preset'), 'compact')
  })

  it('点击预设段切换并持久化', async () => {
    let changed: any = null
    const vnode = await renderVNode(ThemeSwitch, { onPresetChange: (p: any) => { changed = p } }, createTestCtx())!
    const children = vnode.props.children as any[]
    const presetSegs = children[1].props.children as any[]
    presetSegs[3].props.onClick() // rounded
    assert.equal(changed, 'rounded')
    assert.equal(document.documentElement.getAttribute('data-preset'), 'rounded')
    assert.equal(localStorage.getItem('wf_theme_preset'), 'rounded')
    presetSegs[0].props.onClick() // default → 移除属性
    assert.equal(changed, 'default')
    assert.equal(document.documentElement.hasAttribute('data-preset'), false)
  })

  it('mount 读取持久化预设', async () => {
    localStorage.setItem('wf_theme_preset', 'minimal')
    await renderVNode(ThemeSwitch, {}, createTestCtx())
    assert.equal(document.documentElement.getAttribute('data-preset'), 'minimal')
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

  it('applyPreset 设置/移除 data-preset', async () => {
    applyPreset('compact')
    assert.equal(document.documentElement.getAttribute('data-preset'), 'compact')
    applyPreset('default')
    assert.equal(document.documentElement.hasAttribute('data-preset'), false)
  })

  it('getTheme 读取 localStorage 偏好', async () => {
    assert.equal(getTheme(), 'auto')
    localStorage.setItem('wf_theme', 'dark')
    assert.equal(getTheme(), 'dark')
  })
})
