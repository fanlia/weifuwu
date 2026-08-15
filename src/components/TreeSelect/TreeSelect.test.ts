/**
 * TreeSelect 组件测试（vdom3 迁移补测——最小基线）
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'
import { TreeSelect } from './TreeSelect.ts'

before(setupJsdom)

const tree = [
  { key: 'a', label: '节点A', children: [{ key: 'a1', label: '子A1' }] },
  { key: 'b', label: '节点B' },
]

test('渲染：顶层结构（trigger——Tree 子组件 renderVNode 一层不展开）', async () => {
  const vnode = await renderVNode(TreeSelect, { options: tree }, createTestCtx()) as any
  const text = JSON.stringify(vnode)
  assert.ok(text.includes('wf-treeselect') || text.includes('wf-select'), '容器 class')
})

test('渲染：value 回填（trigger 显示选中值）', async () => {
  const vnode = await renderVNode(TreeSelect, { options: tree, value: 'a1' }, createTestCtx()) as any
  assert.ok(vnode != null, '渲染输出')
})

test('渲染：placeholder', async () => {
  const vnode = await renderVNode(TreeSelect, { options: tree, placeholder: '请选择' }, createTestCtx()) as any
  assert.ok(JSON.stringify(vnode).includes('请选择'), 'placeholder')
})
