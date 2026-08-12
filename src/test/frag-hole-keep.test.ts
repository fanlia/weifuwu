/**
 * fragToFrag 占位法不变量：Fragment children 首项 hole 的保持/转换（2026-12 探针定位）
 *
 * 真实 bug：fragToFrag 无条件 `removeChild(oldNode)`——oldNode 是 Frag 锚点 =
 * Frag children 内容的一部分（首节点，可能是 hole 占位注释）。提前移除后 patchChildren
 * 用已脱离节点做 hole↔hole 保持（无效）→ 占位丢失 → childNodes 长度不恒定 →
 * 后续项错位。修复：删除 removeChild（patchChildren 内部已处理 hole 转换）。
 *
 * 断言：首项 hole ↔ 元素 ↔ 元素 连续切换，childNodes 恒等于 children 长度
 * （占位法：数组第 i 项 ⟷ childNodes 第 i 个节点）。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { h, Fragment } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/context.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'

before(setupJsdom)

function domSeq(el: Element): string[] {
  // 过滤 fragment-start/end 标记（内部协议节点——断言用户可见结构）
  return [...el.childNodes].filter((n) =>
    !(n.nodeType === 8 && (n.nodeValue || '').includes('type=fragment')))
    .map((n) =>
    n.nodeType === 1 ? (n as Element).id
    : '#' + (n.nodeValue || '').slice(0, 12))
}

test('Frag 首项 hole 保持/转换：childNodes 长度恒定（占位法不变量）', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })
  const Comp = async (_init: any, c: any) => {
    let flag: boolean | null = null
    const cycle = () => { flag = flag === null ? false : flag === false ? true : null; c.ui.render() }
    return () =>
      h('div', { id: 'box' },
        h(Fragment, {},
          flag === null ? h('div', { id: 'z' }, 'Z')
            : flag ? h('div', { id: 'x' }, 'X')
            : false,                                          // 首项 hole
          h('div', { id: 'y', onClick: cycle }, 'Y'),
        ),
        h('div', { id: 'tail' }, 'T'),
      )
  }
  await handle.mount(h('div', {}, h(Comp, {})))
  await new Promise((r) => setTimeout(r, 20))
  const states: string[][] = []
  states.push(domSeq(container.querySelector('#box')!))
  for (let i = 0; i < 4; i++) {
    ;(container.querySelector('#y') as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 30))
    states.push(domSeq(container.querySelector('#box')!))
  }
  // null→元素（z 首）、false→hole、false→true（x）、true→null（z）、null→false（hole 保持）
  assert.deepEqual(states[0], ['z', 'y', 'tail'], 's0 z 首（元素）')
  assert.ok(states[1][0].startsWith('#') && states[1][1] === 'y' && states[1][2] === 'tail', `s1 hole|y|tail: ${states[1].join(' | ')}`)
  assert.deepEqual(states[2], ['x', 'y', 'tail'], 's2 x 首（hole→元素）')
  assert.deepEqual(states[3], ['z', 'y', 'tail'], 's3 z 首（元素→元素）')
  assert.ok(states[4][0].startsWith('#') && states[4].length === 3, `s4 hole 保持（长度恒定 3 项）: ${states[4].join(' | ')}`)
  handle.close?.()
  container.remove()
})

test('Frag 首项 hole↔hole 保持（同状态 rerender——占位法长度恒定）', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })
  const Comp = async (_init: any, c: any) => {
    let count = 0
    return () =>
      h('div', { id: 'box' },
        h(Fragment, {},
          false,
          h('div', { id: 'y' }, 'Y'),
        ),
        h('div', { id: 'tail', onClick: () => { count++; c.ui.render() } }, 'T'),
      )
  }
  await handle.mount(h('div', {}, h(Comp, {})))
  await new Promise((r) => setTimeout(r, 20))
  const box = container.querySelector('#box')!
  ;(container.querySelector('#tail') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  const seq = domSeq(box)
  assert.ok(seq[0].startsWith('#') && seq[1] === 'y' && seq[2] === 'tail', `hole↔hole 保持（修复前 hole 丢失成 2 项）: ${seq.join(' | ')}`)
  handle.close?.()
  container.remove()
})
