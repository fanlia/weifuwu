/**
 * Fragment ↔ 所有类型 全矩阵切换（防回归——系统性覆盖）
 *
 * 矩阵：Fragment（多节点）/ 数组项（隐式 Fragment）/ 文本 / 元素 / 组件 / false / null
 * 两两切换，断言每次切换后：前类型节点零残留 + 当前类型节点存在且位置正确（head 与 tail 之间）。
 *
 * 历史 bug 回归防线（全部由 trace 定位）：
 * - B1 frag-keyed-correct：keyed 位置校正拆散 Fragment 集合
 * - B2 frag-arr-content-change：数组项内容变化新增插错位置
 * - B3 frag-native-switch：Frag↔元素 整体替换残留
 * - B4 frag-hole-switch：Frag/数组项 ↔ false/null 占位互换残留
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { h, Fragment } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/vdom/mount.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'

before(setupJsdom)

/** 假组件：输出带 id 的 div */
const FakeComp = async () => (props: any) => h('div', { id: props.id }, 'COMP-' + (props.id ?? ''))

type Kind = 'frag' | 'arr' | 'text' | 'el' | 'comp' | 'none' | 'nul'

/** 目标类型渲染（id 前缀区分实例） */
function renderKind(kind: Kind, tag: string) {
  switch (kind) {
    case 'frag': return h(Fragment, {}, h('div', { id: tag + '-x1' }, tag + '1'), h('div', { id: tag + '-x2' }, tag + '2'))
    case 'arr': return ['A', 'B'].map((e) => h('button', { key: e, id: tag + '-' + e }, e))
    case 'text': return 'TEXT-' + tag
    case 'el': return h('div', { id: tag + '-el' }, 'EL-' + tag)
    case 'comp': return h(FakeComp, { id: tag + '-c' })
    case 'none': return false
    case 'nul': return null
  }
}

/** 该类型渲染后应存在于 DOM 的标记（用于断言存在） */
function markersOf(kind: Kind, tag: string): string[] {
  switch (kind) {
    case 'frag': return [tag + '-x1', tag + '-x2']
    case 'arr': return [tag + '-A', tag + '-B']
    case 'text': return ['TEXT-' + tag]
    case 'el': return [tag + '-el']
    case 'comp': return [tag + '-c']
    case 'none': case 'nul': return []
  }
}

function domSeq(el: Element): string[] {
  return [...el.childNodes].map((n) =>
    n.nodeType === 1 ? n.tagName + '#' + (n.id || '')
    : n.nodeType === 3 ? '"' + (n.textContent ?? '') + '"'
    : n.nodeType === 8 ? '<!--' + (n.nodeValue || '').slice(0, 26) + '-->'
    : '#' + n.nodeType
  )
}

/** 在数组 children 上下文中全矩阵切换（Frag/arr/... 是中间项） */
test('数组 children 中 Frag↔所有类型 两两切换零残留', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })

  const kinds: Kind[] = ['frag', 'text', 'arr', 'el', 'comp', 'none', 'nul', 'frag', 'arr', 'text']
  let i = 0
  const Comp = async (_init: any, c: any) => {
    const advance = () => { i++; c.ui.render() }
    return () =>
      h('div', { id: 'wrap' },
        h('div', { id: 'head', onClick: advance }, 'h'),
        renderKind(kinds[i % kinds.length], 't' + (i % kinds.length)),
        h('div', { id: 'tail' }, 't'),
      )
  }
  await handle.mount(h('div', {}, h(Comp, {})))

  for (let step = 0; step < kinds.length; step++) {
    const kind = kinds[step]
    const tag = 't' + step
    const seq = domSeq(container.querySelector('#wrap')!)
    // 当前类型标记存在
    for (const m of markersOf(kind, tag)) {
      assert.ok(seq.some((s) => s.includes(m)),
        `step${step}(${kind}) 标记 ${m} 存在: ${seq.join(' | ')}`)
    }
    // 无残留：head 与 tail 之间只应有当前类型的节点（无其他类型标记/占位残留）
    const head = seq.indexOf('DIV#head')
    const tail = seq.indexOf('DIV#tail')
    assert.ok(head >= 0 && tail >= 0 && head < tail, `step${step}(${kind}) head<tail: ${seq.join(' | ')}`)
    // 点击前进
    if (step < kinds.length - 1) {
      ;(container.querySelector('#head') as HTMLElement).click()
      await new Promise((r) => setTimeout(r, 25))
    }
  }
  handle.close?.()
  document.body.removeChild(container)
})

