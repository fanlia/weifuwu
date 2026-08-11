// vdom 引擎回归测试（真实浏览器/组件报告的问题——TDD 固化）
// 1. DatePicker 打开 → portal 面板渲染（数组分支 replaceChild HierarchyRequestError）
// 2. Modal 关闭 → 滚动锁释放（Portal 移除时 ref(null) 清理 → unlockScroll）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../test/client/setup.ts'
setupJsdom()
import { h } from '../ui-dom/vnode.ts'
import { mountRoot } from '../ui-dom/vdom/mount.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { DatePicker } from '../components/DatePicker/DatePicker.ts'
import { Modal } from '../components/Modal/Modal.ts'

const flush = () => new Promise(r => setTimeout(r, 30))

test('DatePicker 打开：portal 日历面板渲染（replaceChild 数组分支回归）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const handle = mountRoot({ root, browser: createClientBrowser() })
  const { ctx } = handle
  await handle.mount(h('div', {}, h(DatePicker, { mode: 'date', placeholder: '选择日期' })))
  await flush()

  const input = root.querySelector('.wf-datepicker-input') as HTMLElement
  assert.ok(input, 'input 已渲染')
  input.click()
  await ctx.ui.render()
  await flush()

  const dd = document.querySelector('.wf-datepicker-dropdown') as HTMLElement | null
  assert.ok(dd, 'DatePicker 日历面板应渲染到 portal（打开瞬间无 HierarchyRequestError）')
  assert.ok(dd.querySelector('.wf-datepicker-cell'), '面板应有日期格')
  // 坐标渲染：数字 style 必须带 px 单位（无单位值被浏览器忽略 → 面板定位丢失 → 打不开）
  assert.ok(dd.style.top && dd.style.top.endsWith('px'), '面板 top 应带 px 单位（style 数字加 px 回归）')
  assert.ok(dd.style.left && dd.style.left.endsWith('px'), '面板 left 应带 px 单位')
  handle.unmount()
})

test('Modal 关闭：滚动锁释放（body overflow 恢复——Portal 移除 ref 清理回归）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const handle = mountRoot({ root, browser: createClientBrowser() })
  const { ctx } = handle
  let open = false
  const App = async (_init: any, c: any) => () =>
    h('div', {},
      h('button', { id: 'open', onClick: () => { open = true; c.ui.render() } }, '打开'),
      h(Modal, { open, onClose: () => { open = false; c.ui.render() } }),
    )
  await handle.mount(h(App))
  await flush()

  assert.equal(document.body.style.overflow, '', '初始无滚动锁')
  ;(root.querySelector('#open') as HTMLElement).click()
  await ctx.ui.render()
  await flush()
  assert.equal(document.body.style.overflow, 'hidden', 'Modal 打开 → 滚动锁')

  // 关闭：点击遮罩（maskClosable 默认 true）
  const overlay = document.querySelector('.wf-modal-overlay') as HTMLElement
  overlay.click()
  await ctx.ui.render()
  await flush(50)
  // 退场动画：jsdom 无 CSS 动画引擎——手动触发 animationend（AGENTS.md §7.2）
  const modalEl = document.querySelector('.wf-modal') as HTMLElement
  modalEl?.dispatchEvent(new (window as any).Event('animationend'))
  await ctx.ui.render()
  await flush(50)
  assert.ok(!document.querySelector('.wf-modal'), 'Modal 已卸载')
  assert.equal(document.body.style.overflow, '', 'Modal 关闭 → 滚动锁释放（滑动条恢复）')
  handle.unmount()
})

