/**
 * diff 回归：Fragment 位于兄弟节点中间时，重渲染不得串位
 *
 * 根因（AgentDetail 表单 DOM 错乱）：patchKeyedChildren 用 `parent.childNodes[i]`
 * 位置索引映射 VNode children → DOM 节点，假设 1 VNode = 1 DOM 节点。
 * 但 Fragment 渲染出多个 DOM 节点（DocumentFragment 展开），位置索引错位
 * → 字段互相嵌套/消失（表单实测：名称/描述消失、模型字段钻进系统提示词 label）。
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { mountCommand } from '../ui-dom/context.ts'
import { patchValue } from '../ui-dom/vdom2/patch.ts'
import { h, Fragment } from '../ui-dom/vnode.ts'

setupJsdom()
const browser = createClientBrowser()

function fakeCtx(){
  return { ui: { $: {}, dirty: () => {}, render: () => {}, ready: true } }
}

describe('diff: fragment + siblings 位置对齐', () => {
  it('fragment 夹在兄弟节点中间：重渲染不串位、不丢节点', async () => {
    const ctx = fakeCtx()
    const container = browser.createElement('div')

    const make = () => h('div', {},
      h('span', { id: 'a' }, 'name'),
      h(Fragment, {},
        h('b', { id: 'b1' }, 'A'),
        h('b', { id: 'b2' }, 'B'),
      ),
      h('span', { id: 'c' }, 'end'),
    )

    const prev = make()
    await mountCommand(container, prev, ctx)

    // 状态变化触发重渲染（结构不变；new 是全新 VNode，old 是上次挂载的树）
    patchValue(container, container.firstChild, prev, make(), { browser: ctx.browser, registry: (ctx as any).__registry })

    assert.equal((container.firstChild as Element).childNodes.length, 4, 'div 应保持 4 个子节点 (span/b/b/span)')
    assert.equal(container.querySelector('#a')?.textContent, 'name')
    assert.equal(container.querySelector('#b1')?.textContent, 'A')
    assert.equal(container.querySelector('#b2')?.textContent, 'B')
    assert.equal(container.querySelector('#c')?.textContent, 'end')
    const order = Array.from((container.firstChild as Element).childNodes).map(n => (n as Element).id || (n as Element).tagName)
    assert.deepEqual(order, ['a', 'b1', 'b2', 'c'], '子节点顺序不得错乱')
  })

  it('fragment 子项数量变化：重渲染后 DOM 与结构一致', async () => {
    const ctx = fakeCtx()
    const container = browser.createElement('div')

    const prev = h('div', {},
      h('span', { id: 'a' }, 'name'),
      h(Fragment, {}, h('b', { id: 'b1' }, 'A')),
      h('span', { id: 'c' }, 'end'),
    )
    await mountCommand(container, prev, ctx)

    const next = h('div', {},
      h('span', { id: 'a' }, 'name'),
      h(Fragment, {},
        h('b', { id: 'b1' }, 'A'),
        h('b', { id: 'b2' }, 'B'),
        h('b', { id: 'b3' }, 'C'),
      ),
      h('span', { id: 'c' }, 'end'),
    )
    patchValue(container, container.firstChild, prev, next, { browser: ctx.browser, registry: (ctx as any).__registry })

    assert.equal((container.firstChild as Element).childNodes.length, 5, 'div 应为 5 个子节点 (span/b/b/b/span)')
    assert.equal(container.querySelector('#a')?.textContent, 'name')
    assert.equal(container.querySelector('#c')?.textContent, 'end')
    assert.equal(container.querySelector('#b2')?.textContent, 'B')
    assert.equal(container.querySelector('#b3')?.textContent, 'C')
    const order = Array.from((container.firstChild as Element).childNodes).map(n => (n as Element).id || (n as Element).tagName)
    assert.deepEqual(order, ['a', 'b1', 'b2', 'b3', 'c'])
  })
})
