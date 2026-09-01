/**
 * Button 组件契约测试——命令流级断言（零浏览器）
 *
 * 锁定（UX-PLAN-2 波次 3 过程发现的核心层缺口）：
 * - aria-label 透传（图标按钮无文本——name 缺失即死读屏路径 + 测试定位失效：
 *   agent-platform 移动抽屉汉堡按钮实证——assertBy aria-label 全部落空）
 * - 基础面：variant/size 类组合、disabled、loading（spinner + aria-busy）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Button } from './Button.ts'
import { mount, createTable } from '../../../test/contract/component-harness.ts'

test('aria-label 透传：create attrs 携带（读屏 name + 测试定位单一来源）', async () => {
  const h = await mount(Button, { variant: 'ghost', 'aria-label': '打开菜单' })
  const ct = createTable(h.cmds)
  const btn = [...ct.entries()].find(([, v]) => v.tag === 'button')
  assert.ok(btn, '渲染出 button 元素')
  assert.equal(btn![1].attrs['aria-label'], '打开菜单', 'aria-label 必须透传到 button attrs')
})

test('aria-label 缺省不落 attr（undefined → attrs 无该键）', async () => {
  const h = await mount(Button, { variant: 'primary' })
  const ct = createTable(h.cmds)
  const btn = [...ct.entries()].find(([, v]) => v.tag === 'button')
  assert.ok(btn, '渲染出 button 元素')
  assert.equal(btn![1].attrs['aria-label'], undefined, '未传 aria-label 不应落 attrs')
})

test('基础面：variant/size 类组合 + disabled + loading（aria-busy）', async () => {
  const h = await mount(Button, { variant: 'ghost', size: 'sm', disabled: true, id: 'b1', title: '提示' })
  const ct = createTable(h.cmds)
  const btn = [...ct.entries()].find(([, v]) => v.tag === 'button')
  assert.ok(btn, '渲染出 button 元素')
  assert.match(String(btn![1].attrs.class), /wf-btn--ghost/, 'variant 类')
  assert.match(String(btn![1].attrs.class), /wf-btn--sm/, 'size 类')
  assert.equal(btn![1].attrs.disabled, true, 'disabled 透传')
  assert.equal(btn![1].attrs.id, 'b1', 'id 透传')
  assert.equal(btn![1].attrs.title, '提示', 'title 透传')
  const h2 = await mount(Button, { loading: true })
  const ct2 = createTable(h2.cmds)
  const btn2 = [...ct2.entries()].find(([, v]) => v.tag === 'button')
  assert.equal(btn2![1].attrs['aria-busy'], true, 'loading → aria-busy')
})
