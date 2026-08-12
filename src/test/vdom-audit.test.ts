/**
 * vdom/audit 测试（阶段 C——结构一致性运行时校验）
 *
 * 核心：audit 把「用户的想法 = vnode = DOM」从设计承诺变成运行时断言——
 * ① 负例：故意制造错位（占位被删/数量塌缩）→ audit 必须报错（不静默）
 * ② 正例：规则表核心场景渲染后 audit 零报错（当前引擎零错位基线）
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { h, Fragment } from '../ui-dom/vnode.ts'
import { buildVNode } from '../ui-dom/vdom/build.ts'
import { renderValue } from '../ui-dom/vdom/render.ts'
import { patchValue } from '../ui-dom/vdom/diff.ts'
import { createRegistry } from '../ui-dom/vdom/registry.ts'
import { auditChildren, auditTree } from '../ui-dom/vdom/audit.ts'

before(setupJsdom)
afterEach(() => createClientBrowser().clearBody())

async function makeCtx() {
  const browser = createClientBrowser()
  const reg = createRegistry()
  return {
    reg,
    ctx: {
      browser,
      registry: reg,
      ctxVersion: 0,
      getCtxVersion: () => 0,
      ui: { _selfId: '_wf_root', setMounting: () => {}, endMounting: () => {} },
    },
  }
}

function mountEl(): HTMLDivElement {
  const b = createClientBrowser()
  const el = b.createElement('div')
  b.bodyAppend(el)
  return el
}

// ── 负例：错位必须被捕获 ──

test('audit 负例：占位被删（childNodes 塌缩）→ 报错', async () => {
  const { ctx, reg } = await makeCtx()
  const v = h('div', {}, [h('span', { class: 'a' }, '1'), false, h('span', { class: 'b' }, '2')])
  await buildVNode(v, ctx, undefined, reg)
  const root = mountEl()
  root.appendChild(renderValue(v, ctx, ctx.browser)!)
  const div = root.firstChild as HTMLElement
  assert.equal(div.childNodes.length, 3)
  // 故意删掉占位（模拟外部 DOM 修改/引擎 bug 塌缩）
  const hole = div.childNodes[1]
  div.removeChild(hole)
  const msgs: string[] = []
  auditChildren(div, [h('span', { class: 'a' }, '1'), false, h('span', { class: 'b' }, '2')], (m) => msgs.push(m))
  assert.ok(msgs.length > 0, '占位错位必须报错: ' + msgs.join(' | '))
})

test('audit 负例：占位换成真实元素 → 报错', async () => {
  const { ctx, reg } = await makeCtx()
  const v = h('div', {}, [false])
  await buildVNode(v, ctx, undefined, reg)
  const root = mountEl()
  root.appendChild(renderValue(v, ctx, ctx.browser)!)
  const div = root.firstChild as HTMLElement
  // 故意把占位换成真实元素（占位错位——本次事故类别）
  const hole = div.childNodes[0]
  const span = document.createElement('span')
  div.replaceChild(span, hole)
  const msgs: string[] = []
  auditChildren(div, [false], (m) => msgs.push(m))
  assert.ok(msgs.length > 0, '占位→真实必须报错: ' + msgs.join(' | '))
})

// ── 正例：规则表核心场景 audit 零报错（引擎零错位基线） ──

test('audit 正例：占位/组件/keyed 列表渲染后 auditTree 零报错', async () => {
  const { ctx, reg } = await makeCtx()
  const Item = async (_init: any) => (props: any) => h('span', { class: 'item' }, String(props.n))
  const Alert = async (_init: any) => () => h('div', { class: 'alert' }, 'x')
  const v = h('div', { class: 'w' }, [
    h('span', { class: 'a' }, '1'),
    false,
    h(Alert, {}),
    [h('span', { class: 'na' }, 'x'), h('span', { class: 'nb' }, 'y')], // 数组项 ≡ Fragment
    h(Item, { key: 'k1', n: 1 }),
  ])
  await buildVNode(v, ctx, undefined, reg)
  const root = mountEl()
  root.appendChild(renderValue(v, ctx, ctx.browser)!)
  const msgs: string[] = []
  auditTree(root.firstChild as Element, v, (m) => msgs.push(m))
  assert.deepEqual(msgs, [], '规则表场景零错位（audit 基线全绿）: ' + msgs.join(' | '))
})

test('audit 正例：patch 后 audit 零报错（占位↔真实转换后结构一致）', async () => {
  const { ctx, reg } = await makeCtx()
  const Btn = async (_init: any) => () => h('button', { class: 'b' }, 'x')
  const v1 = h('div', {}, [false, h(Btn, {})])
  await buildVNode(v1, ctx, undefined, reg)
  const root = mountEl()
  root.appendChild(renderValue(v1, ctx, ctx.browser)!)
  const v2 = h('div', {}, [h('div', { class: 'alert' }, 'a'), h(Btn, {})]) // false → 真实
  await buildVNode(v2, ctx, v1, reg)
  patchValue(root, root.firstChild, v1, v2, ctx)
  const msgs: string[] = []
  auditTree(root.firstChild as Element, v2, (m) => msgs.push(m))
  assert.deepEqual(msgs, [], 'patch 后零错位: ' + msgs.join(' | '))
})

test('audit 正例：Fragment 展开后 auditChildren 零报错', async () => {
  const { ctx, reg } = await makeCtx()
  const v = h('div', {}, [h(Fragment, {}, [h('span', { class: 'fa' }, '1'), h('span', { class: 'fb' }, '2')])])
  await buildVNode(v, ctx, undefined, reg)
  const root = mountEl()
  root.appendChild(renderValue(v, ctx, ctx.browser)!)
  const msgs: string[] = []
  auditTree(root.firstChild as Element, v, (m) => msgs.push(m))
  assert.deepEqual(msgs, [], 'Fragment 展开零错位: ' + msgs.join(' | '))
})
