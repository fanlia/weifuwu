/**
 * client — 数组 diff 无 key 复用（C1：portal 内部 key 不算用户 keyed）
 *
 * 背景：createPortal 的 VNode 带 key（portalKey——内部定位用）——
 * 与无 key input 混合时破坏 allUnkeyed 判定 → input 被移除重建 → 焦点丢失。
 * 修复：allUnkeyed 判定排除 remote（portal）。
 *
 * 验证：
 *   - [input(无key), portal] 混合 → allUnkeyed 按位置复用 → input 不重建
 *   - 受控 input 输入后焦点保持（MutationObserver 0 替换）
 *   - portal 开/关切换正常（patchPortal）
 */

import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import { setupJsdom } from './setup.ts'
import { h, createPortal } from '../../ui-dom/vnode.ts'

before(setupJsdom)

import { mountApp } from '../ui-dom-mount.ts'
const browser = createClientBrowser()

describe('数组 diff：portal 内部 key 不破坏 allUnkeyed（C1）', () => {
  test('[input 无key, portal] 混合：input 不重建（复用 + patch）', async () => {
    let mountRes: any
    const el = browser.createElement('div')
    browser.bodyAppend(el)
    el.id = 'c1-unkeyed'
    let open = false
    let inputEl: HTMLInputElement | null = null

    const Cmp = (_: any, ctx: any) => {
      const $ = ctx.ui.$()
      $.text = ''
      return () => h('div', { class: 'wrap' }, [
        h('input', { // 无 key（C1 前会被 portal 的 key 拖入 keyed 分支重建）
          value: $.text,
          onInput: (e: any) => { $.text = e.target.value },
        }),
        createPortal(open ? h('div', { class: 'panel' }, '面板') : null, 'c1-portal'),
      ])
    }
    mountRes = await mountApp(el, Cmp)
    const input = el.querySelector('input') as HTMLInputElement
    inputEl = input
    input.focus()
    // 输入 → 组件渲染（$ 变化）
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, 'x')
    input.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 30))
    const inputAfter = el.querySelector('input') as HTMLInputElement
    assert.equal(inputAfter, input, 'input 未被重建（同一 DOM 引用）')
    assert.equal(browser.activeElement(), input, '焦点保持')
    assert.equal(input.value, 'x', '输入值保持')
    ;(mountRes as any).close?.()
    el.remove()
  })

  test('portal 开/关切换正常（allUnkeyed 分支 patchPortal）', async () => {
    let mountRes: any
    const el = browser.createElement('div')
    browser.bodyAppend(el)
    el.id = 'c1-portal-toggle'
    let open = false
    const Cmp = (_: any, ctx: any) => {
      const $ = ctx.ui.$()
      $.open = false
      return () => h('div', { class: 'wrap2' }, [
        h('button', { onClick: () => { $.open = !$.open } }, 'toggle'),
        createPortal($.open ? h('div', { class: 'p2' }, '开') : null, 'c1-toggle'),
      ])
    }
    mountRes = await mountApp(el, Cmp)
    // 初始关闭——portal 不渲染
    assert.equal(browser.query('#__wf_portal .p2'), null, '初始 portal 关闭')
    // 打开
    el.querySelector('button')!.dispatchEvent(new (window as any).Event('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 30))
    assert.ok(browser.query('#__wf_portal .p2'), 'portal 打开渲染')
    // 关闭
    el.querySelector('button')!.dispatchEvent(new (window as any).Event('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 30))
    assert.equal(browser.query('#__wf_portal .p2'), null, 'portal 关闭移除')
    ;(mountRes as any).close?.()
    el.remove()
  })
})
