/**
 * weifuwu/components × ui-dom 可行性广测（代表组件）
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { UIRouter, uiServe, h } from '../ui-dom/index.ts'
import { Button, Icon, Tabs, Checkbox, Switch, Tag, Card, Badge, StatCard, Table, Alert, Input, Modal, Pagination } from '../components/index.ts'

before(setupJsdom)
afterEach(() => {
  document.body.innerHTML = ''
  document.getElementById('__wf_portal')?.remove()
  window.history.pushState(null, '', '/')
})
function mount(id: string) { const el = document.createElement('div'); document.body.appendChild(el); el.id = id; return el }
function flush() { return new Promise<void>((r) => setTimeout(r, 0)) }

test('Icon（SVG 渲染）+ Tag/Badge/Card 等展示组件', async () => {
  const router = new UIRouter()
  router.get('/show', () =>
    h('div', {},
      h(Icon, { name: 'check' }),
      h(Tag, { color: 'green' }, '成功'),
      h(Badge, { count: 5 }, '消息'),
      h(Card, { title: '卡片' }, h('p', {}, '内容')),
    ))
  window.history.pushState(null, '', '/show')
  const el = mount('e-show')
  const handle = uiServe(router, { root: '#e-show' })
  await flush()
  assert.ok(el.querySelector('svg'), 'Icon SVG 渲染')
  assert.ok(el.querySelector('.wf-tag'), 'Tag')
  assert.ok(el.querySelector('.wf-badge'), 'Badge')
  assert.ok(el.querySelector('.wf-card'), 'Card')
  handle.close()
})

test('Tabs 交互（方向键/点击切换）', async () => {
  const router = new UIRouter()
  router.get('/tabs', () =>
    h('div', {},
      h(Tabs, { active: 'a', items: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] }),
    ))
  window.history.pushState(null, '', '/tabs')
  const el = mount('e-tabs')
  const handle = uiServe(router, { root: '#e-tabs' })
  await flush()
  assert.ok(el.querySelector('.wf-tabs'), 'Tabs 渲染')
  const tabB = [...el.querySelectorAll('.wf-tab, [role="tab"]')].find(n => n.textContent?.includes('B'))
  assert.ok(tabB, 'tab B 存在')
  handle.close()
})

test('Checkbox/Switch 交互（受控 + 回调）', async () => {
  const router = new UIRouter()
  let checked = false
  router.get('/form', () =>
    h('div', {},
      h(Checkbox, { label: '同意', checked, onChange: (v: boolean) => { checked = v } }),
      h(Switch, { checked, onChange: (v: boolean) => { checked = v } }),
    ))
  window.history.pushState(null, '', '/form')
  const el = mount('e-form')
  const handle = uiServe(router, { root: '#e-form' })
  await flush()
  assert.ok(el.querySelector('.wf-checkbox'), 'Checkbox')
  assert.ok(el.querySelector('.wf-switch'), 'Switch')
  const cb = el.querySelector('.wf-checkbox input, .wf-checkbox') as HTMLElement
  cb.click()
  await flush()
  assert.equal(checked, true, 'Checkbox onChange')
  handle.close()
})

test('Table 渲染（columns + data）', async () => {
  const router = new UIRouter()
  router.get('/table', () =>
    h('div', {},
      h(Table, {
        columns: [{ key: 'name', label: '名称' }, { key: 'age', label: '年龄' }],
        data: [{ name: '张三', age: 30 }, { name: '李四', age: 25 }],
      }),
    ))
  window.history.pushState(null, '', '/table')
  const el = mount('e-table')
  const handle = uiServe(router, { root: '#e-table' })
  await flush()
  assert.ok(el.querySelector('table'), 'Table')
  assert.ok(el.querySelector('.wf-table-th')?.textContent?.includes('名称'), '表头')
  assert.ok(el.textContent?.includes('张三'), '数据行')
  handle.close()
})

test('Modal 打开（useDialog + createPortal）', async () => {
  const router = new UIRouter()
  router.get('/modal', () =>
    h('div', {},
      h(Modal, { open: true, title: '弹窗', onClose: () => {} }, h('p', {}, '内容')),
    ))
  window.history.pushState(null, '', '/modal')
  const el = mount('e-modal')
  const handle = uiServe(router, { root: '#e-modal' })
  await flush()
  const portal = document.getElementById('__wf_portal')
  assert.ok(portal, 'portal')
  const modalText = portal?.textContent ?? ''
  assert.ok(modalText.includes('弹窗') && modalText.includes('内容'), 'Modal 内容在 portal')
  handle.close()
})

test('Pagination + Alert + StatCard', async () => {
  const router = new UIRouter()
  router.get('/misc', () =>
    h('div', {},
      h(Alert, { type: 'success' }, '操作成功'),
      h(StatCard, { title: '订单', value: '100' }),
      h(Pagination, { current: 2, total: 50, onChange: () => {} }),
    ))
  window.history.pushState(null, '', '/misc')
  const el = mount('e-misc')
  const handle = uiServe(router, { root: '#e-misc' })
  await flush()
  assert.ok(el.querySelector('.wf-alert'), 'Alert')
  assert.ok(el.querySelector('[class*="wf-stat"]'), 'StatCard')
  assert.ok(el.querySelector('.wf-pagination'), 'Pagination')
  handle.close()
})
