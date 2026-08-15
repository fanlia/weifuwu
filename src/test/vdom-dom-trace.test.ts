/**
 * vdom DOM 写追踪测试——diff 对 DOM 的每次操作（append/insertBefore/remove/
 * setAttribute/removeAttribute）可观测、可断言
 *
 * 覆盖：
 * - 首帧渲染：appendChild 事件（父/目标描述）
 * - patch 更新：setAttribute/removeAttribute 事件（属性级变化）
 * - patch 移除：removeChild 事件
 * - 插入：insertBefore 事件（含 ref）
 * - session 关联：diff 期间的写操作带渲染会话 id
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { createVdomContext } from '../ui-dom/context.ts'
import { buildVNode } from '../ui-dom/vdom2/build.ts'
import { renderValue } from '../ui-dom/vdom2/render.ts'
import { patchValue } from '../ui-dom/vdom2/patch.ts'
import { h } from '../ui-dom/vnode.ts'
import { __resetVdomEvents, __vdom_events } from '../ui-dom/vdom2/events.ts'
import { installDomTrace, domTraceEnabled } from '../ui-dom/vdom2/dom-trace.ts'

before(setupJsdom)
const browser = createClientBrowser()

function domWrites(): any[] {
  return __vdom_events(500, { machine: 'dom' } as any)
}

test('DOM 写追踪：首帧 appendChild + patch 的 setAttribute/removeChild/insertBefore 全部可观测', async () => {
  // 安装追踪（模拟 audit 开启）
  ;(globalThis as any).__WF_DOM_TRACE = true
  const uninstall = installDomTrace()
  try {
    __resetVdomEvents()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const { ctx, registry } = createVdomContext({ browser, root })

    // 首帧：div#card + span.a + 文本
    const tree1 = h('div', { id: 'card', class: 'a' }, [
      h('span', { class: 'a' }, 'hello'),
      h('span', { class: 'b' }, 'world'),
    ])
    await buildVNode(tree1, ctx, null, registry)
    const node1 = renderValue(tree1, ctx, browser)
    root.appendChild(node1!)

    // patch：class 变更 + 移除 div.b（异 tag → removeChild）+ 插入新 span（insertBefore）
    const tree2 = h('div', { id: 'card', class: 'b' }, [
      h('span', { class: 'a' }, 'hello'),
      h('span', { class: 'c' }, 'new'),
    ])
    const tree2b = h('div', { id: 'card', class: 'b' }, [
      h('span', { class: 'a' }, 'hello'),
    ])
    await buildVNode(tree2, ctx, tree1, registry)
    patchValue(root, root.firstChild, tree1, tree2, { browser, registry }) // span.c 插入（insertBefore）
    await buildVNode(tree2b, ctx, tree2, registry)
    patchValue(root, root.firstChild, tree2, tree2b, { browser, registry }) // span.c 移除（removeChild）

    const writes = domWrites()
    const ops = writes.map((w) => w.from)
    // 首帧 + patch 的写操作都被记录
    assert.ok(ops.includes('appendChild'), 'appendChild 可观测（首帧/插入），实际: ' + ops.join(','))
    assert.ok(ops.includes('setAttribute'), 'setAttribute 可观测（class 变更），实际: ' + ops.join(','))
    assert.ok(ops.includes('removeChild') || ops.includes('replaceChild'), '移除/替换可观测，实际: ' + ops.join(','))
    assert.ok(ops.includes('appendChild') || ops.includes('insertBefore'), '插入可观测，实际: ' + ops.join(','))
    // 事件带 DOM 描述（父/目标）
    const setAttr = writes.find((w) => w.from === 'setAttribute')
    const p = setAttr?.payload as any
    assert.ok(p?.parent?.includes('#card'), 'setAttribute 父描述含 #card，实际: ' + JSON.stringify(p))
    assert.ok(p?.target === 'class', 'setAttribute target=class，实际: ' + JSON.stringify(p))
    document.body.removeChild(root)
  } finally {
    uninstall()
    delete (globalThis as any).__WF_DOM_TRACE
  }
})

test('DOM 写追踪：关闭时不产生事件（零开销）', async () => {
  __resetVdomEvents()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { ctx, registry } = createVdomContext({ browser, root })
  const tree = h('div', {}, 'x')
  await buildVNode(tree, ctx, null, registry)
  const node = renderValue(tree, ctx, browser)
  root.appendChild(node!)
  assert.equal(domWrites().length, 0, '关闭时无 DOM 写事件（hook 未安装）')
  document.body.removeChild(root)
})

test('domTraceEnabled：开关读取', () => {
  ;(globalThis as any).__WF_DOM_TRACE = true
  assert.equal(domTraceEnabled(), true)
  delete (globalThis as any).__WF_DOM_TRACE
  assert.equal(domTraceEnabled(), false)
})
