/**
 * NavBar 组件契约测试——命令流级断言（零浏览器）
 *
 * 锁定（移动端顶栏——纯展示壳）：
 * - header 容器 + 标题 class（默认 center——align 切 left）
 * - left/right 槽为独立 side 容器（组合式——事件在调用方 VNode）
 * - title 省略 → 无标题节点（纯工具栏形态）
 * - fixed → sticky class 面
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NavBar } from './NavBar.ts'
import { h } from '../../vdom/index.ts'
import { mount, createTable } from '../../../test/contract/component-harness.ts'

function findByTag(ct: ReturnType<typeof createTable>, tag: string): Map<string, { tag: string; attrs: Record<string, unknown> }> {
  const m = new Map()
  for (const [id, c] of ct) if (c.tag === tag) m.set(id, c)
  return m
}

test('默认渲染：header + 标题（center）+ 纯工具栏形态（无 left/right 时无 side）', async () => {
  const h1 = await mount(NavBar, { title: '工作台' })
  const ct = createTable(h1.cmds)
  const headers = findByTag(ct, 'header')
  assert.equal(headers.size, 1, 'header 恰一个')
  const attrs = [...headers.values()][0].attrs
  assert.ok(String(attrs.class).includes('wf-nav-bar'), '容器 class（实际: ' + attrs.class + '）')
  assert.ok(!String(attrs.class).includes('wf-nav-bar--fixed'), '默认非 fixed')
  const title = findByTag(ct, 'div')
  const hasTitle = [...title.values()].some((c) => String(c.attrs?.class).includes('wf-nav-bar-title'))
  assert.ok(hasTitle, '标题 div 存在')
  const texts = h1.cmds.filter((c) => c.op === 'createText').map((c: any) => c.value)
  assert.ok(texts.includes('工作台'), '标题文本（实际: ' + JSON.stringify(texts) + '）')
  const sides = [...title.values()].filter((c) => String(c.attrs?.class).includes('wf-nav-bar-side'))
  assert.equal(sides.length, 0, '无槽位时无 side')
})

test('槽位：left/right 渲染为 side 容器（button 在调用方 VNode——事件不进 attrs）', async () => {
  const h1 = await mount(NavBar, {
    title: '工作台',
    left: h('button', { type: 'button', onClick: () => {} }, '返回'),
    right: h('button', { type: 'button', onClick: () => {} }, '设置'),
  })
  const ct = createTable(h1.cmds)
  const divs = findByTag(ct, 'div')
  const sides = [...divs.values()].filter((c) => String(c.attrs?.class).includes('wf-nav-bar-side'))
  assert.equal(sides.length, 2, '左右槽各一（实际 ' + sides.length + '）')
  const btns = findByTag(ct, 'button')
  assert.equal(btns.size, 2, '两个按钮（组合式——调用方 VNode）')
  for (const [, c] of btns) assert.equal(c.attrs.onClick, undefined, 'onClick 不进 attrs（事件表通道）')
})

test('title 省略 → 纯工具栏（无标题节点）', async () => {
  const h1 = await mount(NavBar, {})
  const ct = createTable(h1.cmds)
  const divs = findByTag(ct, 'div')
  const titles = [...divs.values()].filter((c) => String(c.attrs?.class).includes('wf-nav-bar-title'))
  assert.equal(titles.length, 0, '无标题节点')
})

test('fixed → sticky class 面；align=left → 标题 class 切 left', async () => {
  const h1 = await mount(NavBar, { title: 'T', fixed: true, align: 'left' })
  const ct = createTable(h1.cmds)
  const headers = findByTag(ct, 'header')
  assert.ok(String([...headers.values()][0].attrs.class).includes('wf-nav-bar--fixed'), 'fixed class')
  const divs = findByTag(ct, 'div')
  const title = [...divs.values()].find((c) => String(c.attrs?.class).includes('wf-nav-bar-title'))
  assert.ok(String(title?.attrs.class).includes('wf-nav-bar-title--left'), 'align=left class（实际: ' + title?.attrs.class + '）')
})
