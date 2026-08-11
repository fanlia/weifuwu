// vdom 引擎回归测试（真实浏览器/组件报告的问题——TDD 固化）
// 1. DatePicker 打开 → portal 面板渲染（数组分支 replaceChild HierarchyRequestError）
// 2. Modal 关闭 → 滚动锁释放（Portal 移除时 ref(null) 清理 → unlockScroll）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../test/client/setup.ts'
setupJsdom()
import { h, createPortal } from '../ui-dom/vnode.ts'
import { mountRoot } from '../ui-dom/vdom/mount.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { DatePicker } from '../components/DatePicker/DatePicker.ts'
import { Modal } from '../components/Modal/Modal.ts'
import { Command } from '../components/Command/Command.ts'
import { Dropdown } from '../components/Dropdown/Dropdown.ts'

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

// ── portal keyed 复用（v1 getKey 语义——Editor table tool hover 闪烁回归） ──
test('混合 keyed 数组含 portal：portal 复用容器（getKey remote 语义）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const handle = mountRoot({ root, browser: createClientBrowser() })
  const { ctx } = handle
  let hover = -1
  const App: any = async (_i: any, c: any) => () =>
    h('div', {}, [
      h('button', { key: 'btn' } as any, '触发'),
      hover >= 0
        ? createPortal(h('div', { class: 'portal-content', id: 'pc' }, [
            h('div', { class: 'row', key: 'r0' } as any, String(hover)),
          ]), 'test-portal')
        : null,
    ])
  await handle.mount(h(App))
  await flush()
  assert.ok(!root.querySelector('#pc'), '初始无 portal')

  // 打开 portal（hover 首次）
  hover = 0
  await handle.rerender()
  await flush()
  const pc = document.querySelector('#pc') as HTMLElement
  assert.ok(pc, 'portal 渲染')
  const row = pc.querySelector('.row')

  // hover 更新（portal 内容 patch——容器/内容复用）
  hover = 5
  await handle.rerender()
  await flush()
  const pc2 = document.querySelector('#pc') as HTMLElement
  assert.equal(pc, pc2, 'portal 容器复用（getKey remote 语义）')
  assert.equal(pc2.querySelector('.row'), row, 'portal 内容复用')
  assert.equal(pc2.querySelector('.row')?.textContent, '5', '内容 patch 更新')
  handle.unmount()
})

test('DatePicker 选中日期：父组件 render + 组件内部 render 竞态不复制 DOM（全局渲染互斥）', async () => {
  // 场景：DemoDatePicker（容器）里 onChange 触发自身 render；DatePicker 内部 setOpen(false)
  // 也触发自身 render——两个不同 id 的 renderByIds 并发。v2 async buildVNode 在
  // 「新 vnode 已注册但 _child 未设」的中间态 yield → 抢跑的 renderByIds 读到 oldChild
  // undefined → patchValue 走 insertBefore 新增分支 → 同一组件 DOM 被复制。
  // v1 同步渲染天然串行；v2 需要全局互斥锁恢复串行语义。
  setupJsdom()
  const root = document.createElement('div')
  document.body.appendChild(root)

  let result = ''
  const Demo = (_init: any, ctx: any) => (_p: any) =>
    h('div', { class: 'demo' }, [
      h('div', { class: 'dp-wrap' }, h(DatePicker, {
        mode: 'date',
        placeholder: '选择日期',
        onChange: (v: string) => { result = v; ctx.ui.render() },
      })),
      result ? h('div', { class: 'result' }, `已选: ${result}`) : null,
    ].filter(Boolean))

  const handle = mountRoot({ root, browser: createClientBrowser() })
  await handle.mount(h('div', {}, h(Demo, {})))
  await flush()

  // 打开面板
  const input = root.querySelector('input[placeholder="选择日期"]') as HTMLInputElement
  assert.ok(input, 'DatePicker input 已渲染')
  input.dispatchEvent(new (window as any).MouseEvent('click', { bubbles: true }))
  await flush()
  const dpOpen = document.querySelectorAll('.wf-datepicker').length
  assert.equal(dpOpen, 1, '初始 1 个 DatePicker')

  // 选中日期（onChange + setOpen(false) 双 render 竞争）
  const dropdown = document.querySelector('.wf-datepicker-dropdown')
  const cells = [...document.querySelectorAll('.wf-datepicker-cell')]
  const cell = cells.find(c => !c.classList.contains('disabled') && c.textContent.trim() && !isNaN(+c.textContent.trim())) as HTMLElement
  assert.ok(dropdown, '面板已打开')
  cell.dispatchEvent(new (window as any).MouseEvent('click', { bubbles: true }))
  await flush()
  await flush()

  const after = document.querySelectorAll('.wf-datepicker').length
  assert.equal(after, 1, `选中日期后仍 1 个 DatePicker（实际 ${after}——修复前 insertBefore 复制）`)
  assert.equal(document.querySelector('.result')?.textContent, `已选: ${result}`, 'demo result 更新')
  handle.unmount()
})

