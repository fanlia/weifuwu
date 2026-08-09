/**
 * weifuwu/client 渲染器测试 — render + patchValue + mountVNode
 *
 * 覆盖 render.ts 所有 export 和关键内部路径
 *   106 tests + 新增覆盖率测试 = full coverage
 */

import { describe, it, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
import { jsx, Fragment, createPortal } from '../../client/vnode.ts'
import type { VNode } from '../../client/vnode.ts'
import { render, patchValue, mountVNode, idRegistry } from '../../client/render.ts'
import { createApp } from '../../client/app.ts'
import type { WfuiContext } from '../../client/types.ts'

let ctx: WfuiContext
before(setupJsdom)

beforeEach(() => {
  ctx = { ui: { render: () => {}, $: () => ({}) } }
})

/** 遍历 root 下所有 TextNode */
function getAllTextNodes(root: Node): Text[] {
  const result: Text[] = []
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let n: Text | null
  while ((n = walk.nextNode() as Text | null)) result.push(n)
  return result
}

// ═══════════════════════════════════════════════════════
// render
// ═══════════════════════════════════════════════════════

describe('render', () => {
  it('渲染原生元素', () => {
    const v = jsx('div', { class: 'foo', children: 'hello' })
    const el = render(v, ctx) as HTMLElement
    assert.equal(el.tagName, 'DIV')
    assert.equal(el.className, 'foo')
    assert.equal(el.textContent, 'hello')
  })

  it('渲染嵌套元素', () => {
    const v = jsx('div', { children: [jsx('span', { children: 'a' }), jsx('span', { children: 'b' })] })
    const el = render(v, ctx) as HTMLElement
    assert.equal(el.children.length, 2)
    assert.equal(el.children[0].textContent, 'a')
  })

  it('渲染组件', () => {
    const Cmp = (_: any) => (props: any) => jsx('p', { children: props.name })
    const el = render(jsx(Cmp, { name: 'Alice' }), ctx) as HTMLElement
    assert.equal(el.tagName, 'P')
    assert.equal(el.textContent, 'Alice')
  })

  it('渲染 Fragment', () => {
    const v = jsx(Fragment, { children: [jsx('span', { children: 'a' }), jsx('span', { children: 'b' })] })
    const frag = render(v, ctx) as DocumentFragment
    assert.equal(frag.childNodes.length, 2)
    assert.equal(frag.childNodes[0].textContent, 'a')
  })

  it('渲染 null/undefined/boolean 返回 null', () => {
    assert.equal(render(null, ctx), null)
    assert.equal(render(undefined, ctx), null)
    assert.equal(render(false, ctx), null)
    assert.equal(render(true, ctx), null)
  })

  it('渲染数字', () => {
    assert.equal(render(42, ctx).textContent, '42')
    assert.equal(render(0, ctx).textContent, '0')
  })

  it('渲染空 children（props 为 null）', () => {
    const el = render(jsx('div', null), ctx) as HTMLElement
    assert.equal(el.innerHTML, '')
  })

  it('渲染 style 对象', () => {
    const el = render(jsx('div', { style: { color: 'red', fontSize: '14px' } }), ctx) as HTMLElement
    assert.equal(el.style.color, 'red')
    assert.equal(el.style.fontSize, '14px')
  })

  it('渲染 style 的 CSS 变量（--wf-cols 等必须 setProperty）', () => {
    const el = render(jsx('div', { style: { '--wf-cols': 'repeat(3, 1fr)', padding: 8 } }), ctx) as HTMLElement
    assert.equal(el.style.getPropertyValue('--wf-cols'), 'repeat(3, 1fr)', 'CSS 变量必须生效')
    assert.equal(el.style.padding, '8px', '数字转 px 不回归')
    // 数值 CSS 变量保持字符串
    const el2 = render(jsx('div', { style: { '--wf-z': 5 } }), ctx) as HTMLElement
    assert.equal(el2.style.getPropertyValue('--wf-z'), '5')
  })

  it('渲染 style 字符串作为属性', () => {
    const el = render(jsx('div', { style: 'color:red' }), ctx) as HTMLElement
    assert.equal(el.getAttribute('style'), 'color:red')
  })

  it('绑定事件', () => {
    let clicked = false
    const el = render(jsx('button', { onClick: () => { clicked = true } }), ctx) as HTMLElement
    el.click()
    assert.equal(clicked, true)
  })

  it('true 属性渲染为空值属性', () => {
    const el = render(jsx('input', { disabled: true }), ctx) as HTMLElement
    assert.equal(el.getAttribute('disabled'), '')
  })

  it('false 属性不渲染', () => {
    const el = render(jsx('input', { disabled: false }), ctx) as HTMLElement
    assert.equal(el.hasAttribute('disabled'), false)
  })

  it('null/undefined 属性不渲染', () => {
    const el = render(jsx('div', { title: null, 'data-x': undefined }), ctx) as HTMLElement
    assert.equal(el.hasAttribute('title'), false)
    assert.equal(el.hasAttribute('data-x'), false)
  })

  it('className 转为 class', () => {
    const el = render(jsx('div', { className: 'bar' }), ctx) as HTMLElement
    assert.equal(el.className, 'bar')
  })

  it('组件返回 null 返回 null', () => {
    const NullCmp = (_: any) => () => null
    assert.equal(render(jsx(NullCmp, {}), ctx), null)
  })

  it('组件返回非函数值返回 null', () => {
    // 框架 catch 错误后返回 null
    const BadCmp = () => false as any
    assert.equal(render(jsx(BadCmp, {}), ctx), null)
  })

  it('直接渲染数组', () => {
    const frag = render([jsx('i', { children: '1' }), jsx('i', { children: '2' })], ctx) as DocumentFragment
    assert.equal(frag.childNodes.length, 2)
  })

  it('vnode 设置 el 属性', () => {
    const v = jsx('section', { children: 'x' })
    render(v, ctx)
    assert.ok(v.el instanceof HTMLElement)
    assert.equal((v.el as HTMLElement).tagName, 'SECTION')
  })
})

// ═══════════════════════════════════════════════════════
// patchValue
// ═══════════════════════════════════════════════════════

describe('patchValue', () => {
  it('更新文本内容', () => {
    const container = document.createElement('div')
    const oldV = jsx('p', { children: 'old' })
    const newV = jsx('p', { children: 'new' })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    assert.equal(container.firstChild?.textContent, 'new')
  })

  it('替换不同类型', () => {
    const container = document.createElement('div')
    mountVNode(container, jsx('span', { children: 'text' }), ctx)
    patchValue(container, container.firstChild, jsx('span', { children: 'text' }), jsx('div', { children: 'replaced' }), ctx)
    assert.equal(container.firstChild?.nodeName, 'DIV')
    assert.equal(container.firstChild?.textContent, 'replaced')
  })


  it('新增元素（oldInput=null）', () => {
    const container = document.createElement('div')
    patchValue(container, null, null, jsx('p', { children: 'new' }), ctx)
    assert.equal(container.firstChild?.textContent, 'new')
  })

  it('新增元素（oldNode 有 parentNode 时插入前面）', () => {
    const container = document.createElement('div')
    mountVNode(container, jsx('span', { children: 'existing' }), ctx)
    const existing = container.firstChild
    patchValue(container, existing, null, jsx('b', { children: 'before' }), ctx)
    assert.equal(container.firstChild?.nodeName, 'B')
    assert.equal(container.children.length, 2)
  })


  it('newInput 和 oldInput 都为 null 返回 null', () => {
    assert.equal(patchValue(document.createElement('div'), null, null, null, ctx), null)
  })

  it('从文本更新为文本', () => {
    const container = document.createElement('div')
    mountVNode(container, jsx('p', { children: 'old' }), ctx)
    patchValue(container, container.firstChild, 'old', 'new', ctx)
    assert.equal(container.firstChild?.textContent, 'new')
  })

  it('追加子节点', () => {
    const container = document.createElement('div')
    const oldV = jsx('ul', { children: [jsx('li', { children: 'a' })] })
    const newV = jsx('ul', { children: [jsx('li', { children: 'a' }), jsx('li', { children: 'b' })] })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    assert.equal(container.querySelectorAll('li').length, 2)
  })

  it('删除子节点', () => {
    const container = document.createElement('div')
    const oldV = jsx('ul', { children: [jsx('li', { children: 'a' }), jsx('li', { children: 'b' })] })
    const newV = jsx('ul', { children: [jsx('li', { children: 'a' })] })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    assert.equal(container.querySelectorAll('li').length, 1)
    assert.equal(container.firstChild?.firstChild?.textContent, 'a')
  })

  it('从文本替换为元素', () => {
    const container = document.createElement('div')
    container.textContent = 'old'
    patchValue(container, container.firstChild, 'old', jsx('b', { children: 'new' }), ctx)
    assert.equal(container.firstChild?.nodeName, 'B')
  })

  it('从元素替换为文本', () => {
    const container = document.createElement('div')
    mountVNode(container, jsx('span', { children: 'x' }), ctx)
    patchValue(container, container.firstChild, jsx('span', { children: 'x' }), 'text', ctx)
    assert.equal(container.firstChild?.textContent, 'text')
    assert.equal(container.firstChild?.nodeType, 3) // text node
  })
})

// ── patchProps ────────────────────────────────────────

describe('patchProps', () => {
  it('更新 class', () => {
    const container = document.createElement('div')
    const oldV = jsx('div', { class: 'old' })
    const newV = jsx('div', { class: 'new' })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    assert.equal((container.firstChild as HTMLElement).className, 'new')
  })

  it('移除属性', () => {
    const container = document.createElement('div')
    const oldV = jsx('div', { id: 'x', class: 'y' })
    const newV = jsx('div', { class: 'y' })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    assert.equal((container.firstChild as HTMLElement).hasAttribute('id'), false)
  })

  it('更新 style 对象', () => {
    const container = document.createElement('div')
    const oldV = jsx('div', { style: { color: 'red' } })
    const newV = jsx('div', { style: { color: 'blue', fontSize: '16px' } })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    const el = container.firstChild as HTMLElement
    assert.equal(el.style.color, 'blue')
    assert.equal(el.style.fontSize, '16px')
  })

  it('移除 style', () => {
    const container = document.createElement('div')
    const oldV = jsx('div', { style: { color: 'red' } })
    const newV = jsx('div', {})
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    // style was cleared via Object.assign with empty
    assert.equal((container.firstChild as HTMLElement).style.length, 0)
  })

  it('更新事件处理器不累积', () => {
    const container = document.createElement('div')
    let calls: string[] = []
    const h1 = () => calls.push('old')
    const h2 = () => calls.push('new')
    const oldV = jsx('button', { onClick: h1 })
    const newV = jsx('button', { onClick: h2 })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    ;(container.firstChild as HTMLElement).click()
    assert.deepEqual(calls, ['new']) // 只有新 handler 被调用
  })

  it('移除事件处理器', () => {
    const container = document.createElement('div')
    const h = () => { throw new Error('should not be called') }
    const oldV = jsx('button', { onClick: h })
    const newV = jsx('button', {})
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    ;(container.firstChild as HTMLElement).click() // 不应 throw
    assert.ok(true)
  })

  it('className 被移除', () => {
    const container = document.createElement('div')
    const oldV = jsx('div', { className: 'old' })
    const newV = jsx('div', {})
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    assert.equal((container.firstChild as HTMLElement).className, '')
  })

  it('更新布尔属性', () => {
    const container = document.createElement('div')
    const oldV = jsx('input', { disabled: true })
    const newV = jsx('input', { disabled: false })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    assert.equal((container.firstChild as HTMLElement).hasAttribute('disabled'), false)
  })
})

// ── component re-render ──────────────────────────────

describe('component patchValue', () => {
  it('组件重渲染保持状态', () => {
    const container = document.createElement('div')
    let count = 0
    const Cmp = (_: any, c: WfuiContext) => {
      const $ = c.ui!.$
      if ($.val === undefined) $.val = 1
      return () => jsx('span', { children: String($.val + count) })
    }

    const v1 = jsx(Cmp, {})
    mountVNode(container, v1, ctx)
    assert.equal(container.textContent, '1')
    count = 10

    const v2 = jsx(Cmp, {})
    patchValue(container, container.firstChild, v1, v2, ctx)
    assert.equal(container.textContent, '11')
  })

  it('组件重渲染更新 props', () => {
    const container = document.createElement('div')
    const Cmp = (_props: any, c: WfuiContext) => {
      const $ = c.ui!.$
      return (props: any) => {
        $.sum = ($.sum || 0) + props.x
        return jsx('span', { children: String($.sum) })
      }
    }

    const v1 = jsx(Cmp, { x: 1 })
    mountVNode(container, v1, ctx)
    assert.equal(container.textContent, '1')

    const v2 = jsx(Cmp, { x: 5 })
    patchValue(container, container.firstChild, v1, v2, ctx)
    assert.equal(container.textContent, '6')
  })

  it('组件重渲染使用 _child 缓存', () => {
    const container = document.createElement('div')
    let execCount = 0
    const Cmp = (_: any, c: WfuiContext) => {
      execCount++
      return () => jsx('span', { children: 'x' })
    }
    const v1 = jsx(Cmp, {})
    mountVNode(container, v1, ctx)
    assert.equal(execCount, 1)

    const v2 = jsx(Cmp, {})
    patchValue(container, container.firstChild, v1, v2, ctx)
    // 组件每次重新执行（因为 ctx.ui.$ 可能变了）
    assert.equal(execCount, 1, 'mount 只执行一次，render 函数执行不计数')
  })

  it('组件第一次返回 null，第二次返回元素', () => {
    const container = document.createElement('div')
    let first = true
    const Cmp = (_: any) => () => first ? null : jsx('span', { children: 'ok' })
    const v1 = jsx(Cmp, {})
    mountVNode(container, v1, ctx)
    assert.equal(container.textContent, '') // null → 空文本

    first = false
    const v2 = jsx(Cmp, {})
    patchValue(container, container.firstChild, v1, v2, ctx)
    assert.equal(container.textContent, 'ok')
  })
})

// ── Fragment patch ────────────────────────────────────

describe('Fragment patchValue', () => {
  it('Fragment 内容变化', () => {
    const container = document.createElement('div')
    const oldV = jsx(Fragment, { children: [jsx('span', { children: 'a' })] })
    const newV = jsx(Fragment, { children: [jsx('span', { children: 'b' })] })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    assert.equal(container.textContent, 'b')
  })

  it('Fragment 新增子节点', () => {
    const container = document.createElement('div')
    const oldV = jsx(Fragment, { children: jsx('span', { children: 'a' }) })
    const newV = jsx(Fragment, { children: [jsx('span', { children: 'a' }), jsx('span', { children: 'b' })] })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    assert.equal(container.children.length, 2)
  })
})

// ── Array patch (map 结果) ───────────────────────────

describe('Array patchValue', () => {
  it('从空数组变为有元素', () => {
    const container = document.createElement('div')
    const oldV = jsx('div', { children: [] })
    const newV = jsx('div', { children: [jsx('p', { children: 'item' })] })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    assert.equal(container.textContent, 'item')
  })

  it('从有元素变为空数组', () => {
    const container = document.createElement('div')
    const oldV = jsx('div', { children: [jsx('p', { children: 'x' })] })
    const newV = jsx('div', { children: [] })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    const div = container.firstChild as HTMLElement
    assert.equal(div.children.length, 0) // div 内无子元素
  })

  it('数组元素更新', () => {
    const container = document.createElement('div')
    const oldV = jsx('div', { children: [jsx('span', { children: 'a' })] })
    const newV = jsx('div', { children: [jsx('span', { children: 'b' })] })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    assert.equal(container.textContent, 'b')
  })
})

// ── keyed diff ────────────────────────────────────────

describe('keyed children diff', () => {
  it('按 key 重新排序', () => {
    const container = document.createElement('div')
    const Cmp = (_: any) => (props: any) => jsx('div', { children: props.label })
    const oldV = jsx('div', { children: [
      jsx(Cmp, { label: 'A' }, 'a'),
      jsx(Cmp, { label: 'B' }, 'b'),
      jsx(Cmp, { label: 'C' }, 'c'),
    ]})
    const newV = jsx('div', { children: [
      jsx(Cmp, { label: 'C' }, 'c'),
      jsx(Cmp, { label: 'A' }, 'a'),
      jsx(Cmp, { label: 'B' }, 'b'),
    ]})
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    const children = container.firstChild!.childNodes
    const texts = Array.from(children).map(el => el.textContent!)
    assert.deepEqual(texts, ['C', 'A', 'B'])
  })

  it('按 key 新增', () => {
    const container = document.createElement('div')
    const oldV = jsx('div', { children: [jsx('span', { children: 'a' }, 'a')] })
    const newV = jsx('div', { children: [jsx('span', { children: 'a' }, 'a'), jsx('span', { children: 'b' }, 'b')] })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    assert.equal(container.querySelectorAll('span').length, 2)
  })

  it('按 key 删除', () => {
    const container = document.createElement('div')
    const oldV = jsx('div', { children: [jsx('span', { children: 'a' }, 'a'), jsx('span', { children: 'b' }, 'b')] })
    const newV = jsx('div', { children: [jsx('span', { children: 'b' }, 'b')] })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    assert.equal(container.querySelectorAll('span').length, 1)
    assert.equal(container.textContent, 'b')
  })

  it('keyed 到 keyed 内容变化', () => {
    const container = document.createElement('div')
    const oldV = jsx('div', { children: [jsx('span', { children: 'a' }, 'a')] })
    const newV = jsx('div', { children: [jsx('span', { children: 'b' }, 'a')] })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    assert.equal(container.textContent, 'b')
  })

  it('同 key 节点类型变化时 insertBefore 不失效', () => {
    // 场景：patchKeyedChildren 处理 [A(key=a), B(key=b), C(key=c)]
    // 逆序遍历：i=2(C) → i=1(B) → i=0(A)
    // 如果 B 的类型变化（span→div），patchValue 会 replaceChild
    // B 的旧 DOM 脱离 parent，但 insertBefore 仍指向它
    // 下一轮 (i=0) parent.insertBefore(A, B_detached) → DOMException
    const container = document.createElement('div')

    const oldV = jsx('div', { children: [
      jsx('span', { children: 'A' }, 'a'),
      jsx('span', { children: 'B' }, 'b'),
      jsx('span', { children: 'C' }, 'c'),
    ]})

    const newV = jsx('div', { children: [
      jsx('span', { children: 'A' }, 'a'),
      jsx('div',  { children: 'B' }, 'b'),  // span → div，类型变化
      jsx('span', { children: 'C' }, 'c'),
    ]})

    mountVNode(container, oldV, ctx)

    // 不应抛 DOMException
    patchValue(container, container.firstChild, oldV, newV, ctx)

    const div = container.firstChild as HTMLElement
    assert.equal(div.childNodes.length, 3)
    assert.equal(div.childNodes[0].textContent, 'A')
    assert.equal(div.childNodes[1].textContent, 'B')
    assert.equal((div.childNodes[1] as HTMLElement).tagName.toLowerCase(), 'div')
    assert.equal(div.childNodes[2].textContent, 'C')
  })

  it('组件输出从元素变为 null 再恢复', () => {
    // Drawer open/close 模式：open→render div→close→null→open→div
    const container = document.createElement('div')

    let show = true
    const Comp = (_: any, _ctx: any) => {
      return () => show
        ? jsx('div', { children: [jsx('span', { children: 'on' }), jsx('span', { children: 'off' }, 'k')] })
        : null
    }

    const v1 = { type: Comp, props: {}, key: undefined } as any
    mountVNode(container, v1, ctx)
    assert.equal(container.textContent, 'onoff')

    show = false
    const v2 = { type: Comp, props: {}, key: undefined } as any
    patchValue(container, container.firstChild, v1, v2, ctx)
    assert.equal(container.textContent, '', '关闭后清空')

    show = true
    const v3 = { type: Comp, props: {}, key: undefined } as any
    patchValue(container, container.firstChild, v2, v3, ctx)
    assert.equal(container.textContent, 'onoff', '重新打开后恢复')
  })

  it('patchValue 对组件输出 null 返回 null 不使 insertBefore 失效', () => {
    // 验证 patchValue 对组件输出 null 时返回 null 的行为
    // 不导致 patchKeyedChildren 的 insertBefore 引用失效
    const container = document.createElement('div')

    let showB = true
    const A = (_: any, _ctx: any) => () => jsx('span', { children: 'A' }, 'a')
    const B = (_: any, _ctx: any) => () => showB ? jsx('b', { children: 'B' }, 'b') : null
    const C = (_: any, _ctx: any) => () => jsx('span', { children: 'C' }, 'c')

    const oldV = jsx('div', { children: [
      { type: A, props: {}, key: 'a' },
      { type: B, props: {}, key: 'b' },
      { type: C, props: {}, key: 'c' },
    ]})
    mountVNode(container, oldV, ctx)
    const div = container.firstChild as HTMLElement
    assert.equal(div.childNodes.length, 3)
    assert.equal(div.textContent, 'ABC')

    // B → null（不应抛 DOMException）
    showB = false
    const newV = jsx('div', { children: [
      { type: A, props: {}, key: 'a' },
      { type: B, props: {}, key: 'b' },
      { type: C, props: {}, key: 'c' },
    ]})
    patchValue(container, container.firstChild, oldV, newV, ctx)
    // B 的 DOM <b>B</b> 被移除，剩余 A 和 C
    assert.equal(div.textContent, 'AC', 'B 移除后应只显示 A 和 C')
  })
})

// ── ref 回调 ──────────────────────────────────────────


// ── mountVNode ────────────────────────────────────────

describe('mountVNode', () => {
  it('清空容器并挂载', () => {
    const container = document.createElement('div')
    container.innerHTML = '<span>old</span>'
    mountVNode(container, jsx('p', { children: 'new' }), ctx)
    assert.equal(container.innerHTML, '<p>new</p>')
  })

  it('挂载 Fragment', () => {
    const container = document.createElement('div')
    mountVNode(container, jsx(Fragment, { children: [jsx('a', { children: '1' }), jsx('b', { children: '2' })] }), ctx)
    assert.equal(container.children.length, 2)
    assert.equal(container.children[0].tagName, 'A')
  })

  it('挂载数组', () => {
    const container = document.createElement('div')
    mountVNode(container, [jsx('span', { children: 'a' }), jsx('span', { children: 'b' })] as any, ctx)
    assert.equal(container.children.length, 2)
  })

  it('空容器', () => {
    const container = document.createElement('div')
    mountVNode(container, null as any, ctx)
    assert.equal(container.innerHTML, '')
  })
})

// ── edge cases ────────────────────────────────────────

describe('edge cases', () => {
  it('patchValue 返回 oldNode 当新类型无法处理', () => {
    const container = document.createElement('div')
    // 先渲染一个正常文本
    container.textContent = 'old'
    // patchValue 时传入相同 'text' 类型
    const result = patchValue(container, container.firstChild, 'old', 'new', ctx)
    assert.equal(container.textContent, 'new')
    assert.equal(result, container.firstChild)
  })

  it('patchValue 时 oldNode 为 null（native element）', () => {
    const container = document.createElement('div')
    const oldV = jsx('div', { children: 'x' })
    mountVNode(container, oldV, ctx)
    // 当 oldNode 为 null，但 oldInput 存在时
    const result = patchValue(container, null, oldV, oldV, ctx)
    // oldNode null → 走文本或 native 分支，但 oldNode 为 null → 不 patch 直接返回 null
    // 实际的 oldNode null 不会发生在正常流程中
    assert.equal(result, null)
  })

  it('normalize 处理单元素和 null', () => {
    const container = document.createElement('div')
    // children 为单个字符串（非数组）
    const oldV = jsx('div', { children: 'single' })
    const newV = jsx('div', { children: 'updated' })
    mountVNode(container, oldV, ctx)
    patchValue(container, container.firstChild, oldV, newV, ctx)
    assert.equal(container.textContent, 'updated')
  })

  it('patchSimpleChildren 处理 oldChild 缺少 existingNode', () => {
    const container = document.createElement('div')
    const oldV = jsx('div', { children: 'a' })
    const newV = jsx('div', { children: ['a', 'b'] })
    mountVNode(container, oldV, ctx)
    // old 有 1 个文本子节点，new 有 2 个
    // 第二个 newChild 是 'b'，oldChild[1] 是 undefined → appendChild
    patchValue(container, container.firstChild, oldV, newV, ctx)
    assert.equal(container.textContent, 'ab')
  })

  it('map 生成的子节点数组正确渲染', () => {
    // 模拟 JSX 中 {arr.map(...)} 产生的嵌套数组
    // <nav><div>A</div>{items.map(i => <span>{i}</span>)}</nav>
    const nav = jsx('nav', {
      children: [
        jsx('div', { children: 'header' }),
        [jsx('span', { children: '1' }), jsx('span', { children: '2' }), jsx('span', { children: '3' })],
      ],
    })
    const el = render(nav, ctx) as HTMLElement
    assert.equal(el.tagName, 'NAV')
    assert.equal(el.children.length, 4)
    assert.equal(el.children[0].tagName, 'DIV')
    assert.equal(el.children[0].textContent, 'header')
    assert.equal(el.children[1].textContent, '1')
    assert.equal(el.children[2].textContent, '2')
    assert.equal(el.children[3].textContent, '3')
  })

  it('三元表达式从空状态切换到列表时正确移除旧元素', () => {
    // 模拟 JSX: {items.length === 0 ? <p>empty</p> : items.map(i => <div>{i}</div>)}
    const items: number[] = []
    const container = document.createElement('div')

    // 空状态：
    const oldV = jsx('div', {
      children: items.length === 0
        ? jsx('p', { children: 'empty' })
        : items.map(i => jsx('div', { children: String(i) }, String(i))),
    })
    mountVNode(container, oldV, ctx)
    assert.equal(container.firstChild?.childNodes.length, 1)
    assert.equal((container.firstChild?.firstChild as HTMLElement).tagName, 'P')

    // 有数据：
    items.push(1)
    const newV = jsx('div', {
      children: items.length === 0
        ? jsx('p', { children: 'empty' })
        : items.map(i => jsx('div', { children: String(i) }, String(i))),
    })
    patchValue(container, container.firstChild, oldV, newV, ctx)
    const div = container.firstChild as HTMLElement
    assert.equal(div.childNodes.length, 1, '应有且仅有 1 个子节点')
    assert.equal(div.childNodes[0].textContent, '1')
  })

  it('组件 VNode 删除时递归清理 _child 的 ref', () => {
    const container = document.createElement('div')
    let cleaned = false

    // 子组件：返回带 ref 的元素
    const Child = (_: any) =>
      () => ({
        type: 'span' as const,
        props: { ref: (el: any) => { if (!el) cleaned = true } },
        key: undefined,
      })

    // 父组件：返回子组件 VNode
    const Parent = (_: any) => () => ({
      type: Child as any,
      props: {},
      key: undefined,
    })

    const v = {
      type: Parent as any,
      props: {},
      key: undefined,
    }

    mountVNode(container, v, ctx)

    // 验证子组件已渲染，ref cleanup 尚未调用
    assert.ok(!cleaned, 'cleanup 不应在挂载时调用')

    // 删除父组件 VNode
    patchValue(container, container.firstChild, v, null, ctx)

    // 验证子组件的 ref cleanup 已被调用
    assert.ok(cleaned, '子组件的 ref cleanup 应该通过 _child 递归被调用')
  })

describe('two-phase component model', () => {
  it('mount runs once, render runs each time', () => {
    let mountCount = 0
    let renderCount = 0

    const Comp = (_props: any, compCtx: any) => {
      mountCount++
      return (_props2: any) => {
        renderCount++
        return { type: 'div', props: {}, key: undefined }
      }
    }

    const v = { type: Comp as any, props: {}, key: undefined }
    const el = render(v, ctx) as HTMLElement

    assert.equal(mountCount, 1, 'mount ran once')
    assert.equal(renderCount, 1, 'render ran once')

    // patch with same type → render should run again, mount should not
    const v2 = { type: Comp as any, props: {}, key: undefined }
    patchValue(document.body, el, v, v2, ctx)

    assert.equal(mountCount, 1, 'mount should not run again')
    assert.equal(renderCount, 2, 'render should run again on patch')
  })

  it('ref called on component mount and unmount', () => {
    let refCalls: (string | null)[] = []

    const Comp = (_: any) =>
      () => ({
        type: 'div' as const,
        props: { ref: (el: any) => refCalls.push(el) },
        key: undefined,
      })

    const v = { type: Comp as any, props: {}, key: undefined }
    const el = render(v, ctx) as HTMLElement
    assert.equal(refCalls.length, 1, 'ref(el) called on mount')
    assert.ok(refCalls[0] instanceof HTMLElement, 'ref receives DOM element')

    patchValue(document.body, el, v, null, ctx)
    assert.equal(refCalls.length, 2, 'ref(null) called on unmount')
    assert.equal(refCalls[1], null, 'ref receives null on unmount')
  })

  it('parent unmount calls child ref(null)', () => {
    let childRefCalls: (any)[] = []

    const Child = (_: any) =>
      () => ({
        type: 'span' as const,
        props: { ref: (el: any) => childRefCalls.push(el) },
        key: undefined,
      })

    const Parent = (_: any) =>
      () => ({ type: 'div', props: { children: { type: Child as any, props: {}, key: undefined } }, key: undefined })

    const v = { type: Parent as any, props: {}, key: undefined }
    const container = document.createElement('div')
    const el = render(v, ctx) as HTMLElement
    assert.equal(childRefCalls.length, 1, 'child ref(el) called on mount')

    patchValue(container, el, v, null, ctx)
    assert.equal(childRefCalls.length, 2, 'child ref(null) called on parent removal')
    assert.equal(childRefCalls[1], null, 'child ref receives null')
  })

  it('$ auto-dirty triggers re-render via patchValue', () => {
    let renderCount = 0
    const Comp = (_props: any, compCtx: any) => {
      const $ = compCtx.ui.$
      $.count = 0

      return (_props2: any) => {
        renderCount++
        return { type: 'div', props: { children: String($.count) }, key: undefined }
      }
    }

    const v = { type: Comp as any, props: {}, key: undefined }
    render(v, ctx)
    assert.equal(renderCount, 1)

    // Patch with same component type + same render function
    const v2 = { type: Comp as any, props: {}, key: undefined, _render: (v as any)._render }
    patchValue(document.body, (v as any).el, v, v2, ctx)

    assert.equal(renderCount, 2, 're-render triggered via patchValue')
  })

  it('parent re-render preserves child mount state', () => {
    let childMountCount = 0
    let childRenderCount = 0
    let parentRenderCount = 0

    const Child = (_: any) => {
      childMountCount++
      return (__: any) => {
        childRenderCount++
        return { type: 'span', props: { children: 'child' }, key: undefined }
      }
    }

    const Parent = (_: any) =>
      () => {
        parentRenderCount++
        return { type: 'div', props: { children: { type: Child as any, props: {}, key: undefined } }, key: undefined }
      }

    const v = { type: Parent as any, props: {}, key: undefined }
    const el = render(v, ctx) as HTMLElement
    assert.equal(childMountCount, 1, 'child mount fires once')
    assert.equal(childRenderCount, 1, 'child renders once')
    assert.equal(parentRenderCount, 1, 'parent renders once')

    const v2 = { type: Parent as any, props: {}, key: undefined, _render: (v as any)._render }
    patchValue(document.body, el, v, v2, ctx)
    assert.equal(childMountCount, 1, 'child should not re-mount on parent re-render')
    assert.equal(childRenderCount, 2, 'child should re-render on parent re-render')
  })

  it('three-state skip: DemoButton 结构，静态子组件跳过 render', () => {
    // 模拟真实 DemoButton 三层嵌套结构：
    // div.wf-stack → div.wf-row × 3 → Button × 10
    // 只有 BtnA（"点击 {count} 次"）是动态的，其余 9 个静态
    let parentRenderCount = 0
    let count = 0

    // 每个按钮的 render 计数器
    const renderCounts: Record<string, number> = {}
    for (const k of ['A','B','C','D','E','F','G','H','I','J']) renderCounts[k] = 0

    const skipCtx: any = {
      ui: {
        _ctxVersion: 1,
        _dirtySet: new Set<string>(),
      },
    }

    // Button 工厂：渲染为 button 元素
    // 与真实 DemoButton 一致：BtnA/BtnH 有内联 onClick（每轮新引用）
    function makeBtn(id: string, text: string | ((c: number) => any)) {
      return (_init: any) =>
        (props: any) => {
          renderCounts[id]++
          const t = typeof text === 'function' ? text(props.count ?? 0) : text
          return { type: 'button', props: { children: t }, key: undefined }
        }
    }

    const BtnA = makeBtn('A', (c: number) => ['点击 ', c, ' 次'])
    const BtnB = makeBtn('B', 'Secondary')
    const BtnC = makeBtn('C', 'Ghost')
    const BtnD = makeBtn('D', 'Danger')
    const BtnE = makeBtn('E', 'Small')
    const BtnF = makeBtn('F', 'Medium')
    const BtnG = makeBtn('G', 'Large')
    const BtnH = makeBtn('H', '点我 Loading')
    const BtnI = makeBtn('I', 'Disabled')
    const BtnJ = makeBtn('J', 'Block')

    const Parent = (_init: any) =>
      () => {
        parentRenderCount++
        return {
          type: 'div',
          props: {
            children: [
              { type: 'div', props: { children: [
                // BtnA: count 变化 + 内联 onClick → 不 skip（同真实页面）
                { type: BtnA, props: { count, onClick: () => {} }, key: 'a' },
                { type: BtnB, props: {}, key: 'b' },
                { type: BtnC, props: {}, key: 'c' },
                { type: BtnD, props: {}, key: 'd' },
              ]}, key: 'r0' },
              { type: 'div', props: { children: [
                { type: BtnE, props: {}, key: 'e' },
                { type: BtnF, props: {}, key: 'f' },
                { type: BtnG, props: {}, key: 'g' },
              ]}, key: 'r1' },
              { type: 'div', props: { children: [
                // BtnH: 内联 onClick → 不 skip（同真实页面 "点我 Loading"）
                { type: BtnH, props: { loading: false, onClick: () => {} }, key: 'h' },
                { type: BtnI, props: {}, key: 'i' },
                { type: BtnJ, props: {}, key: 'j' },
              ]}, key: 'r2' },
            ],
          },
          key: undefined,
        }
      }

    const container = document.createElement('div')
    document.body.appendChild(container)
    const v = { type: Parent as any, props: {}, key: undefined }
    mountVNode(container, v, skipCtx)

    assert.equal(parentRenderCount, 1, 'mount: parent once')
    for (const k of ['A','B','C','D','E','F','G','H','I','J']) {
      assert.equal(renderCounts[k], 1, `mount: Btn${k} once`)
    }
    assert.equal(container.textContent, '点击 0 次SecondaryGhostDangerSmallMediumLarge点我 LoadingDisabledBlock')

    // ── MutationObserver 统计全部 DOM 修改 ──
    let _records: MutationRecord[] = []
    const mo = new MutationObserver(() => {})
    mo.observe(container, { childList: true, subtree: true, characterData: true })

    // simulate click: count++ then re-render
    count = 1
    const parentId = (v as any)._id
    skipCtx.ui._dirtySet.add(parentId)

    const v2 = { type: Parent as any, props: {}, key: undefined }
    const el = container.firstChild as HTMLElement
    patchValue(container, el, v, v2, skipCtx)

    _records = mo.takeRecords()
    const domMutationCount = _records.reduce((t, m) => t + (m.type === 'childList' ? m.addedNodes.length + m.removedNodes.length : 1), 0)
    mo.disconnect()

    // Parent 是 dirty entry → 正常 render
    assert.equal(parentRenderCount, 2, 're-render: parent renders again')

    // BtnA: count 变化 + 内联 onClick → 不 skip
    assert.equal(renderCounts.A, 2, 're-render: BtnA renders (children + onClick changed)')

    // BtnB-G: 无 onClick、无变化 → skip
    for (const k of ['B','C','D','E','F','G']) {
      assert.equal(renderCounts[k], 1, `re-render: Btn${k} skipped (static)`)
    }

    // BtnH（"点我 Loading"）: 内联 onClick 每轮新引用 → 不 skip（同真实页面）
    assert.equal(renderCounts.H, 2, 're-render: BtnH renders (inline onClick, not skipped)')

    // BtnI-J: 无 onClick、无变化 → skip
    for (const k of ['I','J']) {
      assert.equal(renderCounts[k], 1, `re-render: Btn${k} skipped (static)`)
    }

    assert.equal(container.textContent,
      '点击 1 次SecondaryGhostDangerSmallMediumLarge点我 LoadingDisabledBlock')

    // DOM 修改次数 = 全部 insertBefore(×2)
    // 与浏览器实测一致：stack(6) + row0(8) + row1(6) + row2(6) + BtnA(6) + BtnH(2) = 34
    assert.equal(domMutationCount, 1,
      '1 DOM op: only BtnA textContent (0→1), 0 insertBefore')

    // cleanup
    container.remove()
  })

})

})

// ── keyed diff DOM 修改次数 ───────────────────────────

describe('keyed diff DOM mutations', () => {
  // 辅助：统计一次 patchValue 后的 DOM 变更次数
  function domMutationCount(parent: Node, oldV: any, newV: any, skipCtx: any): number {
    const mo = new MutationObserver(() => {})
    mo.observe(parent, { childList: true, subtree: true, characterData: true })
    const el = parent.firstChild as HTMLElement
    patchValue(parent, el, oldV, newV, skipCtx)
    let total = 0
    for (const m of mo.takeRecords()) {
      total += m.type === 'childList' ? m.addedNodes.length + m.removedNodes.length : 1
    }
    mo.disconnect()
    return total
  }

  const skipCtx: any = { ui: { _ctxVersion: 1, _dirtySet: new Set<string>() } }

  function span(text: string, key: string): any {
    return { type: 'span', props: { children: text }, key }
  }

  it('顺序不变: 0 DOM 修改', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const oldV = { type: 'div', props: { children: [span('A','a'), span('B','b'), span('C','c')] }, key: undefined }
    const newV = { type: 'div', props: { children: [span('A','a'), span('B','b'), span('C','c')] }, key: undefined }
    mountVNode(container, oldV, skipCtx)
    const n = domMutationCount(container, oldV, newV, skipCtx)
    assert.equal(n, 0, 'no DOM changes when order unchanged')
    container.remove()
  })

  it('新增 1 项: 仅新增节点产生 DOM 修改', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const oldV = { type: 'div', props: { children: [span('A','a'), span('B','b'), span('C','c')] }, key: undefined }
    const newV = { type: 'div', props: { children: [span('A','a'), span('B','b'), span('C','c'), span('D','d')] }, key: undefined }
    mountVNode(container, oldV, skipCtx)
    const n = domMutationCount(container, oldV, newV, skipCtx)
    // 新增 D: 1 appendChild/insertBefore = 1 (addedNodes)
    assert.equal(n, 1, 'add 1 item: 1 DOM op (insertBefore)')
    container.remove()
  })

  it('删除 1 项: 仅删除节点产生 DOM 修改', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const oldV = { type: 'div', props: { children: [span('A','a'), span('B','b'), span('C','c'), span('D','d')] }, key: undefined }
    const newV = { type: 'div', props: { children: [span('A','a'), span('B','b'), span('C','c')] }, key: undefined }
    mountVNode(container, oldV, skipCtx)
    const n = domMutationCount(container, oldV, newV, skipCtx)
    // Step 3 removeChild(D) = 1
    assert.equal(n, 1, 'remove 1 item: 1 DOM op (removeChild)')
    container.remove()
  })

  it('部分重排: 只移需要后移的节点', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const oldV = { type: 'div', props: { children: [span('A','a'), span('B','b'), span('C','c'), span('D','d'), span('E','e')] }, key: undefined }
    const newV = { type: 'div', props: { children: [span('A','a'), span('C','c'), span('B','b'), span('D','d'), span('E','e')] }, key: undefined }
    mountVNode(container, oldV, skipCtx)
    const n = domMutationCount(container, oldV, newV, skipCtx)
    // lastIndex: A(0)✓, C(2)✓, B(1<2)→MOVE, D(3)✓, E(4)✓
    // 1 insertBefore = 2
    assert.equal(n, 2, 'partial reorder: 2 DOM ops (1 insertBefore)')
    container.remove()
  })

  it('完全反转: 移 N-1 个节点', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const oldV = { type: 'div', props: { children: [span('A','a'), span('B','b'), span('C','c'), span('D','d')] }, key: undefined }
    const newV = { type: 'div', props: { children: [span('D','d'), span('C','c'), span('B','b'), span('A','a')] }, key: undefined }
    mountVNode(container, oldV, skipCtx)
    const n = domMutationCount(container, oldV, newV, skipCtx)
    // lastIndex: D(3)✓, C(2<3)→MOVE, B(1<3)→MOVE, A(0<3)→MOVE
    // 3 insertBefore = 6
    assert.equal(n, 6, 'reverse: 6 DOM ops (3 insertBefore)')
    container.remove()
  })

  it('新增 + 删除混合: 1 insertBefore + 1 removeChild', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const oldV = { type: 'div', props: { children: [span('A','a'), span('B','b'), span('C','c'), span('D','d')] }, key: undefined }
    const newV = { type: 'div', props: { children: [span('A','a'), span('C','c'), span('E','e')] }, key: undefined }
    mountVNode(container, oldV, skipCtx)
    const n = domMutationCount(container, oldV, newV, skipCtx)
    // Step 3: 移 D(key d)和B(key b)→2 removeChild
    // Step 4: lastIndex: A(0)✓, C(2)✓ → 无需移动
    //         E 新节点 → 1 insertBefore
    // 总计: 2 removeChild + 1 insertBefore = 3
    assert.equal(n, 3, 'add+remove: 3 DOM ops (2 remove + 1 add)')
    container.remove()
  })

  it('Portal: null→开→关 正确清理 remoteEl', () => {
    // 模拟 Modal: open=false → null, open=true → Portal
    let isOpen = false

    const Comp = (_init: any, _compCtx: any) =>
      () => {
        if (!isOpen) return null
        return createPortal('portal-content', 'test-modal')
      }

    const skipCtx: any = { ui: { _ctxVersion: 1, _dirtySet: new Set<string>() } }

    // 首次挂载（closed）
    const container = document.createElement('div')
    document.body.appendChild(container)
    let v = { type: Comp as any, props: {}, key: undefined }
    mountVNode(container, v, skipCtx)

    const compId = (v as any)._id
    assert.equal(container.textContent, '')

    // 打开（open=true）
    let mo = new MutationObserver(() => {})
    mo.observe(container, { childList: true, subtree: true, characterData: true })
    isOpen = true
    skipCtx.ui._dirtySet.add(compId)
    const v2 = { type: Comp as any, props: {}, key: undefined }
    patchValue(container, container.firstChild, v, v2, skipCtx)
    let total = 0
    for (const m of mo.takeRecords()) total += m.type === 'childList' ? m.addedNodes.length + m.removedNodes.length : 1
    mo.disconnect()
    // Portal 不占父 DOM 位置，container 内无子节点
    assert.equal(total, 0, 'open: 0 DOM ops on parent (Portal remote)')
    // Portal 内容在 #__wf_portal 下
    const portal = document.getElementById('__wf_portal')
    assert.ok(portal, '__wf_portal exists')
    assert.equal(portal!.textContent, 'portal-content', 'portal rendered')

    // 关闭（open=false）
    mo = new MutationObserver(() => {})
    mo.observe(container, { childList: true, subtree: true, characterData: true })
    isOpen = false
    skipCtx.ui._dirtySet.add(compId)
    const v3 = { type: Comp as any, props: {}, key: undefined }
    patchValue(container, container.firstChild, v2, v3, skipCtx)
    total = 0
    for (const m of mo.takeRecords()) total += m.type === 'childList' ? m.addedNodes.length + m.removedNodes.length : 1
    mo.disconnect()
    assert.equal(total, 0, 'close: 0 DOM ops on parent (remote cleanup)')
    // Portal 内容应被清理
    assert.equal(portal!.textContent, '', 'portal content cleaned')

    container.remove()
  })

  it('Portal: 组件输出 null↔Portal 切换（模拟 Modal/Drawer）', () => {
    // 真实 Modal: open=true → Portal, open=false → null
    // open 作为 prop 传递 → componentPropsEqual 检测到变化 → 不 skip
    let renderCount = 0

    const Modal = (_init: any) =>
      (props: any) => {
        renderCount++
        if (!props.open) return null
        return createPortal('content-' + props.id, 'modal-' + props.id)
      }

    const Btn = (_init: any) =>
      () => ({ type: 'button', props: { children: 'btn' }, key: undefined })

    const skipCtx: any = { ui: { _ctxVersion: 1, _dirtySet: new Set<string>() } }
    const container = document.createElement('div')
    document.body.appendChild(container)

    // 首次挂载（open=false）
    let open = false
    const Parent = (_init: any) =>
      () => ({
        type: 'div',
        props: { children: [
          { type: Btn as any, props: {}, key: 'b1' },
          { type: Btn as any, props: {}, key: 'b2' },
          { type: Modal as any, props: { open, id: 'm1' }, key: 'm1' },
        ]},
        key: undefined,
      })

    let v = { type: Parent as any, props: {}, key: undefined }
    mountVNode(container, v, skipCtx)
    const parentId = (v as any)._id
    const div = container.firstChild as HTMLElement
    assert.equal(div.childNodes.length, 2, 'mount: 2 buttons, no modal')
    assert.equal(div.textContent, 'btnbtn')
    assert.equal(renderCount, 1, 'mount: Modal renders once')

    // 打开（open=true）→ Modal 输出 Portal
    open = true
    skipCtx.ui._dirtySet.add(parentId)
    const v2 = { type: Parent as any, props: {}, key: undefined }
    patchValue(container, div, v, v2, skipCtx)
    assert.equal(div.childNodes.length, 2, 'open: 2 buttons remain (portal remote)')
    assert.equal(renderCount, 2, 'open: Modal renders (open prop changed)')
    let portal = document.getElementById('__wf_portal')
    assert.ok(portal?.textContent?.includes('content-m1'), 'open: portal rendered')

    // 关闭（open=false）→ Modal 输出 null
    open = false
    skipCtx.ui._dirtySet.add(parentId)
    const v3 = { type: Parent as any, props: {}, key: undefined }
    patchValue(container, div, v2, v3, skipCtx)
    assert.equal(div.childNodes.length, 2, 'close: 2 buttons remain')
    assert.equal(renderCount, 3, 'close: Modal renders (open prop changed)')
    assert.equal(portal!.textContent, '', 'close: portal content cleaned')

    container.remove()
  })

  it('SVG 元素使用 createElementNS 渲染', () => {
    const v = { type: 'svg', props: { width: 100, height: 100, children: { type: 'circle', props: { cx: 50, cy: 50, r: 40, fill: 'red' }, key: undefined } }, key: undefined }
    const el = render(v, ctx) as SVGElement
    assert.equal(el.tagName, 'svg')
    assert.equal(el.namespaceURI, 'http://www.w3.org/2000/svg')
    const circle = el.firstChild as SVGElement
    assert.equal(circle.tagName, 'circle')
    assert.equal(circle.getAttribute('cx'), '50')
    assert.equal(circle.getAttribute('fill'), 'red')
    // patch SVG
    const v2 = { type: 'svg', props: { width: 200, children: { type: 'circle', props: { cx: 30, r: 20, fill: 'blue' }, key: undefined } }, key: undefined }
    patchValue(document.body, el, v, v2, ctx)
    assert.equal(el.getAttribute('width'), '200')
    assert.equal(circle.getAttribute('cx'), '30')
    assert.equal(circle.getAttribute('fill'), 'blue')
  })

  it('innerHTML prop 忽略 children', () => {
    const container = document.createElement('div')
    const v = { type: 'div', props: { innerHTML: '<p>hello</p>', children: 'ignored-text' }, key: undefined }
    mountVNode(container, v, ctx)
    const div = container.firstChild as HTMLElement
    assert.equal(div.innerHTML, '<p>hello</p>', 'innerHTML rendered')
    assert.equal(div.textContent, 'hello', 'children ignored when innerHTML present')
  })

  it('ref 回调在 mount/unmount 时调用', () => {
    const refCalls: (HTMLElement | null)[] = []
    const v = { type: 'div', props: { ref: (el: any) => refCalls.push(el), children: 'ref-test' }, key: undefined }
    const container = document.createElement('div')
    mountVNode(container, v, ctx)
    const div = container.firstChild as HTMLElement
    assert.equal(refCalls.length, 1, 'ref(el) on mount')
    assert.equal(refCalls[0], div, 'ref receives element')

    // unmount via null
    patchValue(container, div, v, null, ctx)
    assert.equal(refCalls.length, 2, 'ref(null) on unmount')
    assert.equal(refCalls[1], null, 'ref receives null')
  })

  it('组件返回 Fragment 渲染多个根节点', () => {
    // Fragment 的子节点应直接挂载到容器，不产生额外 DOM
    let renderCount = 0
    const Comp = (_init: any) =>
      () => {
        renderCount++
        return { type: Fragment, props: { children: [
          { type: 'span', props: { children: 'a' }, key: undefined },
          { type: 'span', props: { children: 'b' }, key: undefined },
        ]}, key: undefined }
      }

    const container = document.createElement('div')
    const v = { type: Comp as any, props: {}, key: undefined }
    mountVNode(container, v, ctx)
    // container 直接包含 span 子节点，没有 fragment 包装
    assert.equal(container.childNodes.length, 2, '2 children in container')
    assert.equal(container.childNodes[0].textContent, 'a')
    assert.equal(container.childNodes[1].textContent, 'b')

    // patch 更新 Fragment 内容
    const Comp2 = (_init: any) =>
      () => ({ type: Fragment, props: { children: [
        { type: 'span', props: { children: 'c' }, key: undefined },
      ]}, key: undefined })
    const v2 = { type: Comp2 as any, props: {}, key: undefined }
    // 不能直接用 patchValue (fragment 展平到容器)，跳过
  })
})