// ── 数组 keyed diff 复用（v1 ensureKeys 位置 key 机制——迁移丢失回归） ──
test('混合 keyed 数组：无 key 项不重建（v1 ensureKeys 回归）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const handle = mountRoot({ root, browser: createClientBrowser() })
  const { ctx } = handle
  // 模拟 DatePicker 面板结构：[header(无key), weekdayRow(无key), ...gridRows(keyed)]
  let n = 0
  const Panel: any = async (_i: any, c: any) => () =>
    h('div', { class: 'panel' }, [
      h('button', { id: 'go', onClick: () => { n++; c.ui.render() } }, 'go'),
      h('div', { class: 'hdr', key: undefined }, `h${n}`),
      h('div', { class: 'wkd', key: undefined }, 'w'),
      h('div', { class: 'row', key: 'row-0' }, 'r0'),
      h('div', { class: 'row', key: 'row-1' }, 'r1'),
    ])
  await handle.mount(h(Panel))
  await flush()

  const hdr = root.querySelector('.hdr') as HTMLElement
  const wkd = root.querySelector('.wkd') as HTMLElement
  const row0 = root.querySelector('.row') as HTMLElement

  // 触发重渲染（按钮 → 组件内 render——内容变化，排除三态 skip 干扰）
  ;(root.querySelector('#go') as HTMLElement).click()
  await flush()

  assert.equal(root.querySelector('.hdr'), hdr, '无 key 的 header 应复用同一 DOM（位置 key 机制）')
  assert.equal(root.querySelector('.wkd'), wkd, '无 key 的 weekdayRow 应复用同一 DOM')
  assert.equal(root.querySelector('.row'), row0, 'keyed 项应复用')
  assert.equal(root.querySelector('.hdr')?.textContent, 'h1', 'header 内容应更新（patch 而非重建）')
  handle.unmount()
})

// ── datetime 选中日期：portal 面板复用（不重建——闪烁回归） ──
test('datetime 选中日期：portal 面板复用不重建', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const handle = mountRoot({ root, browser: createClientBrowser() })
  const { ctx } = handle
  await handle.mount(h('div', {}, h(DatePicker, { mode: 'datetime', placeholder: '日期+时间' })))
  await flush()

  ;(root.querySelector('.wf-datepicker-input') as HTMLElement).click()
  await flush()

  const dd1 = document.querySelector('.wf-datepicker-dropdown') as HTMLElement
  const overlay1 = document.querySelector('.wf-datepicker-overlay') as HTMLElement
  assert.ok(dd1, '面板已打开')

  // 选中一个日期格（非今日）
  const cell = document.querySelectorAll('.wf-datepicker-cell')[7] as HTMLElement
  cell.click()
  await flush()

  const dd2 = document.querySelector('.wf-datepicker-dropdown') as HTMLElement
  const overlay2 = document.querySelector('.wf-datepicker-overlay') as HTMLElement
  assert.equal(dd2, dd1, '选中日期后面板应复用同一 DOM（portal 不重建）')
  assert.equal(overlay2, overlay1, 'overlay 应复用')
  handle.unmount()
})

// ── v1 setProp/patchValue 对比遗漏（v1 引擎退役核对） ──
test('CSS 变量（--wf-*）对象 style + aria boolean（v1 setProp 对比）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const handle = mountRoot({ root, browser: createClientBrowser() })
  const { ctx } = handle
  await handle.mount(h('div', {}, h('div', { class: 't1', style: { '--wf-cols': 'repeat(2, 1fr)', color: 'red' }, 'aria-expanded': true } as any)))
  await flush()
  const el = root.querySelector('.t1') as HTMLElement
  assert.equal(el.style.getPropertyValue('--wf-cols'), 'repeat(2, 1fr)', 'CSS 变量 setProperty 生效')
  assert.equal(el.style.color, 'red')
  assert.equal(el.getAttribute('aria-expanded'), 'true', 'aria boolean 显式 true')
  handle.unmount()
})

test('select value 在 options 后设置 + 替换时旧 ref 清理', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const handle = mountRoot({ root, browser: createClientBrowser() })
  const { ctx } = handle
  await handle.mount(h('div', {}, h('select', { id: 'sel', value: 'b' } as any, [
    h('option', { value: 'a' } as any, 'A'),
    h('option', { value: 'b' } as any, 'B'),
  ])))
  await flush()
  assert.equal((root.querySelector('#sel') as HTMLSelectElement).value, 'b', 'select.value 在 options 后设置')

  // 替换（类型变化）：旧 ref(null) 调用
  let cleaned = 0
  await handle.mount(h('div', {}, h('span', { id: 'old', ref: () => { cleaned++ } } as any, 'x')))
  await flush()
  await handle.mount(h('div', {}, h('div', { id: 'new' } as any, 'y')))
  await flush()
  assert.equal(root.querySelector('#new')?.textContent, 'y', '新元素渲染')
  assert.equal(cleaned, 1, '类型替换旧 ref(null) 调用（v1 patchValue 行为）')
  handle.unmount()
})