test('事件绑定不累积：渲染后 onClick 只触发一次（patchProps remove+add 回归）', async () => {
  // 复现：受控组件每次渲染新 onClick 引用 → patchProps remove(旧)+add(新)。
  // 若 remove 失效（实际绑定的 handler 未移除），监听累积 → 点击一次触发多次。
  // 浏览器实测：Rate 第二次点击触发 2 次 onChange（每次交互累积一个监听）。
  setupJsdom()
  const root = document.createElement('div')
  document.body.appendChild(root)

  let value = 0
  let onChangeCount = 0
  const Clicks = (_init: any, ctx: any) => (_p: any) =>
    h('div', {}, h('button', {
      class: 'wf-rate-star',  // 触发 patchProps 的 on 分支
      onClick: () => { onChangeCount++; ctx.ui.render() },  // 每次渲染新引用
    }, 'star'))

  const handle = mountRoot({ root, browser: createClientBrowser() })
  await handle.mount(h('div', {}, h(Clicks, {})))
  await flush()

  const btn = root.querySelector('button') as HTMLElement
  // 第一次点击
  btn.dispatchEvent(new (window as any).MouseEvent('click', { bubbles: true }))
  await flush()
  assert.equal(onChangeCount, 1, `第一次点击触发 1 次（实际 ${onChangeCount}）`)

  // 第二次点击（渲染已发生——若 remove 失效则多一个监听）
  btn.dispatchEvent(new (window as any).MouseEvent('click', { bubbles: true }))
  await flush()
  assert.equal(onChangeCount, 2, `第二次点击仍触发 1 次——总 ${onChangeCount}（累积则 >2）`)

  // 第三次
  btn.dispatchEvent(new (window as any).MouseEvent('click', { bubbles: true }))
  await flush()
  assert.equal(onChangeCount, 3, `第三次点击总 ${onChangeCount}（累积则 >3）`)
  void value
  handle.unmount()
})


