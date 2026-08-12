/**
 * vdom2 SSR → hydrate 闭环（x2html 生成 HTML → 游标收养不重建 DOM）
 *
 * 验证：SSR 输出同构（占位/数组标记/事件剥离）→ hydrate 收养（属性/事件/ref 接线、
 * 数组项不重复、SSR 残留清理）→ 交互可用（事件已接线）。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { h, Fragment } from '../ui-dom/vnode2.ts'
import { x2html } from '../ui-dom/vdom2/x2html.ts'
import { hydrateVNode } from '../ui-dom/vdom2/hydrate.ts'
import { createVdomContext } from '../ui-dom/context.ts'
import { buildVNode } from '../ui-dom/vdom2/build.ts'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'

before(setupJsdom)

test('x2html → hydrate：事件接线 + 数组项不重复 + 文本保留', async () => {
  let clicks = 0
  const Comp = async () => () =>
    h('div', { id: 'root' },
      h('button', { id: 'btn', onClick: () => { clicks++ } }, '点我'),
      h('span', {}, '你好'),
      ['A', 'B'].map((x) => h('i', { key: x }, x)),
    )

  // SSR
  const html = await x2html(h(Comp, {}), {})
  assert.ok(html.includes('id="btn"') && html.includes('>点我</button>'), 'SSR 按钮（事件剥离 + 数组项 key）')
  assert.ok(html.includes('fragment-start'), 'SSR 数组标记')

  // 客户端收养
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const built = await buildVNode(h(Comp, {}), ctx, undefined, ctx.__registry)
  await hydrateVNode(container, built as any, ctx)

  // 收养后：数组项不重复、文本保留
  const is = container.querySelectorAll('i')
  assert.ok(is.length === 2, `数组项应 2 个（实际 ${is.length}）: ${container.innerHTML.slice(0, 180)}`)
  assert.ok(container.textContent?.includes('你好'), '文本保留')

  // 交互：事件已接线
  ;(container.querySelector('#btn') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(clicks > 0, '点击触发——事件已接线')

  document.body.removeChild(container)
})

test('x2html → hydrate：Fragment 多节点 + 占位', async () => {
  const Comp = async () => () =>
    h('div', { id: 'root' },
      h(Fragment, {},
        h('p', { id: 'p1' }, '一'),
        false,
        h('p', { id: 'p2' }, '二'),
      ),
    )
  const html = await x2html(h(Comp, {}), {})
  assert.ok(html.includes('type=hole value=false'), 'SSR 占位注释')

  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const built = await buildVNode(h(Comp, {}), ctx, undefined, ctx.__registry)
  await hydrateVNode(container, built as any, ctx)
  assert.ok(container.querySelector('#p1') && container.querySelector('#p2'), 'Fragment 两节点收养')
  assert.ok(container.textContent?.includes('一') && container.textContent?.includes('二'), '内容完整')
  document.body.removeChild(container)
})