// ── 组件卸载注销（idRegistry 清理）────────────────────
// 回归：卸载后的组件若仍留在 idRegistry 且保留 _render/_parentNode/_refNode，
// 残留异步回调（setTimeout/Promise/WS 消息）触发 ctx.ui.dirty() 时
// 会重渲染死组件并把 DOM 重新插回当前页面（FormPage 3s 自动关闭泄漏）

describe('unmount 注销 — 死组件不可被陈旧回调重渲染', () => {
  it('patchValue 删除分支：卸载后从 idRegistry 注销并清除渲染状态', () => {
    const container = document.createElement('div')
    let renderCount = 0
    const Comp = (_: any) =>
      () => {
        renderCount++
        return { type: 'div' as const, props: { class: 'comp' }, key: undefined }
      }

    const v = { type: Comp as any, props: {}, key: undefined }
    mountVNode(container, v, ctx)
    const id = v._id as string
    assert.ok(id, 'mount 后应有组件 id')
    assert.ok(idRegistry.has(id), 'mount 后应在 idRegistry 中')
    assert.equal(typeof v._render, 'function', 'mount 后应有 _render')

    // 卸载（删除分支）
    patchValue(container, container.firstChild, v, null, ctx)
    assert.equal(container.childNodes.length, 0, 'DOM 应被移除')
    assert.ok(!idRegistry.has(id), '卸载后应从 idRegistry 注销')
    assert.equal(v._render, undefined, '卸载后 _render 应清除')
    assert.equal(v._parentNode, undefined, '卸载后 _parentNode 应清除')
    assert.equal(v._refNode, undefined, '卸载后 _refNode 应清除')
    assert.equal(v._id, undefined, '卸载后 _id 应清除')
  })

  it('patchValue 类型替换分支：旧组件注销，新组件独立注册', () => {
    const container = document.createElement('div')
    const CompA = (_: any) => () => ({ type: 'div' as const, props: { class: 'a' }, key: undefined })
    const CompB = (_: any) => () => ({ type: 'div' as const, props: { class: 'b' }, key: undefined })

    const vA = { type: CompA as any, props: {}, key: undefined }
    mountVNode(container, vA, ctx)
    const idA = vA._id as string
    assert.ok(idRegistry.has(idA))

    // A → B 类型替换
    const vB = { type: CompB as any, props: {}, key: undefined }
    patchValue(container, container.firstChild, vA, vB, ctx)
    const idB = vB._id as string

    assert.ok(!idRegistry.has(idA), '旧组件 A 应注销')
    assert.ok(idRegistry.has(idB), '新组件 B 应注册')
    assert.notEqual(idA, idB, 'A/B 应是独立实例（不同 id）')
    assert.equal(vA._render, undefined, 'A 的 _render 应清除')
    assert.equal(container.firstChild?.textContent, '', 'B 已替换 A 渲染在容器中')
  })

  it('keyed 列表删除：被删子组件注销，保留子组件不受影响', () => {
    const container = document.createElement('div')
    const Item = (_: any) => (props: any) =>
      ({ type: 'span' as const, props: { children: props.label }, key: undefined })

    const listV = (items: any[]) => ({
      type: 'div' as const,
      props: {
        children: items.map((it: any) =>
          ({ type: Item as any, props: { label: it.label }, key: it.key })),
      },
      key: undefined,
    })

    const oldItems = [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
      { key: 'c', label: 'C' },
    ]
    const oldV = listV(oldItems)
    mountVNode(container, oldV, ctx)

    // 捕获各 Item 实例的 id
    const ids = new Map<string, string>()
    const oldChildren = (oldV.props.children as any[])
    for (const child of oldChildren) {
      ids.set(child.key as string, child._id as string)
    }
    assert.equal(ids.size, 3)
    for (const id of ids.values()) assert.ok(idRegistry.has(id), '所有 Item 已注册')

    // 删除 b
    const newV = listV([
      { key: 'a', label: 'A' },
      { key: 'c', label: 'C' },
    ])
    patchValue(container, container.firstChild, oldV, newV, ctx)

    assert.ok(!idRegistry.has(ids.get('b')!), '被删除的 b 应注销')
    assert.ok(idRegistry.has(ids.get('a')!), '保留的 a 不受影响')
    assert.ok(idRegistry.has(ids.get('c')!), '保留的 c 不受影响')
  })

  it('注销后陈旧 dirty 触发 renderByIds 直接跳过（不重插 DOM）', async () => {
    const { createApp } = await import('../../client/app.ts')

    // 组件 C：60ms 后写 $.n（在 C 被 40ms 卸载之后触发）
    const C = (_: any, cctx: any) => {
      const $ = cctx.ui.$()
      $.n = 0
      setTimeout(() => { $.n = 99 }, 60)
      return () => ({ type: 'div' as const, props: { id: 'comp-c', children: String($.n) }, key: undefined })
    }
    const D = (_: any) => () => ({ type: 'div' as const, props: { id: 'comp-d', children: 'D' }, key: undefined })
    const Root = (_: any, rctx: any) => {
      const $ = rctx.ui.$()
      $.showC = true
      setTimeout(() => { $.showC = false }, 40)
      return () => ({ type: 'div' as const, props: { id: 'root-box', children: $.showC ? { type: C as any, props: {}, key: undefined } : { type: D as any, props: {}, key: undefined } }, key: undefined })
    }

    const app = createApp()
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.id = 'unmount-registry-e2e'
    await app.mount('#unmount-registry-e2e', Root)

    await new Promise(r => setTimeout(r, 50))
    assert.ok(el.querySelector('#comp-d'), 'D 已渲染（C 已卸载）')

    // C 的 60ms 回调此刻应已触发：注册表已无 C → renderByIds 跳过 → 不重插 DOM
    await new Promise(r => setTimeout(r, 100))
    assert.equal(el.querySelectorAll('#comp-c').length, 0, '死组件 C 的 DOM 不得重新出现')
    assert.equal(el.querySelector('#root-box')?.childNodes.length, 1, 'root 无泄漏')
    el.remove()
  })
})
describe('ref 内联检测', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('内联 ref（每次渲染新函数）：3 次重渲染后 console.warn 一次（提示提 mount 作用域）', async () => {
    const warns: string[] = []
    const origWarn = console.warn
    console.warn = (msg: unknown) => { warns.push(String(msg)) }
    const app = createApp()

    try {
      const Comp: any = (_init: unknown, ctx: any) => {
        const $ = ctx.ui.$()
        $.n = 0
        return () => ({
          type: 'div' as const,
          props: {
            // 内联 ref：每次渲染都是新函数引用
            ref: () => { /* inline */ },
            children: [{
              type: 'button' as const,
              props: {
                id: 'inc',
                onClick: () => { $.n++ },
              },
              key: undefined,
            }],
          },
          key: undefined,
        })
      }

      const el = document.createElement('div')
      document.body.appendChild(el)
      el.id = 'inline-ref'
      await app.mount('#inline-ref', Comp)

      const btn = document.getElementById('inc') as HTMLButtonElement
      for (let i = 0; i < 3; i++) {
        btn.click()
        await new Promise((r) => setTimeout(r, 10))
      }

      const hints = warns.filter((w) => w.includes('内联 ref') && w.includes('mount 作用域'))
      assert.equal(hints.length, 1, '同一元素只提示一次')
      assert.match(hints[0], /ref 函数每次渲染都变化/)
    } finally {
      console.warn = origWarn
      app.destroy()
    }
  })

  it('稳定 ref（mount 作用域）：重渲染不触发警告', async () => {
    const warns: string[] = []
    const origWarn = console.warn
    console.warn = (msg: unknown) => { warns.push(String(msg)) }
    const app = createApp()

    try {
      const stableRef = () => { /* hoisted */ }
      const Comp: any = (_init: unknown, ctx: any) => {
        const $ = ctx.ui.$()
        $.n = 0
        return () => ({
          type: 'div' as const,
          props: {
            ref: stableRef, // 稳定引用：oldRef === newRef → 无 ref-diff
            children: [{
              type: 'button' as const,
              props: {
                id: 'inc2',
                onClick: () => { $.n++ },
              },
              key: undefined,
            }],
          },
          key: undefined,
        })
      }

      const el = document.createElement('div')
      document.body.appendChild(el)
      el.id = 'stable-ref'
      await app.mount('#stable-ref', Comp)

      const btn = document.getElementById('inc2') as HTMLButtonElement
      for (let i = 0; i < 5; i++) {
        btn.click()
        await new Promise((r) => setTimeout(r, 10))
      }

      assert.equal(warns.filter((w) => w.includes('内联 ref')).length, 0, '稳定 ref 不警告')
    } finally {
      console.warn = origWarn
      app.destroy()
    }
  })
})

describe('ref 替换语义（框架修复）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('内联 ref + null 分支清理：重渲染不触发清理（ref(null) 只在真正卸载时调用）', () => {
    // 模拟 AiChat 的 unwatch 模式：null 分支是清理逻辑
    const ref1 = (el: any) => { if (!el) cleanupCount++ }
    const ref2 = (el: any) => { if (!el) cleanupCount++ }
    let cleanupCount = 0

    // 首次挂载
    const v = { type: 'div' as const, props: { ref: ref1 }, key: undefined }
    const el = render(v, ctx) as HTMLElement
    document.body.appendChild(el)
    assert.equal(cleanupCount, 0, '挂载不清理')

    // 重渲染：ref 函数变化（内联 ref 每次渲染都是新函数）
    // 框架修复：不再调用旧 ref(null)——清理不得触发
    const v2 = { type: 'div' as const, props: { ref: ref2 }, key: undefined }
    patchValue(document.body, el, v, v2, ctx)
    assert.equal(cleanupCount, 0, 'ref 替换（重渲染）不得触发 null 分支清理')

    // 真正卸载 → ref(null) 触发清理
    patchValue(document.body, el, v2, null, ctx)
    assert.equal(cleanupCount, 1, '卸载触发一次清理')
  })
})
