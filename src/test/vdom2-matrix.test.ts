/**
 * vdom2 x↔y 全矩阵 TDD（先红后绿）
 *
 * 类型空间 9 种：frag(显式Fragment)/arr(数组项)/text/el(元素)/comp(组件单输出)/
 * compfrag(组件输出Fragment)/comparr(组件输出数组)/none(false)/nul(null)
 * 两个上下文：数组 children（patchChildren）/ 单值 children（patchValue）
 * 每对独立 mount：渲染 from（断言存在）→ 切换 to（断言 from 零残留 + to 存在位置正确）
 *
 * 覆盖历史 bug 类别：B1 keyed 位置校正拆散集合 / B2 数组项递归新增插错位置 /
 * B3 Frag↔元素整体替换残留 / B4 Frag/数组项↔占位残留 / B5 组件输出多节点残留
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { h, Fragment } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { mountRoot } from '../ui-dom/vdom2/index.ts'

before(setupJsdom)

type Kind = 'frag' | 'arr' | 'text' | 'el' | 'comp' | 'compfrag' | 'comparr' | 'none' | 'nul'
const ALL: Kind[] = ['frag', 'arr', 'text', 'el', 'comp', 'compfrag', 'comparr', 'none', 'nul']

const FragComp = async () => () => h(Fragment, {}, h('div', { id: 'fc1' }, 'FC1'), h('div', { id: 'fc2' }, 'FC2'))
const ArrComp = async () => () => ['X', 'Y'].map((e) => h('button', { key: e, id: 'ac-' + e }, e))
const DivComp = async () => () => h('div', { id: 'dc' }, 'DC')

function renderKind(kind: Kind, tag: string) {
  switch (kind) {
    case 'frag': return h(Fragment, {}, h('div', { id: tag + '-x1' }, tag + '1'), h('div', { id: tag + '-x2' }, tag + '2'))
    case 'arr': return ['A', 'B'].map((e) => h('button', { key: e, id: tag + '-' + e }, e))
    case 'text': return 'TEXT-' + tag
    case 'el': return h('div', { id: tag + '-el' }, 'EL-' + tag)
    case 'comp': return h(DivComp, {})
    case 'compfrag': return h(FragComp, {})
    case 'comparr': return h(ArrComp, {})
    case 'none': return false
    case 'nul': return null
  }
}
function markersOf(kind: Kind, tag: string): string[] {
  switch (kind) {
    case 'frag': return [tag + '-x1', tag + '-x2']
    case 'arr': return [tag + '-A', tag + '-B']
    case 'text': return ['TEXT-' + tag]
    case 'el': return [tag + '-el']
    case 'comp': return ['dc']
    case 'compfrag': return ['fc1', 'fc2']
    case 'comparr': return ['ac-X', 'ac-Y']
    case 'none': case 'nul': return []
  }
}
function domSeq(el: Element): string[] {
  return [...el.childNodes].map((n) =>
    n.nodeType === 1 ? n.tagName + '#' + (n.id || '')
    : n.nodeType === 3 ? '"' + (n.textContent ?? '') + '"'
    : n.nodeType === 8 ? '<!--' + (n.nodeValue || '').slice(0, 24) + '-->'
    : '#' + n.nodeType
  )
}

/** 单对切换验证（from → to，独立挂载） */
async function runPair(from: Kind, to: Kind, single: boolean): Promise<string | null> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const handle = mountRoot({ root: container, ctx: {} as any, browser })
  let state: 'a' | 'b' = 'a'
  const Comp = async (_init: any, c: any) => {
    const advance = () => { state = 'b'; c.ui.render() }
    return () =>
      h('div', { id: 'wrap' },
        h('div', { id: 'head', onClick: advance }, 'h'),
        single ? null : h('div', { id: 'pad' }, 'p'), // 单值上下文：中间值只有 head；数组上下文加 pad 使中间项独立
        state === 'a' ? renderKind(from, 'fa') : renderKind(to, 'to'),
        h('div', { id: 'tail' }, 't'),
      )
  }
  try {
    await handle.mount(h('div', {}, h(Comp, {})))
    const wrap = container.querySelector('#wrap') as HTMLElement | null
    if (!wrap) return `[${from}→${to}] #wrap 未渲染`
    let seq = domSeq(wrap)
    for (const m of markersOf(from, 'fa')) {
      if (!seq.some((s) => s.includes(m))) return `[${from}→${to}] A 缺 ${m}: ${seq.join(' | ')}`
    }
    ;(container.querySelector('#head') as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 15))
    seq = domSeq(wrap)
    for (const m of markersOf(to, 'to')) {
      if (!seq.some((s) => s.includes(m))) return `[${from}→${to}] B 缺 ${m}: ${seq.join(' | ')}`
    }
    // from 零残留（自身对除外——同类型复用标记相同）
    if (from !== to) {
      for (const m of markersOf(from, 'fa')) {
        if (seq.some((s) => s.includes(m))) return `[${from}→${to}] A 残留 ${m}: ${seq.join(' | ')}`
      }
    }
    const head = seq.indexOf('DIV#head')
    const tail = seq.indexOf('DIV#tail')
    if (head < 0 || head >= tail) return `[${from}→${to}] 顺序 head<tail: ${seq.join(' | ')}`
    return null
  } catch (e: any) {
    return `[${from}→${to}] 异常: ${e.message}`
  } finally {
    handle.close?.()
    document.body.removeChild(container)
  }
}

test('vdom2 数组 children 上下文：9×9 全矩阵零残留', async () => {
  const failures: string[] = []
  for (const from of ALL) {
    for (const to of ALL) {
      const r = await runPair(from, to, false)
      if (r) failures.push(r)
    }
  }
  if (failures.length) assert.fail(`矩阵失败 ${failures.length} 对:\n${failures.join('\n')}`)
})

test('vdom2 单值 children 上下文：9×9 全矩阵零残留', async () => {
  const failures: string[] = []
  for (const from of ALL) {
    for (const to of ALL) {
      const r = await runPair(from, to, true)
      if (r) failures.push(r)
    }
  }
  if (failures.length) assert.fail(`矩阵失败 ${failures.length} 对:\n${failures.join('\n')}`)
})