test('组件输出 Portal → null：props 变化关闭清理（usePopup mask 组件同款——Command 点遮罩不关闭回归）', async () => {
  // 场景：组件 open 时输出 createPortal（mask 面板），props 变化（open=false）→ 输出 null。
  // scheduler 渲染组件（props 变化 → renderFn 重跑 → 新输出 null）→ patchValue 对比
  // 旧 _child（Portal）vs 新（null）→ 必须清理 remote 容器。
  // 修复前：Command 点遮罩后 portal DOM 残留 #__wf_portal + 面板不消失（真实 bug）
  setupJsdom()
  const root = document.createElement('div')
  document.body.appendChild(root)
  let show = true
  const Demo = async (_init: any) => () => {
    if (show) return createPortal(h('div', { class: 'pp' }, 'P'), 't')
    return null
  }
  const Outer = async (_init: any, ctx: any) => () =>
    h('div', {}, [
      h('button', { class: 'close', onClick: () => { show = false; ctx.ui.render() } }, '关'),
      h(Demo, { show }), // 受控 props——变化触发重渲染
    ])
  const handle = mountRoot({ root, browser: createClientBrowser() })
  await handle.mount(h('div', {}, h(Outer, {})))
  await flush()
  assert.ok(document.querySelector('.pp'), 'portal 内容渲染')

  ;(root.querySelector('.close') as HTMLElement).click()
  await flush()
  await flush()
  assert.ok(!document.querySelector('.pp'), '关闭后 portal 内容移除（无残留）')
  assert.equal(document.querySelector('#__wf_portal')?.children.length ?? 0, 0, 'portal 容器清空')
  handle.unmount()
})


test('组件卸载：打开的 mask 弹窗（Command）→ portal 清空 + document 监听退订', async () => {
  // 生产路径（scheduler 驱动）：父组件状态变化移除子组件（含打开中的 mask 弹窗）——
  // 引擎必须清理 portal remote（mask+panel）并触发卸载钩子（document 监听退订）。
  // 注意：mountRoot.rerender 是三态 skip 抵消 force 的测试辅助（mount.ts 注释明示），
  // 不反映生产路径——必须用 scheduler render（props 变化）验证
  setupJsdom()
  const root = document.createElement('div')
  document.body.appendChild(root)
  let showCmd = true
  const Demo = async (_init: any, ctx: any) => () =>
    h('div', {}, [
      h('button', { class: 'rm', onClick: () => { showCmd = false; ctx.ui.render() } }, '移除'),
      showCmd ? h(Command, { items: [{ key: 'a', label: 'A' }], open: true }) : null,
    ])
  const handle = mountRoot({ root, browser: createClientBrowser() })
  await handle.mount(h('div', {}, h(Demo, {})))
  await flush()
  assert.ok(document.querySelector('.wf-popup-mask'), 'mask 渲染（Command 打开）')

  ;(root.querySelector('.rm') as HTMLElement).click()
  await flush()
  await flush()
  assert.ok(!document.querySelector('.wf-popup-mask'), '移除后 mask 消失')
  assert.equal(document.querySelector('#__wf_portal')?.children.length ?? 0, 0, 'portal 清空（mask+panel 清理）')
  handle.unmount()
})

test('usePopup 组件卸载后 document 监听退订（mousedown/Escape 不再触发）', async () => {
  // usePopup 的 document mousedown/keydown 监听经 onUnmount 退订——组件销毁后
  // 外部点击/Escape 不得再触发 onOpenChange（无此清理 → 卸载后点击仍开关幽灵弹窗）
  setupJsdom()
  const root = document.createElement('div')
  document.body.appendChild(root)
  let show = true
  let onOpenChangeCount = 0
  const Demo = async (_init: any, ctx: any) => () =>
    h('div', {}, [
      h('button', { class: 'rm', onClick: () => { show = false; ctx.ui.render() } }, '移除'),
      show
        ? h(Dropdown, { trigger: 'click', items: [{ key: 'a', label: 'A' }], open: false, onOpenChange: () => { onOpenChangeCount++ } })
        : null,
    ])
  const handle = mountRoot({ root, browser: createClientBrowser() })
  await handle.mount(h('div', {}, h(Demo, {})))
  await flush()
  ;(root.querySelector('.rm') as HTMLElement).click()
  await flush()
  await flush()
  document.dispatchEvent(new (window as any).MouseEvent('mousedown', { bubbles: true }))
  document.dispatchEvent(new (window as any).KeyboardEvent('keydown', { key: 'Escape' }))
  await flush()
  assert.equal(onOpenChangeCount, 0, '卸载后 document 监听退订（不触发 onOpenChange）')
  handle.unmount()
})
