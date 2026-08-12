/**
 * diff 回归：条件表达式在两个 Fragment 分支之间切换（三元 cond ? FragA : FragB）
 *
 * 真实事故：AgentDetail 文件浏览器编辑视图 `{$.wsOpenFile ? (<Fragment A>) : (<Fragment B>)}`
 * ——reload 初始（B 分支）正常渲染；点击后切换到 A 分支 → 整体渲染为空（DOM 静默缺失，audit 一致）
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { mountCommand } from '../ui-dom/vdom/mount.ts'
import { patchValue } from '../ui-dom/vdom/diff.ts'
import { h, Fragment } from '../ui-dom/vnode.ts'

setupJsdom()
const browser = createClientBrowser()

function fakeCtx() {
  return { ui: { $: {}, dirty: () => {}, render: () => {}, ready: true } }
}

describe('diff: 三元条件切换 Fragment 分支', () => {
  it('cond 从 false → true 切换：Fragment A 分支渲染（不空）', async () => {
    const ctx = fakeCtx()
    const container = browser.createElement('div')

    const make = (show: boolean) => h('div', {},
      h('span', { id: 'title' }, 'header'),
      show ? h(Fragment, {},
        h('div', { id: 'edit' }, 'EDIT-A'),
        h('span', { id: 'a2' }, 'A2'),
        h('button', { id: 'a3' }, 'A3'),
      ) : h(Fragment, {}, h('div', { id: 'list' }, 'LIST-B')),
      h('span', { id: 'tail' }, 'end'),
    )

    const prev = make(false)
    await mountCommand(container, prev, ctx)
    assert.ok(container.querySelector('#list'), '初始 B 分支渲染')

    // 条件切换 true → A 分支
    patchValue(container, container.firstChild, prev, make(true), { browser: ctx.browser, registry: (ctx as any).__registry })
    assert.ok(container.querySelector('#edit'), '切换后 A 分支应渲染（edit）')
    assert.ok(container.querySelector('#tail'), '尾部节点保留')
    const text = (container.firstChild as Element).textContent ?? ''
    assert.ok(text.includes('EDIT-A'), '内容应包含 A 分支文本')
  })

  it('cond 从 true → false 切换：Fragment B 分支渲染（不空）', async () => {
    const ctx = fakeCtx()
    const container = browser.createElement('div')

    const make = (show: boolean) => h('div', {},
      show ? h(Fragment, {}, h('div', { id: 'x' }, 'AAA')) : h(Fragment, {}, h('div', { id: 'y' }, 'BBB')),
    )

    const prev = make(true)
    await mountCommand(container, prev, ctx)
    assert.ok(container.querySelector('#x'))

    patchValue(container, container.firstChild, prev, make(false), { browser: ctx.browser, registry: (ctx as any).__registry })
    assert.ok(container.querySelector('#y'), '切换后 B 分支应渲染')
    assert.ok(!container.querySelector('#x'), 'A 分支应移除')
  })

  it('Fragment 与 null 切换（三元 A : null）', async () => {
    const ctx = fakeCtx()
    const container = browser.createElement('div')

    const make = (show: boolean) => h('div', {},
      h('span', { id: 's' }, 's'),
      show ? h(Fragment, {}, h('b', { id: 'b' }, 'B')) : null,
    )

    const prev = make(true)
    await mountCommand(container, prev, ctx)
    assert.ok(container.querySelector('#b'))

    patchValue(container, container.firstChild, prev, make(false), { browser: ctx.browser, registry: (ctx as any).__registry })
    assert.ok(!container.querySelector('#b'), 'null 分支应移除')

    patchValue(container, container.firstChild, make(false), make(true), { browser: ctx.browser, registry: (ctx as any).__registry })
    assert.ok(container.querySelector('#b'), '重新显示应恢复')
  })
})