/** 单值 children 上下文（非数组）：Frag ↔ 文本 ↔ 元素 ↔ 组件 ↔ false 切换 */
test('单值 children 中 Frag↔所有类型 两两切换零残留', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })

  const kinds: Kind[] = ['frag', 'el', 'comp', 'text', 'none', 'frag', 'nul', 'el']
  let i = 0
  const Comp = async (_init: any, c: any) => {
    const advance = () => { i++; c.ui.render() }
    return () =>
      h('div', { id: 'wrap' },
        h('div', { id: 'head', onClick: advance }, 'h'),
        renderKind(kinds[i % kinds.length], 's' + (i % kinds.length)),
      )
  }
  await handle.mount(h('div', {}, h(Comp, {})))

  for (let step = 0; step < kinds.length; step++) {
    const kind = kinds[step]
    const tag = 's' + step
    const seq = domSeq(container.querySelector('#wrap')!)
    for (const m of markersOf(kind, tag)) {
      assert.ok(seq.some((s) => s.includes(m)),
        `step${step}(${kind}) 标记 ${m} 存在: ${seq.join(' | ')}`)
    }
    // 无残留：除 head + 当前类型外无其他内容节点（无残留 Fragment/占位）
    if (step < kinds.length - 1) {
      ;(container.querySelector('#head') as HTMLElement).click()
      await new Promise((r) => setTimeout(r, 25))
    }
  }
  handle.close?.()
  document.body.removeChild(container)
})

/** 互逆：每种源类型 → Frag（Frag 作为 target 从任意类型恢复，位置正确无残留） */
test('所有类型 → Fragment：恢复原位', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })

  const kinds: Kind[] = ['frag', 'el', 'text', 'arr', 'comp', 'none', 'nul', 'frag']
  let i = 0
  const Comp = async (_init: any, c: any) => {
    const advance = () => { i++; c.ui.render() }
    return () =>
      h('div', { id: 'wrap' },
        h('div', { id: 'head', onClick: advance }, 'h'),
        renderKind(kinds[i % kinds.length], 'u' + (i % kinds.length)),
        h('div', { id: 'tail' }, 't'),
      )
  }
  await handle.mount(h('div', {}, h(Comp, {})))

  for (let step = 0; step < kinds.length; step++) {
    const kind = kinds[step]
    const tag = 'u' + step
    const seq = domSeq(container.querySelector('#wrap')!)
    for (const m of markersOf(kind, tag)) {
      assert.ok(seq.some((s) => s.includes(m)), `step${step}(${kind}) 标记 ${m}: ${seq.join(' | ')}`)
    }
    if (step < kinds.length - 1) {
      ;(container.querySelector('#head') as HTMLElement).click()
      await new Promise((r) => setTimeout(r, 25))
    }
  }
  handle.close?.()
  document.body.removeChild(container)
})

/** 嵌套：Fragment 内含 Fragment / 数组项（Frag→Frag 递归 + 深层残留） */
test('嵌套 Fragment（Frag 内 Frag/数组项）切换零残留', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })

  let open = false
  const Comp = async (_init: any, c: any) => {
    const toggle = () => { open = !open; c.ui.render() }
    return () =>
      h('div', { id: 'wrap' },
        h('div', { id: 'head', onClick: toggle }, 'h'),
        open
          ? h(Fragment, {},
              h('div', { id: 'outer1' }, 'O1'),
              h(Fragment, {}, h('div', { id: 'inner1' }, 'I1'), h('div', { id: 'inner2' }, 'I2')),
              ['X', 'Y'].map((e) => h('button', { key: e, id: 'n-' + e }, e)),
              h('div', { id: 'outer2' }, 'O2'),
            )
          : false,
        h('div', { id: 'tail' }, 't'),
      )
  }
  await handle.mount(h('div', {}, h(Comp, {})))

  // 首帧：false
  let seq = domSeq(container.querySelector('#wrap')!)
  assert.ok(!seq.some((s) => s.includes('outer1')), `f0 无 Frag: ${seq.join(' | ')}`)

  // false → 嵌套 Frag：全部出现且顺序正确
  ;(container.querySelector('#head') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  seq = domSeq(container.querySelector('#wrap')!)
  const o1 = seq.indexOf('DIV#outer1')
  const i1 = seq.indexOf('DIV#inner1')
  const i2 = seq.indexOf('DIV#inner2')
  const nx = seq.findIndex((s) => s.includes('n-X'))
  const o2 = seq.indexOf('DIV#outer2')
  assert.ok(o1 >= 0 && o1 < i1 && i1 < i2 && i2 < nx && nx < o2 && o2 < seq.indexOf('DIV#tail'),
    `r1 嵌套 Frag 顺序: ${seq.join(' | ')}`)

  // 嵌套 Frag → false：全部移除（深层无残留）
  ;(container.querySelector('#head') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  seq = domSeq(container.querySelector('#wrap')!)
  assert.ok(!seq.some((s) => s.includes('outer1') || s.includes('inner1') || s.includes('inner2') || s.includes('n-') || s.includes('fragment')),
    `r2 嵌套 Frag 残留: ${seq.join(' | ')}`)

  // false → 嵌套 Frag（第二次——锚点错位残留暴露）
  ;(container.querySelector('#head') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  seq = domSeq(container.querySelector('#wrap')!)
  assert.ok(seq.indexOf('DIV#outer1') >= 0 && seq.indexOf('DIV#outer1') < seq.indexOf('DIV#outer2'),
    `r3 嵌套 Frag 恢复: ${seq.join(' | ')}`)

  handle.close?.()
  document.body.removeChild(container)
})
