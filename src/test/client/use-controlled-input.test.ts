/**
 * client — C3 useControlledInput + C4 useOpen 原语测试
 *
 * C3：受控输入 + 内部输入态/选中态（keyword/selectedLabel）
 * C4：显隐打开状态机（onClick 只开——focus 开 + click 关冲突教训）
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import { setupJsdom } from './setup.ts'
import { h } from '../../ui-dom/vnode.ts'

before(setupJsdom)

import { mountApp } from '../ui-dom-mount.ts'
const browser = createClientBrowser()

describe('C3 useControlledInput', () => {
  it('受控：value 由 props 驱动，setValue 走 onChange', async () => {
    let mountRes: any
    const el = browser.createElement('div')
    el.id = 'c3-controlled'
    browser.bodyAppend(el)
    let changed: string | undefined
    let ctrl: any
    const Cmp = (_: any, ctx: any) => {
      ctrl = ctx.ui.useControlledInput({ value: 'a', onChange: (v: string) => { changed = v }, name: 'C3' })
      return () => h('input', { value: ctrl.value })
    }
    mountRes = await mountApp(el, Cmp)
    assert.equal(ctrl.value, 'a', '受控 value')
    assert.equal(ctrl.controlled, true)
    ctrl.setValue('b')
    assert.equal(changed, 'b', '受控 setValue 走 onChange')
    ;(mountRes as any).close?.()
    el.remove()
  })

  it('非受控：内部 value + keyword/selectedLabel 独立状态', async () => {
    let mountRes: any
    const el = browser.createElement('div')
    el.id = 'c3-uncontrolled'
    browser.bodyAppend(el)
    let ctrl: any
    const Cmp = (_: any, ctx: any) => {
      ctrl = ctx.ui.useControlledInput({ name: 'C3U' })
      return () => h('input', { value: ctrl.value ?? '' })
    }
    mountRes = await mountApp(el, Cmp)
    assert.equal(ctrl.controlled, false)
    // 输入态
    ctrl.setKeyword('支付')
    assert.equal(ctrl.keyword, '支付', 'keyword 内部态')
    // 选中回填
    ctrl.setSelectedLabel('支付平台管理')
    assert.equal(ctrl.selectedLabel, '支付平台管理', 'selectedLabel 内部态')
    ;(mountRes as any).close?.()
    el.remove()
  })
})

describe('C4 useOpen', () => {
  it('onClick 只开（不 toggle——focus 开+click 关冲突教训）', async () => {
    let mountRes: any
    const el = browser.createElement('div')
    el.id = 'c4-open'
    browser.bodyAppend(el)
    let handle: any
    const Cmp = (_: any, ctx: any) => {
      handle = ctx.ui.useOpen({})
      return () => h('button', { ...handle.triggerProps }, 't')
    }
    mountRes = await mountApp(el, Cmp)
    assert.equal(handle.open, false)
    handle.triggerProps.onClick()
    assert.equal(handle.open, true, '点击打开')
    handle.triggerProps.onClick()
    assert.equal(handle.open, true, '再次点击保持打开（只开不关——关闭交外部）')
    ;(mountRes as any).close?.()
    el.remove()
  })

  it('openOnFocus：focus 打开；受控 open/onOpenChange', async () => {
    let mountRes: any
    const el = browser.createElement('div')
    el.id = 'c4-focus'
    browser.bodyAppend(el)
    let changed = 0
    let handle: any
    const Cmp = (_: any, ctx: any) => {
      handle = ctx.ui.useOpen({ open: false, onOpenChange: () => { changed++ }, openOnFocus: true })
      return () => h('button', { ...handle.triggerProps }, 't')
    }
    mountRes = await mountApp(el, Cmp)
    handle.triggerProps.onFocus()
    assert.equal(changed, 1, '受控 focus 打开走 onOpenChange')
    assert.equal(handle.open, false, '受控 open 由 props 决定')
    ;(mountRes as any).close?.()
    el.remove()
  })
})
