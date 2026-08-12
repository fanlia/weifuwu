/**
 * renderByIds 路径重现：两阶段组件 + 事件回调 + ctx.ui.render() + 条件 Fragment 切换
 * （app 场景：AgentDetail 文件浏览器 `{$.wsOpenFile ? <FragA> : <FragB>}`——点击后编辑视图）
 */

import { test, before } from 'node:test'
import assert from 'node:assert'
import { h, Fragment } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/vdom/mount.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'

before(setupJsdom)

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })
  return { container, handle }
}

test('真组件事件驱动：三元 Fragment 分支切换（B→A→B）', async () => {
  const { container, handle } = setup()
  const Comp = async (_init: any, c: any) => {
    let show = false
    const toggle = () => { show = !show; c.ui.render() }
    return () => h('div', { id: 'wrap' },
      h('span', { id: 'h' }, 'header'),
      show
        ? h(Fragment, {}, h('div', { id: 'a' }, 'AAA'))
        : h(Fragment, {}, h('div', { id: 'b' }, 'BBB')),
      h('button', { id: 'btn', onClick: toggle }, 'toggle'),
    )
  }

  await handle.mount(h('div', {}, h(Comp, {})))
  assert.ok(container.querySelector('#b'), '初始 B')
  assert.ok(container.querySelector('#btn'))

  const btn = container.querySelector('#btn') as HTMLButtonElement
  btn.click()
  await new Promise(r => setTimeout(r, 30))
  assert.ok(container.querySelector('#a'), '点击后 A 分支渲染（切换 Fragment）')
  assert.ok(!container.querySelector('#b'), 'B 分支移除')

  btn.click()
  await new Promise(r => setTimeout(r, 30))
  assert.ok(container.querySelector('#b'), '再点切回 B')
  assert.ok(!container.querySelector('#a'), 'A 分支移除')

  handle.close?.()
  document.body.removeChild(container)
})

test('真组件：多子节点 Fragment 分支（编辑视图结构：div+button+textarea）', async () => {
  const { container, handle } = setup()
  const Comp = async (_init: any, c: any) => {
    let show = false
    const toggle = () => { show = !show; c.ui.render() }
    return () => h('div', { id: 'wrap' },
      h('span', { id: 'h' }, 'header'),
      show
        ? h(Fragment, {},
            h('button', { id: 'back', onClick: toggle }, '返回'),
            h('div', { id: 'mid' }, 'mid'),
            h('button', { id: 'save', onClick: toggle }, '保存'),
          )
        : h(Fragment, {}, h('div', { id: 'list', onClick: toggle }, '文件列表')),
      h('span', { id: 't' }, 'tail'),
    )
  }

  await handle.mount(h('div', {}, h(Comp, {})))
  assert.ok(container.querySelector('#list'), '初始列表')

  const listDiv = container.querySelector('#list') as HTMLElement
  listDiv.click() // 模拟点击列表项 → show=true
  await new Promise(r => setTimeout(r, 30))
  assert.ok(container.querySelector('#back'), '编辑视图返回按钮')
  assert.ok(container.querySelector('#mid'), '编辑视图中间 div')
  assert.ok(container.querySelector('#save'), '保存按钮')
  assert.ok(container.querySelector('#t'), 'tail 保留')

  handle.close?.()
  document.body.removeChild(container)
})

test('真组件：Fragment 分支含组件子节点（app 的 Textarea 场景）', async () => {
  const { container, handle } = setup()
  // 模拟 weifuwu Textarea（两阶段组件）
  const FakeTextarea = async () => (props: any) =>
    h('textarea', { id: props.id, value: props.value, onInput: props.onInput })
  const Comp = async (_init: any, c: any) => {
    let show = false
    const toggle = () => { show = !show; c.ui.render() }
    return () => h('div', { id: 'wrap' },
      show
        ? h(Fragment, {},
            h('button', { id: 'back', onClick: toggle }, '返回'),
            h(FakeTextarea, { id: 'fta', value: 'edit-content' }),
            h('button', { id: 'save', onClick: toggle }, '保存'),
          )
        : h(Fragment, {},
            h('div', { id: 'list', onClick: toggle }, '文件列表'),
            h('span', { id: 'extra' }, 'x'),
          ),
    )
  }

  await handle.mount(h('div', {}, h(Comp, {})))
  assert.ok(container.querySelector('#list'), '初始列表')

  const listDiv = container.querySelector('#list') as HTMLElement
  listDiv.click()
  await new Promise(r => setTimeout(r, 30))
  assert.ok(container.querySelector('#back'), '编辑视图返回按钮')
  assert.ok(container.querySelector('#fta'), '编辑视图组件（FakeTextarea）')
  assert.ok(container.querySelector('#save'), '保存按钮')
  const ta = container.querySelector('#fta') as HTMLTextAreaElement
  assert.equal(ta.value, 'edit-content', '组件内容')
  assert.ok(!container.querySelector('#list'), '列表分支移除')

  handle.close?.()
  document.body.removeChild(container)
})

