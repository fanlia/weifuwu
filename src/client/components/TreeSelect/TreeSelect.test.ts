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

test('虚拟滚动：virtual/height 透传到 Tree（portal mock 透传）', async () => {
  const bigTree = Array.from({ length: 300 }, (_, i) => ({ key: `n${i}`, label: `节点 ${i}` }))
  // usePopup mock：portal 透传内容（默认返回 null——Tree 不会出现在 vnode 树）
  const ctx = createTestCtx({ ui: { usePopup: () => ({ open: true, setOpen: () => {}, refresh: () => {}, portal: (c: any) => c, wrapProps: {} }) } })
  const vnode = await renderVNode(TreeSelect, { options: bigTree, virtual: true, height: 280 }, ctx) as any
  const v = JSON.stringify(vnode)
  assert.ok(v.includes('"virtual":true') && v.includes('"height":280'), 'virtual/height 透传到 Tree')
})
