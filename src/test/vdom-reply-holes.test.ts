/**
 * vdom diff 复现测试——children 数组 [false, null, vnode, vnode] 中
 * 第 2 项（条件渲染）从 null → VNode 的 patch
 *
 * 背景（agent-platform Chat 回复条事故）：`.wf-border-t` children =
 * `[atMenuCond(false), replyCond(null), 输入区, 搜索区]`——初始 replyCond=null
 * 渲染 hole；点击「回复」后 replyCond 变 VNode——patch 后该节点从 DOM 消失
 * （既非 hole 也非元素——完全缺失），回复条不显示。
 *
 * 期望：null → VNode 的 patch 在正确位置插入元素。
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { h, jsx } from '../ui-dom/vnode.ts'
import { renderValue } from '../ui-dom/vdom/render.ts'
import { patchValue } from '../ui-dom/vdom/diff.ts'
import { createRegistry } from '../ui-dom/vdom/registry.ts'
import { buildVNode } from '../ui-dom/vdom/build.ts'

before(setupJsdom)
afterEach(() => {
  createClientBrowser().clearBody()
})

async function makeCtx(): Promise<{ ctx: any; browser: any }> {
  const browser = createClientBrowser()
  const reg = createRegistry()
  return { ctx: { browser, registry: reg }, browser }
}

test('children [false, null, a, b] → 第 2 项 null 变 VNode 时正确插入', async () => {
  const { ctx, browser } = await makeCtx()
  const container = browser.createElement('div')
  browser.bodyAppend(container)

  // 初始：cond1=false, cond2=null（Chat 初始 replyTo=null 场景）
  const v1 = h('div', { class: 'bar' }, [
    false,
    null,
    h('div', { class: 'a' }, 'A'),
    h('div', { class: 'b' }, 'B'),
  ])
  const node1 = renderValue(v1, ctx, browser)
  container.appendChild(node1)

  // 初始断言：2 个 hole + 2 个 div（cond2 的 null 也应生成占位 hole）
  const holes1 = [...container.querySelectorAll('div.bar')][0]
  const holeCount1 = (holes1.innerHTML.match(/wf-hole/g) || []).length
  assert.equal(holeCount1, 2, `初始应有 2 个 hole（cond1+cond2），实际 ${holeCount1}`)

  // patch：cond2 = null → VNode（点击「回复」设置 replyTo 场景）
  const v2 = h('div', { class: 'bar' }, [
    false,
    h('div', { class: 'reply' }, '回复 xxx'),
    h('div', { class: 'a' }, 'A'),
    h('div', { class: 'b' }, 'B'),
  ])
  const prev = container.firstChild
  patchValue(container, prev, v1, v2, ctx)

  // 断言：.reply 元素出现（在 .a 之前——位置正确）
  const bar = container.querySelector('div.bar')!
  const reply = bar.querySelector('.reply')
  assert.ok(reply, 'cond2 null→VNode patch 后 .reply 应出现')
  const kids = [...bar.children]
  const replyIdx = kids.findIndex((k) => k.className === 'reply')
  const aIdx = kids.findIndex((k) => k.className === 'a')
  assert.ok(replyIdx !== -1 && replyIdx < aIdx, `reply 应在 a 之前（reply=${replyIdx}, a=${aIdx}）`)
  assert.equal(reply?.textContent, '回复 xxx')
})

test('children [false, false, a, b] → 第 2 项 false 变 VNode 时正确插入（对照）', async () => {
  const { ctx, browser } = await makeCtx()
  const container = browser.createElement('div')
  browser.bodyAppend(container)

  const v1 = h('div', { class: 'bar' }, [false, false, h('div', { class: 'a' }, 'A'), h('div', { class: 'b' }, 'B')])
  const node1 = renderValue(v1, ctx, browser)
  container.appendChild(node1)
  const bar1 = container.querySelector('div.bar')!
  assert.equal((bar1.innerHTML.match(/wf-hole/g) || []).length, 2, '两个 false 都应有 hole')

  const v2 = h('div', { class: 'bar' }, [false, h('div', { class: 'reply' }, 'R'), h('div', { class: 'a' }, 'A'), h('div', { class: 'b' }, 'B')])
  patchValue(container, container.firstChild, v1, v2, ctx)

  const bar = container.querySelector('div.bar')!
  const reply = bar.querySelector('.reply')
  assert.ok(reply, 'false→VNode patch 后 .reply 应出现')
  const kids = [...bar.children]
  assert.ok(kids.findIndex((k) => k.className === 'reply') < kids.findIndex((k) => k.className === 'a'), 'reply 在 a 前')
})

test('children 数组初始就有 4 项、中间项 null——之后变 VNode 且前项也变', async () => {
  // 更贴近 Chat：cond1 false→false，cond2 null→VNode，后续项不动
  const { ctx, browser } = await makeCtx()
  const container = browser.createElement('div')
  browser.bodyAppend(container)

  const v1 = h('div', { class: 'bar' }, [null, null, h('div', { class: 'a' }, 'A'), h('div', { class: 'b' }, 'B')])
  const node1 = renderValue(v1, ctx, browser)
  container.appendChild(node1)

  const v2 = h('div', { class: 'bar' }, [null, h('div', { class: 'reply' }, 'R'), h('div', { class: 'a' }, 'A'), h('div', { class: 'b' }, 'B')])
  patchValue(container, container.firstChild, v1, v2, ctx)

  const bar = container.querySelector('div.bar')!
  const reply = bar.querySelector('.reply')
  assert.ok(reply, 'null(第0项) + null→VNode(第1项) patch 后 .reply 应出现')
})

test('jsx props.children 数组含 null 条件——初始渲染应生成 hole（Chat 复现）', async () => {
  const { ctx, browser } = await makeCtx()
  const container = browser.createElement('div')
  browser.bodyAppend(container)

  // 与 Chat `.wf-border-t` 完全一致：children 数组 = [cond1(false), cond2(null), div, div]
  let replyTo: any = null
  const v1 = jsx('div', {
    class: 'bar',
    children: [false, replyTo && jsx('div', { class: 'reply', children: '回复' }), jsx('div', { class: 'a', children: 'A' }), jsx('div', { class: 'b', children: 'B' })],
  })
  const node1 = renderValue(v1, ctx, browser)
  container.appendChild(node1)
  const bar = container.querySelector('div.bar')!
  const holes1 = (bar.innerHTML.match(/wf-hole/g) || []).length
  assert.equal(holes1, 2, `初始应有 2 个 hole（cond1+cond2），实际 ${holes1} ——DOM: ${bar.innerHTML}`)
})

// ── 真实链路复现（mountRoot + buildVNode + patchValue——与 Chat 渲染器一致） ──

test('mount 链路：组件输出 [false, cond2, div, div]——cond2 null→VNode（props 驱动）', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = await import('../ui-dom/vdom/mount.ts').then(m => m.createVdomContext({ root: container, browser }))
  const { mountRoot } = await import('../ui-dom/vdom/mount.ts')

  // Chat .wf-border-t 同构：cond1=false, cond2=props.showReply 条件, 输入区, 搜索区
  const Bar = async (init: any, c: any) => {
    return (props: any) => jsx('div', { class: 'bar', children: [
      false,
      props.showReply && jsx('div', { class: 'reply', children: '回复 xxx' }),
      jsx('div', { class: 'a' }, 'A'),
      jsx('div', { class: 'b' }, 'B'),
    ]})
  }
  const handle = mountRoot({ root: container, ctx, browser })
  await handle.mount(jsx(Bar, { showReply: false }))
  const bar1 = container.querySelector('div.bar')!
  const holes1 = (bar1.innerHTML.match(/wf-hole/g) || []).length
  assert.equal(holes1, 2, `初始应有 2 个 hole（cond1+cond2），实际 ${holes1}——${bar1.innerHTML}`)

  // props.showReply: false → true（点击「回复」等价——组件重渲染）
  const newV = jsx(Bar, { showReply: true })
  const reg = createRegistry()
  const built = await buildVNode(newV, ctx, bar1 ? undefined : undefined, reg)
  patchValue(container, container.firstChild, undefined, built, { browser, registry: reg })

  const bar2 = container.querySelector('div.bar')!
  const reply = bar2.querySelector('.reply')
  console.log('[mount-repro] bar2.innerHTML =', bar2.innerHTML)
  assert.ok(reply, 'cond2 null→VNode 后 .reply 应出现')
  assert.equal(reply.textContent, '回复 xxx')
  const kids = [...bar2.children]
  assert.ok(kids.findIndex(k => k.className === 'reply') < kids.findIndex(k => k.className === 'a'), 'reply 在 a 前')
  handle.close?.()
  document.body.removeChild(container)
})

test('mount 链路：同构重渲染（无状态变化）——null 位置 hole 必须保留（ws rerender 场景）', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const mount = await import('../ui-dom/vdom/mount.ts')
  const { ctx } = mount.createVdomContext({ root: container, browser })

  // Chat 同构：cond1=false, cond2=内部状态（初始 null）, div, div
  const Bar = async (init: any, c: any) => {
    const $: any = { replyTo: null }
    return (props: any) => jsx('div', { class: 'bar', children: [
      false,
      $.replyTo && jsx('div', { class: 'reply', children: 'R' }),
      jsx('div', { class: 'a', children: 'A' }),
      jsx('div', { class: 'b', children: 'B' }),
    ]})
  }
  const handle = mount.mountRoot({ root: container, ctx, browser })
  await handle.mount(jsx(Bar, {}))
  const bar1 = container.querySelector('div.bar')!
  const holes1 = (bar1.innerHTML.match(/wf-hole/g) || []).length
  assert.equal(holes1, 2, `初始 2 hole，实际 ${holes1}——${bar1.innerHTML}`)

  // 同构重渲染（模拟 ws 事件触发 rerender——状态无变化）——hole 必须保留
  await handle.mount(jsx(Bar, {}))
  const bar2 = container.querySelector('div.bar')!
  const holes2 = (bar2.innerHTML.match(/wf-hole/g) || []).length
  assert.equal(holes2, 2, `同构重渲染后仍应 2 hole，实际 ${holes2}——${bar2.innerHTML}`)

  handle.close?.()
  document.body.removeChild(container)
})

test('mount 链路 rerender()：force 重渲染后 null 位置 hole 必须保留（Chat ws rerender 场景）', async () => {
  ;(globalThis as any).__WF_VDOM_DEBUG = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const mount = await import('../ui-dom/vdom/mount.ts')
  const { ctx } = mount.createVdomContext({ root: container, browser })

  const Bar = async (init: any, c: any) => {
    const $: any = { replyTo: null }
    return (props: any) => jsx('div', { class: 'bar', children: [
      false,
      $.replyTo && jsx('div', { class: 'reply', children: 'R' }),
      jsx('div', { class: 'a', children: 'A' }),
      jsx('div', { class: 'b', children: 'B' }),
    ]})
  }
  const handle = mount.mountRoot({ root: container, ctx, browser })
  await handle.mount(jsx(Bar, {}))
  const bar1 = container.querySelector('div.bar')!
  const holes1 = (bar1.innerHTML.match(/wf-hole/g) || []).length
  assert.equal(holes1, 2, `初始 2 hole，实际 ${holes1}——${bar1.innerHTML}`)

  // 真实 rerender 路径（force 内容级 patch——与 Chat renderByIds 同路径）
  await handle.rerender()
  const bar2 = container.querySelector('div.bar')!
  console.log('[rerender-dom]', bar2.innerHTML)
  const holes2 = (bar2.innerHTML.match(/wf-hole/g) || []).length
  assert.equal(holes2, 2, `rerender 后仍应 2 hole，实际 ${holes2}——${bar2.innerHTML}`)

  handle.close?.()
  document.body.removeChild(container)
})

test('mount 链路：多占位混合 [false, null, div, false, div, null] rerender 后全部保留', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const mount = await import('../ui-dom/vdom/mount.ts')
  const { ctx } = mount.createVdomContext({ root: container, browser })

  const Bar = async (init: any, c: any) => {
    const $: any = { show: null }
    return (props: any) => jsx('div', { class: 'bar', children: [
      false,
      $.show && jsx('div', { class: 'reply', children: 'R' }),
      jsx('div', { class: 'a', children: 'A' }),
      false,
      jsx('div', { class: 'b', children: 'B' }),
      null,
    ]})
  }
  const handle = mount.mountRoot({ root: container, ctx, browser })
  await handle.mount(jsx(Bar, {}))
  const bar1 = container.querySelector('div.bar')!
  const holes1 = (bar1.innerHTML.match(/wf-hole/g) || []).length
  // 数组 6 项：[false, null, div, false, div, null] → 4 个 hole + 2 div
  assert.equal(holes1, 4, `初始 4 hole，实际 ${holes1}——${bar1.innerHTML}`)

  await handle.rerender()
  const bar2 = container.querySelector('div.bar')!
  const holes2 = (bar2.innerHTML.match(/wf-hole/g) || []).length
  assert.equal(holes2, 4, `rerender 后仍 4 hole，实际 ${holes2}——${bar2.innerHTML}`)

  handle.close?.()
  document.body.removeChild(container)
})