test('真组件：列表分支含嵌套数组（map 渲染）→ 编辑分支切换', async () => {
  const { container, handle } = setup()
  const FakeTextarea = async () => (props: any) =>
    h('textarea', { id: props.id, value: props.value })
  const Comp = async (_init: any, c: any) => {
    let show = false
    let entries = [
      { name: 'a.txt', size: 10 },
      { name: 'b.md', size: 20 },
    ]
    const openFile = () => { show = true; c.ui.render() }
    return () => h('div', { id: 'wrap' },
      show
        ? h(Fragment, {},
            h('button', { id: 'back', onClick: () => { show = false; c.ui.render() } }, '返回'),
            h(FakeTextarea, { id: 'fta', value: 'edit' }),
            h('button', { id: 'save' }, '保存'),
          )
        : h(Fragment, {},
            h('div', { id: 'crumb' }, '面包屑'),
            entries.map((e, i) =>
              h('button', { id: 'f' + i, key: e.name, onClick: openFile }, e.name + ' ' + e.size)),
          ),
    )
  }

  await handle.mount(h('div', {}, h(Comp, {})))
  assert.ok(container.querySelector('#f0'), 'map 项 0 渲染')
  assert.ok(container.querySelector('#f1'), 'map 项 1 渲染')

  const f0 = container.querySelector('#f0') as HTMLElement
  f0.click()
  await new Promise(r => setTimeout(r, 30))
  assert.ok(container.querySelector('#back'), '编辑视图返回')
  assert.ok(container.querySelector('#fta'), '编辑视图组件')
  assert.ok(!container.querySelector('#f0'), 'map 列表移除')

  handle.close?.()
  document.body.removeChild(container)
})

test('真组件：Fragment 分支含多个 async 组件（app 的 Button×2+Textarea）', async () => {
  const { container, handle } = setup()
  // 模拟 weifuwu Button（async 组件）
  const FakeButton = async (_i: any, c: any) => (props: any) => {
    return h('button', { id: props.id, onClick: props.onClick, disabled: props.disabled }, props.children)
  }
  const FakeTextarea = async () => (props: any) =>
    h('textarea', { id: props.id, value: props.value })
  const Comp = async (_init: any, c: any) => {
    let show = false
    const back = () => { show = false; c.ui.render() }
    return () => h('div', { id: 'wrap' },
      show
        ? h(Fragment, {},
            h('div', {},
              h(FakeButton, { id: 'back', onClick: back }, '返回列表'),
              h('span', { id: 'path' }, 'notes.md'),
              h('span', { id: 'size' }, '36 B'),
            ),
            h(FakeTextarea, { id: 'fta', value: 'edit-content' }),
            h('div', {},
              h(FakeButton, { id: 'save', disabled: false }, '保存'),
            ),
          )
        : h(Fragment, {},
            h('div', { id: 'crumb', onClick: () => { show = true; c.ui.render() } }, '面包屑'),
            h('div', { id: 'f0', onClick: () => { show = true; c.ui.render() } }, 'notes.md'),
          ),
    )
  }

  await handle.mount(h('div', {}, h(Comp, {})))
  assert.ok(container.querySelector('#f0'), '初始列表')

  const f0 = container.querySelector('#f0') as HTMLElement
  f0.click()
  await new Promise(r => setTimeout(r, 40))
  assert.ok(container.querySelector('#back'), '返回列表按钮')
  assert.ok(container.querySelector('#fta'), '编辑 Textarea')
  assert.ok(container.querySelector('#save'), '保存按钮')
  const ta = container.querySelector('#fta') as HTMLTextAreaElement
  assert.equal(ta.value, 'edit-content', 'Textarea 内容')
  assert.ok(!container.querySelector('#f0'), '列表移除')

  handle.close?.()
  document.body.removeChild(container)
})
