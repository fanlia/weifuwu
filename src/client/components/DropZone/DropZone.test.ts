/**
 * DropZone 组件契约测试——命令流级断言（零浏览器）
 *
 * 锁定（拖放容器——零渲染高亮面不可契约——真实 DnD 走 showcase comp）：
 * - 容器 class + children 透传（任意内容包裹）
 * - 事件经 useDragDrop 事件表通道（attrs 无 onDrag*——契约 7）
 * - disabled → class 面
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DropZone } from './DropZone.ts'
import { h } from '../../vdom/index.ts'
import { mount, createTable } from '../../../test/contract/component-harness.ts'

function findDropZone(ct: ReturnType<typeof createTable>): { tag: string; attrs: Record<string, unknown> } | null {
  for (const [, c] of ct) {
    if (c.tag === 'div' && String(c.attrs?.class ?? '').includes('wf-drop-zone')) return c
  }
  return null
}

test('容器 + children 透传（任意内容包裹——onFiles 不进 attrs）', async () => {
  const h1 = await mount(DropZone, {
    onFiles: () => {},
    children: h('div', { class: 'inner' }, '内容'),
  })
  const ct = createTable(h1.cmds)
  const root = findDropZone(ct)
  assert.ok(root, '容器存在')
  assert.ok(String(root.attrs?.class).includes('wf-drop-zone'), '容器 class')
  assert.equal(root.attrs?.onDrop, undefined, 'onDrop 不进 attrs（useDragDrop 事件表通道）')
  assert.equal(root.attrs?.onDragOver, undefined, 'onDragOver 不进 attrs')
  const inner = findByClass(ct, 'inner')
  assert.ok(inner, 'children 渲染')
})

test('disabled → class 面（全路径拦截由 showcase 实测）', async () => {
  const h1 = await mount(DropZone, { disabled: true })
  const ct = createTable(h1.cmds)
  const root = findDropZone(ct)
  assert.ok(String(root?.attrs?.class).includes('wf-drop-zone--disabled'), 'disabled class')
})

function findByClass(ct: ReturnType<typeof createTable>, cls: string): boolean {
  for (const [, c] of ct) if (String(c.attrs?.class ?? '').includes(cls)) return true
  return false
}
