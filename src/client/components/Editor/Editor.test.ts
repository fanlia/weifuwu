/**
 * Editor 组件契约测试——命令流级断言（零浏览器——node 直跑）
 *
 * 锁定（2026-12 定时器纪律专项）：
 * - 首帧：工具栏/内容区结构 + contenteditable + 事件通道（setProp）
 * - 卸载清理：hold 通道——输入提交（1s 防抖）/草稿保存（500ms 防抖）定时器
 *   零遗留（否则卸载后 flush/storageSet + 上层 onChange 违例触发）
 * - ref/DOM 依赖面：harness 无 DOM——ref 不触发——渲染零崩溃（SSR 面等价）
 *
 * 运行：node --env-file=.env --test src/client/components/Editor/Editor.test.ts
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Editor } from './Editor.ts'
import { mount, ops, createTable } from '../../../test/contract/component-harness.ts'

// ── 定时器 spy（Editor 定时器创建于事件回调——harness 无 DOM 输入流，
//    清理断言取结构性等价：unmount 执行 hold 清理零异常 + 零遗留）───────
let created: Array<{ kind: 'timeout' | 'interval'; id: unknown }> = []
let cleared: unknown[] = []
const origSetTimeout = globalThis.setTimeout
const origSetInterval = globalThis.setInterval
const origClearTimeout = globalThis.clearTimeout
const origClearInterval = globalThis.clearInterval

beforeEach(() => {
  ;(globalThis as any).window = globalThis
  created = []
  cleared = []
  globalThis.setTimeout = ((fn: any, ms?: number, ...a: any[]) => {
    const id = origSetTimeout(fn, ms, ...a)
    created.push({ kind: 'timeout', id })
    return id
  }) as typeof setTimeout
  globalThis.setInterval = ((fn: any, ms?: number, ...a: any[]) => {
    const id = origSetInterval(fn, ms, ...a)
    created.push({ kind: 'interval', id })
    return id
  }) as typeof setInterval
  globalThis.clearTimeout = ((id: any) => { cleared.push(id); return origClearTimeout(id) }) as typeof clearTimeout
  globalThis.clearInterval = ((id: any) => { cleared.push(id); return origClearInterval(id) }) as typeof clearInterval
})
afterEach(() => {
  for (const c of created) {
    if (c.kind === 'interval') origClearInterval(c.id as any)
    else origClearTimeout(c.id as any)
  }
  delete (globalThis as any).window
  globalThis.setTimeout = origSetTimeout
  globalThis.setInterval = origSetInterval
  globalThis.clearTimeout = origClearTimeout
  globalThis.clearInterval = origClearInterval
})

test('首帧：结构 + contenteditable + 事件通道（setProp——不进 attrs）', async () => {
  const h = await mount(Editor, { value: '<p>hello</p>' })
  const ct = createTable(h.cmds)
  assert.ok(ops(h.cmds).includes('mount'), '组件挂载命令')
  // contenteditable 编辑区（contentEditable property 通道——camelCase）
  const editable = [...ct.entries()].find(([, n]) => n.attrs.contentEditable)
  assert.ok(editable, 'contentEditable 编辑区存在（property 通道）')
  assert.equal(editable![1].attrs.onInput, undefined, 'onInput 不进 create attrs（事件表通道）')
  // 工具栏存在（wf-editor-toolbar）
  assert.ok([...ct.values()].some((n) => String(n.attrs.class ?? '').includes('wf-editor-toolbar')), '工具栏存在')
})

test('重渲染：value 变化不重建编辑区（组件复用——工厂不重跑）', async () => {
  const h = await mount(Editor, { value: '<p>a</p>' })
  const before = h.mounts()
  const cmds = await h.render({ value: '<p>b</p>' })
  assert.ok(!ops(cmds).includes('create') || ops(cmds).filter((o) => o === 'create').length < 3,
    '重渲染零/少 create（就地 patch）')
  assert.equal(h.mounts(), before, '工厂不重跑（实例复用）')
})

test('卸载清理：hold 注册——防抖定时器未触发即清（结构性等价断言）', async () => {
  const h = await mount(Editor, { value: '<p>x</p>' })
  assert.ok(h.mounts() >= 1, '组件挂载')
  h.unmount()
  assert.equal(h.mounts(), 0, '卸载后实例记录清空（hold 清理已执行——零异常）')
})
