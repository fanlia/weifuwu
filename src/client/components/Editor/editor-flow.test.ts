/**
 * Editor 事务层端到端测试（阶段 1：语义操作 → commit 事件流 → undo/redo）
 *
 * vdom3 createRoot 挂载真实 DOM——工具栏点击/键盘事件经事件代理触发组件
 * 处理器——断言 DOM 与 onChange 输出（模型 = fold(事件流) 的组件层验证）。
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../vdom/setup.ts'
import { h } from '../../vdom/index.ts'
import { mountToDom, patchToDom, createTestCtx } from '../../vdom/testing.ts'
import { Editor } from './Editor.ts'
import { setSelectionOffsets } from './model/dom.ts'
import { editEvents } from './edit-events.ts'

before(setupJsdom)

interface Harness {
  root: HTMLElement
  calls: string[]
  content: () => HTMLElement | null
  clickToolbar: (item: string) => void
  key: (key: string, opts?: { ctrl?: boolean }) => void
}

async function mount(value: string): Promise<Harness> {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const calls: string[] = []
  // patch 驱动 ctx.render（浮层交互——同 editor-ai 模式）
  let renderFn: (() => any) | null = null
  let prev: any = null
  let readyResolve: () => void = () => {}
  const ready = new Promise<void>((r) => { readyResolve = r })
  const ctx: any = {
    render: async () => { await ready; const next = await renderFn!(); await patchToDom(root, root.firstChild, prev, next, ctx); prev = next },
    onUnmount: () => {}, params: {}, query: {},
    ui: { usePopup: (opts: any) => { const isOpen = () => (typeof opts?.isOpen === 'function' ? opts.isOpen() : !!opts?.isOpen); return { get open() { return isOpen() }, setOpen: (v: boolean) => opts?.setOpen?.(v), refresh: () => {}, portal: (c: any) => (isOpen() ? c : null), wrapProps: {} } } },
  }
  const result = await Editor({ value, onChange: (v: string) => calls.push(v) } as any, ctx)
  renderFn = () => result({ value, onChange: (v: string) => calls.push(v) } as any)
  prev = await renderFn()
  await mountToDom(root, prev, ctx)
  readyResolve()
  const content = () => root.querySelector('.wf-editor-content') as HTMLElement | null
  const clickToolbar = (item: string) => {
    const btn = root.querySelector(`[data-item="${item}"]`) as HTMLElement | null
    assert.ok(btn, `toolbar 按钮 ${item} 存在`)
    btn!.click()
  }
  const key = (k: string, opts: { ctrl?: boolean } = {}) => {
    const el = content()!
    const ev = new (window as any).KeyboardEvent('keydown', {
      key: k, bubbles: true, cancelable: true, ctrlKey: !!opts.ctrl, metaKey: false,
    })
    el.dispatchEvent(ev)
    return ev
  }
  return { root, calls, content, clickToolbar, key }
}

function cleanup(h: Harness): void {
  h.root.remove()
}

test('挂载：value → 模型 → DOM 渲染', async () => {
  const h = await mount('<p>hello world</p>')
  try {
    assert.equal(h.content()?.textContent, 'hello world')
    assert.equal(h.content()?.innerHTML, '<p>hello world</p>')
  } finally { cleanup(h) }
})

test('bold 工具栏 → commit 事件 → DOM <b> + onChange；Ctrl+Z 撤销 → 复原；Ctrl+Y 重做', async () => {
  const h = await mount('<p>hello world</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 0, 5) // 选 "hello"
    h.clickToolbar('bold')
    assert.ok(el.querySelector('b'), 'DOM 含 <b>')
    assert.equal(el.textContent, 'hello world', '文本不变')
    assert.equal(h.calls[h.calls.length - 1], '<p><b>hello</b> world</p>', 'onChange 输出模型序列化')
    // 事件流可审计
    const commits = editEvents(10, { action: 'commit' })
    assert.equal(commits[0].payload?.label, 'mark-b')
    // Ctrl+Z：一步撤销（原子）
    h.key('z', { ctrl: true })
    assert.equal(el.querySelector('b'), null, '撤销后 <b> 消失')
    assert.equal(h.calls[h.calls.length - 1], '<p>hello world</p>')
    assert.equal(editEvents(10, { action: 'undo' })[0].payload?.label, 'mark-b')
    // Ctrl+Y：重做
    h.key('y', { ctrl: true })
    assert.ok(el.querySelector('b'), '重做后 <b> 恢复')
  } finally { cleanup(h) }
})

test('h1 块命令 toggle + 撤销（块属性恢复）', async () => {
  const h = await mount('<p>标题</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 1, 1) // 光标在段内
    h.clickToolbar('h1')
    assert.ok(el.querySelector('h1'), '段变 h1')
    h.key('z', { ctrl: true })
    assert.ok(!el.querySelector('h1') && el.querySelector('p'), '撤销回 p')
  } finally { cleanup(h) }
})

test('对齐 toggle（center → 清除）', async () => {
  const h = await mount('<p>内容</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 0, 0)
    h.clickToolbar('alignCenter')
    assert.equal(el.querySelector('p')?.getAttribute('style'), 'text-align:center')
    h.clickToolbar('alignCenter') // 再点 → 反选
    assert.equal(el.querySelector('p')?.getAttribute('style'), null, '再点清除对齐')
  } finally { cleanup(h) }
})

test('hr 嵌入 → commit → DOM <hr> + 撤销', async () => {
  const h = await mount('<p>a</p><p>b</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 1, 1) // 光标在 "a" 后
    h.clickToolbar('hr')
    assert.ok(el.querySelector('hr'), 'DOM 含 <hr>')
    const commits = editEvents(10, { action: 'commit' })
    assert.equal(commits[0].payload?.label, 'embed-hr')
    h.key('z', { ctrl: true })
    assert.ok(!el.querySelector('hr'), '撤销移除 <hr>')
  } finally { cleanup(h) }
})

test('表格 Popover → 网格 portal 渲染', async () => {
  const h = await mount('<p>a</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 1, 1)
    h.clickToolbar('table')
    await new Promise((r) => setTimeout(r, 20))
    const grid = document.querySelector('.wf-editor-table-grid')
    assert.ok(grid, '表格网格 Popover 打开（portal 渲染）')
    assert.ok(grid!.closest('#__wf_portal'), '网格在 portal 容器内')
    h.key('Escape', {}) // 关闭
  } finally { cleanup(h) }
})

test('undo 后新操作清空 redo（新分支）', async () => {
  const h = await mount('<p>hello</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 0, 5)
    h.clickToolbar('bold')   // commit 1
    h.key('z', { ctrl: true }) // undo → redo 可用
    h.clickToolbar('italic') // commit 2 → redo 清空
    h.key('y', { ctrl: true }) // 无 redo——不变化
    assert.ok(el.querySelector('i'), 'italic 保留')
    assert.ok(!el.querySelector('b'), 'bold 未重做')
  } finally { cleanup(h) }
})

test('link 按钮（无选区）→ 链接输入浮层（usePopup portal）→ 输入 URL 确认', async () => {
  const h = await mount('<p>hello</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 0, 0) // 折叠光标
    const linkBtn = h.root.querySelector('[data-item="link"]') as HTMLElement | null
    assert.ok(linkBtn)
    linkBtn!.click()
    await new Promise((r) => setTimeout(r, 20))
    const panel = document.querySelector('.wf-editor-link-panel')
    assert.ok(panel, '链接输入浮层出现')
    assert.ok(panel!.closest('#__wf_portal'), '浮层在 portal 容器（§5.4 弹窗纪律）')
    // 取消按钮关闭（Escape 由 usePopup 全局监听——另测）
    const cancelBtn = panel!.querySelector('.wf-editor-link-panel-actions .wf-btn--ghost') as HTMLElement | null
    assert.ok(cancelBtn)
    cancelBtn!.click()
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(document.querySelector('.wf-editor-link-panel'), null, '取消关闭浮层')
  } finally { cleanup(h) }
})

test('image 按钮 → 图片输入浮层（portal）', async () => {
  const h = await mount('<p>hello</p>')
  try {
    const imgBtn = h.root.querySelector('[data-item="image"]') as HTMLElement | null
    assert.ok(imgBtn)
    imgBtn!.click()
    await new Promise((r) => setTimeout(r, 20))
    const panel = document.querySelector('.wf-editor-link-panel')
    assert.ok(panel, '图片输入浮层出现')
    assert.ok(panel!.closest('#__wf_portal'), '浮层在 portal 容器')
  } finally { cleanup(h) }
})

test('历史面板：操作记录 + 时光机回到任意版本', async () => {
  const h = await mount('<p>hello</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 0, 5)
    h.clickToolbar('bold')    // commit 1：hello → <b>
    setSelectionOffsets(el, 6, 6)
    h.clickToolbar('h1')      // commit 2：段变 h1
    const histBtn = h.root.querySelector('[data-item="history"]') as HTMLElement | null
    assert.ok(histBtn, '历史按钮存在')
    histBtn!.click()
    await new Promise((r) => setTimeout(r, 20))
    const panel = document.querySelector('.wf-editor-hist-panel')
    assert.ok(panel, '历史面板出现')
    assert.equal(panel!.textContent?.includes('mark-b'), true, 'commit 1 记录（mark-b）')
    assert.equal(panel!.textContent?.includes('block-h1'), true, 'commit 2 记录（block-h1）')
    // 回到 commit 1（时光机）→ 段回 p、bold 保留
    const items = panel!.querySelectorAll('.wf-editor-hist-item')
    const first = items[items.length - 1] as HTMLElement // 最旧 = commit 1
    first!.click()
    await new Promise((r) => setTimeout(r, 20))
    const el2 = h.content()!
    assert.ok(el2.querySelector('b'), 'bold 保留')
    assert.ok(!el2.querySelector('h1') && el2.querySelector('p'), '段回到 p（commit 1 状态）')
    assert.equal(el2.textContent, 'hello')
  } finally { cleanup(h) }
})

test('无自建历史时 Ctrl+Z 仍拦截（输入入流——撤销全走自建栈）', async () => {
  const h = await mount('<p>hello</p>')
  try {
    const el = h.content()!
    const ev = h.key('z', { ctrl: true })
    assert.equal(ev.defaultPrevented, true, '总是 preventDefault（自建栈接管撤销）')
    assert.equal(el.textContent, 'hello', '无历史时内容不变')
  } finally { cleanup(h) }
})

test('输入接管：打字 → 事件入流 → Ctrl+Z 回退输入', async () => {
  const h = await mount('<p>hello</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 5, 5) // 光标在 "hello" 后
    // 模拟浏览器直写 DOM + input 事件（真实输入路径）
    el.innerHTML = '<p>hello world</p>'
    el.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(el.textContent, 'hello world', 'DOM 输入生效')
    assert.equal(h.calls[h.calls.length - 1], '<p>hello world</p>', 'onChange 输出')
    // Ctrl+Z：回退输入（精确——不再退浏览器；undo 前 flush 输入 commit 落栈）
    h.key('z', { ctrl: true })
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(el.textContent, 'hello', '输入被撤销')
    // 输入 commit 已入流（edit 事件可审计——flush 后）
    const commits = editEvents(10, { action: 'commit' })
    assert.equal(commits[0].payload?.label, '输入')
    // Ctrl+Y：重做
    h.key('y', { ctrl: true })
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(el.textContent, 'hello world', '输入重做')
  } finally { cleanup(h) }
})

test('连续输入合并为一个 commit（一次 Ctrl+Z 退全部）', async () => {
  const h = await mount('<p>hello</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 5, 5)
    el.innerHTML = '<p>hello a</p>'
    el.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    el.innerHTML = '<p>hello ab</p>'
    el.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    el.innerHTML = '<p>hello abc</p>'
    el.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(el.textContent, 'hello abc')
    // 一次 Ctrl+Z 退全部（合并 commit）
    h.key('z', { ctrl: true })
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(el.textContent, 'hello', '一次撤销退全部连续输入')
  } finally { cleanup(h) }
})

test('Enter 分块 → 输入事件 + 撤销', async () => {
  const h = await mount('<p>hello</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 5, 5)
    el.innerHTML = '<p>hello</p><p>world</p>'
    el.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(el.textContent, 'helloworld')
    assert.equal(el.querySelectorAll('p').length, 2, '分块')
    h.key('z', { ctrl: true })
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(el.innerHTML, '<p>hello</p>', '撤销合并回一段')
  } finally { cleanup(h) }
})

test('IME 组合输入：compositionend 后 diff 入流 + 撤销', async () => {
  const h = await mount('<p>hello</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 5, 5)
    // 组合中浏览器直写 + input（不拦截——同一次 input 事件）
    el.innerHTML = '<p>hello中文</p>'
    el.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(el.textContent, 'hello中文', '组合文本入流')
    h.key('z', { ctrl: true })
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(el.textContent, 'hello', '组合输入可撤销')
  } finally { cleanup(h) }
})

test('选中替换：输入替换选区 → diff 推导（delete+insert）→ 撤销', async () => {
  const h = await mount('<p>hello world</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 0, 5) // 选 "hello"
    el.innerHTML = '<p>HELLO world</p>'
    el.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(el.textContent, 'HELLO world', '替换生效')
    h.key('z', { ctrl: true })
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(el.textContent, 'hello world', '替换撤销')
  } finally { cleanup(h) }
})
