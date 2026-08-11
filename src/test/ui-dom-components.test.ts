/**
 * weifuwu/ui-dom 自定义组件可行性验证（components 风格，用 ui-dom VDOM）
 *
 * 验证 ui-dom 复制的渲染运行时（render/diff/createUi）能支撑 components 风格的
 * 两阶段组件：事件绑定 / class / 组件级 $ / createPortal / usePopup 弹层 /
 * 受控输入。全部用 ui-dom 的 h + Component 模型，不依赖 weifuwu/components。
 */

import { test, afterEach, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { UIRouter, uiServe, h, createPortal } from '../ui-dom/index.ts'
import type { Component, WfuiContext } from '../ui-dom/index.ts'
const browser = createClientBrowser()

before(setupJsdom)

afterEach(() => {
  browser.clearBody()
  browser.byId('__wf_portal')?.remove()
  browser.navigate('/')
})

function mount(id: string): HTMLDivElement {
  const el = browser.createElement('div')
  browser.bodyAppend(el)
  el.id = id
  return el
}

function flush() {
  return new Promise<void>((r) => setTimeout(r, 0))
}

// ═══════════════════════════════════════════════════════
// Button 风格（components 结构：variant class + onClick + children）
// ═══════════════════════════════════════════════════════

interface MyButtonProps {
  variant?: 'primary' | 'danger'
  size?: 'sm' | 'md'
  disabled?: boolean
  onClick?: (e: MouseEvent) => void
  children?: any
}

const MyButton: Component<MyButtonProps> = async (_init, ctx) =>
  (props) => {
    const cls = [
      'my-btn',
      `my-btn--${props.variant ?? 'primary'}`,
      props.size && `my-btn--${props.size}`,
      props.disabled && 'my-btn--disabled',
    ].filter(Boolean).join(' ')
    return h('button', {
      class: cls,
      type: 'button',
      disabled: props.disabled || undefined,
      onClick: props.onClick,
    }, props.children)
  }

test('MyButton：class 拼接 + 事件绑定 + children', async () => {
  const router = new UIRouter()
  let clicked = 0
  router.get('/btn', () =>
    h('div', {},
      h(MyButton, { variant: 'danger', size: 'sm', onClick: () => clicked++ }, '删除'),
      h(MyButton, { disabled: true }, '禁用'),
    ))
  browser.navigate('/btn')
  const el = mount('ui-btn')
  const handle = uiServe(router, { root: '#ui-btn' })
  await flush()
  const btns = el.querySelectorAll('button')
  assert.equal(btns.length, 2)
  assert.ok(btns[0].className.includes('my-btn--danger') && btns[0].className.includes('my-btn--sm'), 'variant/size class')
  assert.equal(btns[0].textContent, '删除')
  assert.ok(btns[1].disabled, 'disabled 属性')
  btns[0].click()
  await flush()
  assert.equal(clicked, 1, 'onClick 触发')
  handle.close()
})

// ═══════════════════════════════════════════════════════
// Counter 风格（组件级 $ 状态——点击重渲染本组件）
// ═══════════════════════════════════════════════════════

const Counter: Component = async (_init, ctx) => {
  const $ = ctx.ui.$()
  $.count = 0
  return (props) =>
    h('div', { class: 'counter' },
      h('span', { class: 'counter-val' }, String($.count)),
      h('button', { class: 'counter-inc', onClick: () => { $.count++ } }, '+'),
    )
}

test('Counter：组件级 $ 点击重渲染（仅本组件）', async () => {
  const router = new UIRouter()
  let handlerRuns = 0
  router.get('/counter', async (location, ctx) => {
    handlerRuns++
    return h('div', {},
      h('p', { class: 'title' }, '计数'),
      h(Counter), h(Counter),
    )
  })
  browser.navigate('/counter')
  const el = mount('ui-counter')
  const handle = uiServe(router, { root: '#ui-counter' })
  await flush()
  assert.equal(handlerRuns, 1)
  const vals = el.querySelectorAll('.counter-val')
  assert.equal(vals[0].textContent, '0')
  ;(el.querySelector('.counter-inc') as HTMLElement).click()
  await flush()
  assert.equal(el.querySelectorAll('.counter-val')[0].textContent, '1', '第一个计数更新')
  assert.equal(el.querySelectorAll('.counter-val')[1].textContent, '0', '第二个不动')
  assert.equal(handlerRuns, 1, 'handler 不重跑')
  handle.close()
})

// ═══════════════════════════════════════════════════════
// Input 风格（受控 value + onInput）
// ═══════════════════════════════════════════════════════

interface MyInputProps {
  value?: string
  onInput?: (v: string) => void
  placeholder?: string
  id?: string
}

const MyInput: Component<MyInputProps> = async (_init, ctx) =>
  (props) => {
    const $ = ctx.ui.$()
    $.text = props.value ?? '' // 内部输入态（不依赖受控回流）
    return h('input', {
      id: props.id,
      class: 'my-input',
      type: 'text',
      value: props.value ?? '',
      placeholder: props.placeholder,
      onInput: (e: Event) => {
        const v = (e.target as HTMLInputElement).value
        $.text = v
        props.onInput?.(v)
      },
    })
  }

test('MyInput：受控 value + onInput', async () => {
  const router = new UIRouter()
  let val = ''
  router.get('/input', () =>
    h('div', {}, h(MyInput, { id: 'mi', value: val, onInput: (v) => { val = v } })))
  browser.navigate('/input')
  const el = mount('ui-input')
  const handle = uiServe(router, { root: '#ui-input' })
  await flush()
  const input = el.querySelector('#mi') as HTMLInputElement
  assert.ok(input, 'input 渲染')
  input.value = 'hello'
  input.dispatchEvent(new (window as any).Event('input', { bubbles: true }))
  await flush()
  assert.equal(val, 'hello', 'onInput 回调')
  assert.equal(input.value, 'hello', '输入保留（未回流重置）')
  handle.close()
})

// ═══════════════════════════════════════════════════════
// Dropdown 风格（usePopup + createPortal——弹层纪律 §5.4）
// ═══════════════════════════════════════════════════════

const MyDropdown: Component<{ label: string; items: string[]; onSelect?: (s: string) => void }> = (_init, ctx) => {
  let open = false
  let wrapEl: HTMLElement | undefined
  const popup = ctx.ui.usePopup!({
    trigger: 'click',
    el: () => wrapEl,
    isOpen: () => open,
    setOpen: (v) => { open = v; ctx.ui.render() },
    width: 160,
  })
  const wrapRef = async (el: any) => { wrapEl = el ?? undefined }
  return (props) =>
    h('div', { class: 'dd-wrap', ref: wrapRef, ...popup.wrapProps },
      h('button', { class: 'dd-btn', id: 'dd-btn', onClick: () => popup.setOpen(!open) }, props.label),
      open ? popup.portal(h('div', { class: 'dd-panel' },
        ...props.items.map((it) =>
          h('div', { class: 'dd-item', onClick: () => { props.onSelect?.(it); popup.setOpen(false) } }, it),
        ),
      ), 'dd-panel') : null,
    )
}

test('MyDropdown：usePopup + createPortal 弹层', async () => {
  const router = new UIRouter()
  let selected = ''
  router.get('/dd', () =>
    h('div', { id: 'page' },
      h(MyDropdown, { label: '菜单', items: ['编辑', '删除'], onSelect: (s) => { selected = s } }),
    ))
  browser.navigate('/dd')
  const el = mount('ui-dd')
  const handle = uiServe(router, { root: '#ui-dd' })
  await flush()
  // 打开
  ;(el.querySelector('#dd-btn') as HTMLElement).click()
  await flush()
  const portal = browser.byId('__wf_portal')
  assert.ok(portal, 'portal 容器（弹层纪律 §5.4）')
  const panel = portal?.querySelector('.dd-panel')
  assert.ok(panel, '面板在 portal')
  assert.ok(panel?.textContent?.includes('编辑'), '面板内容')
  // 选择
  const items = panel?.querySelectorAll('.dd-item')
  assert.ok(items && items.length === 2, '两个菜单项')
  ;(items![1] as HTMLElement).click()
  await flush()
  assert.equal(selected, '删除', 'onSelect 触发')
  // 选择后关闭
  assert.ok(!browser.byId('__wf_portal')?.querySelector('.dd-panel') || !panel?.isConnected, '选择后面板关闭')
  handle.close()
})

// ═══════════════════════════════════════════════════════
// 异步 handler + 组件组合（完整场景）
// ═══════════════════════════════════════════════════════

test('完整场景：async handler 取数 + 组件组合', async () => {
  const router = new UIRouter()
  router.get('/page/:id', async (location, ctx) => {
    const data = await ctx.data.get(`/api/page/${ctx.params.id}`, async () => ({ title: '页面', count: 3 }))
    return h('div', { class: 'page' },
      h('h1', { class: 'page-title' }, (data as any).title),
      h('p', {}, `id: ${ctx.params.id}`),
      h(Counter),
      h(MyButton, { variant: 'primary', onClick: () => { (window as any).__pageBtn = true } }, '操作'),
    )
  })
  browser.navigate('/page/9')
  const el = mount('ui-page')
  const handle = uiServe(router, { root: '#ui-page' })
  await flush()
  assert.equal(el.querySelector('.page-title')?.textContent, '页面')
  assert.ok(el.querySelector('.page')?.textContent?.includes('id: 9'), 'params 注入')
  // 组件组合交互
  ;(el.querySelector('.counter-inc') as HTMLElement).click()
  await flush()
  assert.equal(el.querySelector('.counter-val')?.textContent, '1')
  // 导航到新路由（组件卸载清理）
  router.get('/other', () => h('div', { class: 'other' }, '其他'))
  browser.navigate('/other')
  ;(window as any).dispatchEvent(new PopStateEvent('popstate'))
  await flush()
  assert.ok(el.querySelector('.other'), '导航成功')
  assert.ok(!el.querySelector('.counter'), '旧组件卸载')
  handle.close()
})
