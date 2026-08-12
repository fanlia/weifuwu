/**
 * 最小复刻：Card children 三元 Fragment 切换（列表 div + map 数组 → 编辑两个 div）
 * app 实测：i=0 patch 失败（旧 div 移除但新 div 没插入）、i=1 成功
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { h, Fragment } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/vdom/mount.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { Card } from '../components/index.ts'

before(setupJsdom)

test('Card 三元 Fragment：列表(div+map数组) → 编辑(两个div)', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })

  const Comp = async (_init: any, c: any) => {
    let open: string | null = null
    let entries = [{ name: 'notes.md' }, { name: 'report.txt' }]
    const openFile = () => { open = 'notes.md'; c.ui.render() }
    return () =>
      h(Card as any, {},
        h('div', {}, '标题'),
        h('div', {}, '说明'),
        open
          ? h(Fragment, {},
              h('div', { id: 'edit-plain' }, 'PLAIN-EDIT ' + open),
              h('div', { id: 'edit-div2' }, 'SECOND-DIV'),
            )
          : h(Fragment, {},
              h('div', { id: 'list-simple' }, 'SIMPLIFIED-LIST'),
              false,
              false,
              entries.map((e) => h('button', { key: e.name, id: 'f' + e.name, onClick: openFile }, e.name)),
            ),
        h(Card as any, {}, '第二个 Card'),
      )
  }

  await handle.mount(h('div', {}, h(Comp, {})))
  assert.ok(container.querySelector("[id='fnotes.md']"), '初始 map 渲染: ' + container.textContent?.slice(0, 80))
  // 断言首帧顺序：SIMPLIFIED-LIST 在 map 按钮之前
  const card = container.querySelector('.wf-card')
  const seq = card ? [...card.childNodes].map(n => n.nodeType === 1 ? n.tagName + '#' + (n.id || '') : n.nodeType === 8 ? '<!--' + (n.nodeValue || '').slice(0, 30) : '#' + n.nodeType) : []
  console.log('[order] childCount=' + (card?.childNodes.length ?? -1))
  console.log('[order]', JSON.stringify(seq))
  const listIdx = seq.findIndex(x => x.includes('list-simple'))
  const btnIdx = seq.findIndex(x => x.includes('fnotes.md'))
  assert.ok(listIdx < btnIdx, 'list-simple 应在 map 按钮前: ' + JSON.stringify(seq))

  const f = container.querySelector("[id='fnotes.md']") as HTMLElement
  f.click()
  await new Promise(r => setTimeout(r, 30))
  const txt = container.textContent ?? ''
  assert.ok(txt.includes('PLAIN-EDIT'), '编辑 PLAIN-EDIT: ' + txt.slice(0, 120))
  assert.ok(txt.includes('SECOND-DIV'), '编辑 SECOND-DIV')
  assert.ok(!container.querySelector('#list-simple'), '列表移除')
  assert.ok(!container.querySelector("[id='fnotes.md']"), 'map 移除')

  handle.close?.()
  document.body.removeChild(container)
})
