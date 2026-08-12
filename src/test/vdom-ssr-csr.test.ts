/**
 * SSR 与客户端 renderValue 的 HTML 一致性测试
 *
 * 核心：同一棵 vnode 树——服务端 renderSsr 生成的 HTML 与客户端
 * buildVNode + renderValue 生成 DOM 的 innerHTML 必须**结构等价**
 * （占位法：hole 注释/fragment 边界标记/data-wf-key/文本转义/属性——
 * SSR/CSR 同推导——hydration 不 mismatch 的前提）。
 *
 * 归一化：组件实例 id（data-wf-id 分配顺序客户端/SSR 可能不同——
 * 非确定性值，排除后断言其余完全一致）。
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { h, jsx } from '../ui-dom/vnode.ts'
import { buildVNode } from '../ui-dom/vdom/build.ts'
import { renderValue } from '../ui-dom/vdom/render.ts'
import { renderSsr } from '../ui-dom/vdom/ssr.ts'
import { createRegistry } from '../ui-dom/vdom/registry.ts'
import { createVdomContext } from '../ui-dom/vdom/mount.ts'

before(setupJsdom)
afterEach(() => {
  createClientBrowser().clearBody()
})

/** 客户端渲染 vnode → innerHTML（真实链路：buildVNode + renderValue） */
async function csrHtml(v: any): Promise<string> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const reg = createRegistry()
  const built = await buildVNode(v, ctx, undefined, reg)
  const node = renderValue(built, ctx, browser)
  if (node != null) container.appendChild(node)
  document.body.removeChild(container)
  return container.innerHTML
}

/** DOM 结构等价：节点类型/文本/注释/属性集合（无序）/children 递归——
 * data-wf-id 排除（分配顺序非确定性）；boolean 属性值归一（"" === null） */
function domEquivalent(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false
  if (a.nodeType === 8) return (a as Comment).nodeValue === (b as Comment).nodeValue
  if (a.nodeType === 3) return (a as Text).textContent === (b as Text).textContent
  if (a.nodeType !== 1) return false
  const ea = a as Element
  const eb = b as Element
  if (ea.tagName !== eb.tagName) return false
  const pick = (el: Element) =>
    [...el.attributes]
      .filter((x) => x.name !== 'data-wf-id')
      .map((x) => `${x.name}=${x.value === '' ? '' : x.value}`)
      .sort()
      .join('|')
  if (pick(ea) !== pick(eb)) return false
  const ca = [...ea.childNodes]
  const cb = [...eb.childNodes]
  if (ca.length !== cb.length) return false
  for (let i = 0; i < ca.length; i++) if (!domEquivalent(ca[i], cb[i])) return false
  return true
}

/** 断言 CSR DOM 与 SSR HTML 结构等价 */
async function assertSameHtml(v: any, label: string): Promise<void> {
  const csr = await csrHtml(v)
  const ssr = await renderSsr(v, {} as any)
  const csrWrap = document.createElement('div')
  csrWrap.innerHTML = csr
  const ssrWrap = document.createElement('div')
  ssrWrap.innerHTML = ssr
  assert.ok(
    domEquivalent(csrWrap.firstChild!, ssrWrap.firstChild!),
    `${label}——CSR: ${csr} | SSR: ${ssr}`,
  )
}

test('SSR=CSR：数组占位 + 嵌套数组 + 文本转义 + 属性', async () => {
  const v = h('div', { class: 'w' }, [
    false,
    h('i', { id: 'a' }, 'A&B'),
    null,
    [h('b', { id: 'c' }, 'C'), h('b', { id: 'd' }, 'D')],
    h('span', { class: 's', 'data-x': '1' }, 'x'),
  ])
  await assertSameHtml(v, '占位+嵌套+转义')
})

test('SSR=CSR：用户 keyed 数组（data-wf-key 用用户 key）', async () => {
  const v = h('div', { class: 'w' }, [
    h('i', { key: 'x1', id: 'x' }, 'X'),
    h('i', { key: 'y2', id: 'y' }, 'Y'),
    h('i', { key: 'z3', id: 'z' }, 'Z'),
  ])
  await assertSameHtml(v, '用户 keyed')
})

test('SSR=CSR：组件展开（data-wf-id 归一化）', async () => {
  const Comp = async (_init: any) => () => h('span', { class: 'comp' }, '内嵌')
  const v = h('div', { class: 'w' }, [
    h(Comp, {}),
    null,
    h('i', { id: 'a' }, 'A'),
  ])
  await assertSameHtml(v, '组件展开')
})

test('SSR=CSR：深层嵌套数组（fid 层级独立）', async () => {
  const v = h('div', { class: 'w' }, [
    [h('a', { id: 'a' }, 'A'), [h('b', { id: 'b' }, 'B'), h('c', { id: 'c' }, 'C')]],
    h('i', { id: 'd' }, 'D'),
  ])
  await assertSameHtml(v, '深层嵌套')
})

test('SSR=CSR：空数组 / 空 children / 纯 false', async () => {
  await assertSameHtml(h('div', { class: 'a' }, []), '空数组')
  await assertSameHtml(h('div', { class: 'b' }), '空 children')
  await assertSameHtml(h('div', { class: 'c' }, false), '纯 false')
  await assertSameHtml(h('div', { class: 'd' }, null), '纯 null')
})

test('SSR=CSR：条件渲染（false→true 同源——占位法）', async () => {
  // 条件渲染等价数组 [false, div] / [div]——hole 位置对齐
  await assertSameHtml(h('div', { class: 'w' }, [false, h('i', { id: 'a' }, 'A')]), '条件 false')
  await assertSameHtml(h('div', { class: 'w' }, [h('i', { id: 'a' }, 'A')]), '条件 true')
})

test('SSR=CSR：属性类型面（boolean/enumerated/样式/事件剥离）', async () => {
  const v = h('div', { class: 'w' }, [
    h('button', { disabled: true, draggable: true, onClick: () => {}, title: 't' }, 'btn'),
    h('span', { style: 'color: red' }, 'styled'),
    h('input', { type: 'checkbox', checked: true }),
  ])
  const csr = await csrHtml(v)
  const ssr = await renderSsr(v, {} as any)
  // 事件剥离（SSR 无 onClick）
  assert.ok(!ssr.includes('onClick'), 'SSR 事件剥离')
  assert.ok(!csr.includes('onClick'), 'CSR 事件剥离')
  // 结构等价（enumerated draggable 显式 true + boolean 属性语义）
  const csrWrap = document.createElement('div')
  csrWrap.innerHTML = csr
  const ssrWrap = document.createElement('div')
  ssrWrap.innerHTML = ssr
  assert.ok(domEquivalent(csrWrap.firstChild!, ssrWrap.firstChild!), `属性面——CSR: ${csr} | SSR: ${ssr}`)
  assert.ok(csr.includes('draggable'), 'draggable 显式（CSR DOM）')
  assert.ok(ssr.includes('draggable'), 'draggable 显式（SSR）')
})
