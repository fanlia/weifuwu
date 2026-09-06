/**
 * ListScaffold 组件契约测试——命令流级断言（零浏览器）
 *
 * 锁定（入库 W1——**空态/列表并存 bug 契约化**）：
 * - 基础：PageHeader + toolbar + children 三区渲染
 * - **empty 显式**：empty 定义但 isEmpty=false → **不渲染空态**（并存 bug 防线）
 * - isEmpty=true → 空态渲染（icon/text/hint/actions 透传）
 * - loading 优先：loading=true → Loading 渲染 + 空态不渲染（不闪空态）
 * - loading 时 toolbar 仍渲染（搜索框可用——平台语义）
 * - 无 empty 定义 → 永不渲染空态
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ListScaffold } from './ListScaffold.ts'
import { mount, createTable } from '../../../test/contract/component-harness.ts'

/** 查 wf 类区（class 包含片段） */
function byClass(ct: Map<string, any>, frag: string) {
  return [...ct.values()].filter((c)=> String(c.attrs?.class ?? '').includes(frag))
}

/** 精确根类（wf-empty 根 vs wf-empty-icon 子类——防前缀误匹配） */
function byRootClass(ct: Map<string, any>, cls: string) {
  return [...ct.values()].filter((c)=> {
    const cl = String(c.attrs?.class ?? '')
    return cl === cls || cl.startsWith(cls + ' ') || cl.includes(' ' + cls + ' ')
  })
}

test('基础：PageHeader + toolbar + children 三区', async () => {
  const h = await mount(ListScaffold, { title: 'Agents', sub: '列表', toolbar: 'T', children: 'C' })
  const ct = createTable(h.cmds)
  assert.ok(byClass(ct, 'wf-page-head').length >= 1, 'PageHeader 区')
  assert.ok(byClass(ct, 'wf-stack').length >= 1, '骨架区（wf-stack）')
  assert.ok(byClass(ct, 'wf-page-sub').length >= 1, 'sub 透传')
})

test('empty 显式：isEmpty=false → 不渲染空态（并存 bug 防线）', async () => {
  const h = await mount(ListScaffold, { title: 'X', empty: { text: '空' }, isEmpty: false })
  const ct = createTable(h.cmds)
  assert.equal(byRootClass(ct, 'wf-empty').length, 0, '有数据不显示空态')
})

test('isEmpty=true → 空态渲染（icon/text/hint 透传）', async () => {
  const h = await mount(ListScaffold, { title: 'X', empty: { text: '空', hint: '提示' }, isEmpty: true })
  const ct = createTable(h.cmds)
  const empty = byRootClass(ct, 'wf-empty')
  assert.equal(empty.length, 1, '空态根渲染')
  // 文案命令（createText——值流）——空态文本存在
  const texts = h.cmds.filter((c)=> c.op === 'createText').map((c: any)=> c.value)
  assert.ok(texts.includes('空'), 'empty text 渲染')
})

test('loading 优先：loading=true → Loading + 空态不渲染（不闪空态）', async () => {
  const h = await mount(ListScaffold, { title: 'X', loading: true, empty: { text: '空' }, isEmpty: true })
  const ct = createTable(h.cmds)
  assert.ok(byClass(ct, 'wf-loading').length >= 1, 'Loading 渲染')
  assert.equal(byRootClass(ct, 'wf-empty').length, 0, '空态不渲染（loading 优先）')
})

test('loading 时 toolbar 仍渲染（搜索框可用）', async () => {
  const h = await mount(ListScaffold, { title: 'X', loading: true, toolbar: 'T' })
  const texts = h.cmds.filter((c)=> c.op === 'createText').map((c: any)=> c.value)
  assert.ok(texts.includes('T'), 'toolbar 在 loading 下渲染')
})

test('无 empty 定义 → 永不渲染空态', async () => {
  const h = await mount(ListScaffold, { title: 'X', isEmpty: true })
  const ct = createTable(h.cmds)
  assert.equal(byRootClass(ct, 'wf-empty').length, 0, '无 empty 定义不渲染')
})
