/**
 * 三元两侧不对称：Fragment（列表）↔ div（编辑）类型切换整体替换（agent-platform 复现）
 *
 * 真实事故：AgentDetail 工作空间文件区 `{$.wsOpenFile ? (<div>编辑视图</div>) : (<Fragment>列表</Fragment>)}`
 * ——编辑分支是 div、列表分支是 Fragment（多子节点）。列表 → 编辑切换时：
 * - Frag→div：patchValue 替换分支只 `replaceChild` 了 Fragment 锚点（首个节点），
 *   Fragment 其余节点（holes/fragment 标记/文件按钮）全部残留 → 编辑视图下方挂着旧列表
 * - div→Frag：patchValue Fragment 分支对非 Fragment 旧输入用 parent.childNodes 当 diff source
 *   → 整个容器错位
 *
 * 断言：列表→编辑（Fragment 全部移除只剩编辑视图）→ 编辑→列表（列表恢复、编辑移除），
 * 每次容器 children 与目标结构完全一致（无残留）。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { h, Fragment } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/vdom/mount.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { Card } from '../components/index.ts'

before(setupJsdom)

function domSeq(el: Element): string[] {
  return [...el.childNodes].map((n) =>
    n.nodeType === 1 ? n.tagName + '#' + (n.id || '')
    : n.nodeType === 8 ? '<!--' + (n.nodeValue || '').slice(0, 30) + '-->'
    : '#' + n.nodeType
  )
}

test('Fragment↔div 切换：列表→编辑（无残留）→ 列表（恢复）', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })

  const Comp = async (_init: any, c: any) => {
    let open: null | 'edit' = null
    return () =>
      h('div', { id: 'wrap' },
        h(Card as any, {},
          h('div', { id: 'title', onClick: () => { open = 'edit'; c.ui.render() } }, '标题'),
          open === 'edit'
            ? h('div', { id: 'edit', onClick: () => { open = null; c.ui.render() } }, 'EDIT-VIEW')
            : h(Fragment, {},
                h('div', { id: 'crumb' }, '面包屑'),
                false,
                false,
                ['A', 'B'].map((e) => h('button', { key: e, id: 'b-' + e }, e)),
              ),
          h('div', { id: 'tail' }, '尾卡片'),
        ),
      )
  }

  const assertClean = (label: string, expect: string[], absent: string[]) => {
    const card = container.querySelector('.wf-card')!
    const seq = domSeq(card)
    for (const e of expect) {
      assert.ok(seq.some((s) => s.includes(e)), `${label} 应含 ${e}: ${seq.join(' | ')}`)
    }
    for (const a of absent) {
      assert.ok(!seq.some((s) => s.includes(a)), `${label} 不应含 ${a}: ${seq.join(' | ')}`)
    }
    return seq
  }

  await handle.mount(h('div', {}, h(Comp, {})))

  // 首帧：列表（面包屑 + 空 hole + 按钮）
  let seq = assertClean('f0', ['DIV#title', 'DIV#crumb', 'BUTTON#b-A', 'BUTTON#b-B', 'DIV#tail'], ['DIV#edit'])

  // ── 列表 → 编辑（Frag→div）：编辑视图出现，Fragment 全部移除（无残留） ──
  ;(container.querySelector('#title') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  seq = assertClean('r1', ['DIV#title', 'DIV#edit', 'DIV#tail'], ['DIV#crumb', 'BUTTON#b-A', 'BUTTON#b-B', 'fragment'])
  // 容器必须完全干净：title < edit < tail（中间无残留节点）
  const t1 = seq.indexOf('DIV#title')
  const e1 = seq.indexOf('DIV#edit')
  const tail1 = seq.indexOf('DIV#tail')
  assert.ok(t1 === 0 && e1 === 1 && tail1 === 2, `r1 容器应只有 [title, edit, tail]: ${seq.join(' | ')}`)

  // ── 编辑 → 列表（div→Frag）：列表恢复，编辑移除 ──
  ;(container.querySelector('#edit') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  seq = assertClean('r2', ['DIV#title', 'DIV#crumb', 'BUTTON#b-A', 'BUTTON#b-B', 'DIV#tail'], ['DIV#edit'])
  const crumb2 = seq.indexOf('DIV#crumb')
  const a2 = seq.indexOf('BUTTON#b-A')
  assert.ok(crumb2 >= 0 && crumb2 < a2, `r2 列表恢复顺序: ${seq.join(' | ')}`)

  // ── 再切编辑（第二次 Frag→div——锚点错位残留会在此暴露） ──
  ;(container.querySelector('#title') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  seq = assertClean('r3', ['DIV#title', 'DIV#edit', 'DIV#tail'], ['DIV#crumb', 'BUTTON#b-A', 'BUTTON#b-B', 'fragment'])
  const t3 = seq.indexOf('DIV#title')
  const e3 = seq.indexOf('DIV#edit')
  assert.ok(t3 === 0 && e3 === 1 && seq.length === 3, `r3 容器应只有 [title, edit, tail]: ${seq.join(' | ')}`)

  handle.close?.()
  document.body.removeChild(container)
})
