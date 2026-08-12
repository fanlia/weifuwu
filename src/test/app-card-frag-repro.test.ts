/**
 * 完整复刻 app 场景：Card 组件 + 三元 Fragment 切换 + Button/Textarea 真组件 + map 列表
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { h, Fragment } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/vdom/mount.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { Card, Button, Textarea } from '../components/index.ts'

before(setupJsdom)

test('完整复刻：Card + 三元 Fragment + 真 Button/Textarea + map 列表', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })

  const Comp = async (_init: any, c: any) => {
    let open: { path: string; content: string } | null = null
    let edit = ''
    let entries = [{ name: 'notes.md', size: 36 }, { name: 'report.txt', size: 22 }]
    const openFile = () => { open = { path: 'notes.md', content: '文件浏览器写入' }; edit = '文件浏览器写入'; c.ui.render() }
    const back = () => { open = null; c.ui.render() }
    const save = () => { console.log('save'); open = null; c.ui.render() }

    return () =>
      h(Card as any, {},
        h('div', {}, '工作空间文件'),
        h('div', {}, '说明'),
        open
          ? h(Fragment, {},
              h('div', {},
                h(Button as any, { size: 'sm', variant: 'ghost', onClick: back }, '返回列表'),
                h('span', {}, open.path),
              ),
              h(Textarea as any, { value: edit, rows: 12 }),
              h('div', {},
                h(Button as any, { size: 'sm', variant: 'primary', onClick: save }, '保存'),
              ),
            )
          : h(Fragment, {},
              h('div', {}, '面包屑'),
              entries.map((e, i) =>
                h('button', { id: 'f' + i, key: e.name, onClick: openFile }, e.name + ' ' + e.size)),
            ),
        h('div', {}, '尾卡片'),
      )
  }

  await handle.mount(h('div', {}, h(Comp, {})))
  assert.ok(container.querySelector('#f0'), '初始 map 项渲染: ' + container.textContent?.slice(0, 100))
  assert.ok(container.querySelector('#f1'))

  const f0 = container.querySelector('#f0') as HTMLElement
  f0.click()
  await new Promise(r => setTimeout(r, 50))
  const txt = container.textContent ?? ''
  assert.ok(txt.includes('返回列表'), '编辑视图返回按钮: ' + txt.slice(0, 200))
  assert.ok(container.querySelector('textarea'), '编辑 textarea')
  const ta = container.querySelector('textarea') as HTMLTextAreaElement
  assert.equal(ta.value, '文件浏览器写入', 'textarea 内容')
  assert.ok(txt.includes('保存'), '保存按钮')

  handle.close?.()
  document.body.removeChild(container)
})
