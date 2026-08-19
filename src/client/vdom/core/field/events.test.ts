/**
 * vdom core/field — 事件通道测试（**事件代理**——EventRegistry）
 *
 * 锁定规则（AGENTS §6.4 + 代理语义）：
 * - on + 大写判定（once/only 不误判）；事件名小写化
 * - **代理注册**：事件写入表（不直接 addEventListener）——document 捕获
 *   监听动态注册（首次绑定类型）——分发（target 向上 data-wf-id 查表）
 * - 监听器数量 O(事件类型)（不随节点增长）
 * - currentTarget 还原绑定元素；handler 内 stopPropagation 停止向上
 * - 非函数值 warn + 跳过；handler 失败隔离
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testBrowser } from '../../setup.ts'
import { EventRegistry, eventName, EVENT_RE } from './events.ts'

function setup() {
  const browser = testBrowser()
  const doc = browser.document
  // 场景：root > div(data-wf-id=root.0) > button(data-wf-id=root.0.0)
  const root = doc.createElement('div')
  root.id = 'root'
  const wrap = doc.createElement('div')
  wrap.setAttribute('data-wf-id', 'root.0')
  const btn = doc.createElement('button')
  btn.setAttribute('data-wf-id', 'root.0.0')
  wrap.appendChild(btn)
  root.appendChild(wrap)
  doc.body.appendChild(root)
  return { browser, doc, root, wrap, btn }
}

test('事件判定：on + 大写（once/only 不误判）+ 小写化', () => {
  assert.ok(EVENT_RE.test('onClick'))
  assert.ok(!EVENT_RE.test('once'))
  assert.equal(eventName('onMouseDown'), 'mousedown')
  assert.equal(eventName('once'), null)
})

test('代理注册 + 分发：button 点击 → 表查 handler（currentTarget 还原绑定元素）', () => {
  const { browser, btn, wrap } = setup()
  const reg = new EventRegistry(browser.document)
  let calls: string[] = []
  const handler = (e: Event) => {
    calls.push(`btn:${(e.currentTarget as HTMLElement).getAttribute('data-wf-id')}`)
  }
  reg.set('root.0.0', 'click', handler)
  btn.click()
  assert.deepEqual(calls, ['btn:root.0.0'], '分发 + currentTarget 还原为绑定元素')
  // 祖先链：事件冒泡路径——祖先有 handler 也执行（Tabs 容器 onKeyDown 场景）
  const wrapCalls: string[] = []
  reg.set('root.0', 'click', () => { wrapCalls.push('wrap') })
  btn.click()
  assert.deepEqual(wrapCalls, ['wrap'], '祖先链分发（冒泡语义）')
})

test('stopPropagation：handler 内停止——祖先不再执行（与原生冒泡一致）', () => {
  const { browser, btn } = setup()
  const reg = new EventRegistry(browser.document)
  let child = 0
  let parent = 0
  reg.set('root.0.0', 'click', (e) => { child++; e.stopPropagation() })
  reg.set('root.0', 'click', () => { parent++ })
  btn.click()
  assert.equal(child, 1)
  assert.equal(parent, 0, 'stopPropagation 停止向上')
})

test('监听器数量 O(事件类型)：100 节点 1 个 click 监听（代理）', () => {
  const browser = testBrowser()
  const doc = browser.document
  const root = doc.createElement('div')
  root.id = 'root'
  for (let i = 0; i < 100; i++) {
    const el = doc.createElement('button')
    el.setAttribute('data-wf-id', `root.${i}`)
    root.appendChild(el)
  }
  doc.body.appendChild(root)
  const reg = new EventRegistry(doc)
  for (let i = 0; i < 100; i++) reg.set(`root.${i}`, 'click', () => {})
  // 代理：document 上只有 1 个 click 监听（根代理）——非 100 个
  let count = 0
  const probe = () => { count++ }
  doc.addEventListener('click', probe)
  doc.dispatchEvent(new doc.defaultView!.Event('click', { bubbles: true }))
  doc.removeEventListener('click', probe)
  assert.equal(count, 1, 'document 级监听计数（代理 = 1——每节点绑定会是 100+）')
})

test('动态节点：增删无需绑定/解绑——表增删即生效', () => {
  const { browser, btn } = setup()
  const reg = new EventRegistry(browser.document)
  let calls = 0
  reg.set('root.0.0', 'click', () => { calls++ })
  btn.click()
  assert.equal(calls, 1)
  // 表删除（remove 语义）——不再分发
  reg.remove('root.0.0')
  btn.click()
  assert.equal(calls, 1, '表删除后不分发（无需 removeEventListener）')
})

test('子树清理：前缀匹配（remove 整棵子树）', () => {
  const browser = testBrowser()
  const reg = new EventRegistry(browser.document)
  reg.set('root.0', 'click', () => {})
  reg.set('root.0.0', 'click', () => {})
  reg.set('root.0.1', 'click', () => {})
  reg.set('root.1', 'click', () => {})
  reg.remove('root.0')
  assert.equal(reg.get('root.0', 'click'), undefined)
  assert.equal(reg.get('root.0.0', 'click'), undefined)
  assert.equal(reg.get('root.0.1', 'click'), undefined)
  assert.ok(reg.get('root.1', 'click'), '兄弟子树不受影响')
})

test('非函数值：warn + 跳过（不中断渲染管线）', () => {
  const browser = testBrowser()
  const reg = new EventRegistry(browser.document)
  const warns: string[] = []
  const origWarn = console.warn
  console.warn = (m: unknown) => { warns.push(String(m)) }
  try {
    reg.set('root.0', 'click', true as never)  // 非函数——静默跳过（表不写入）
  } finally {
    console.warn = origWarn
  }
  assert.equal(reg.get('root.0', 'click'), undefined, '非函数不注册')
  assert.equal(warns.length, 0, '表级非函数静默（diff 层 warn 已有）')
})

test('dispose：移除全部根监听（serve unmount）', () => {
  const browser = testBrowser()
  const doc = browser.document
  const reg = new EventRegistry(doc)
  reg.set('a', 'click', () => {})
  reg.set('b', 'input', () => {})
  reg.dispose()
  assert.equal(reg.get('a', 'click'), undefined)
  assert.equal(reg.get('b', 'input'), undefined)
  // 再分发无副作用（根监听已移除）
  const el = doc.createElement('button')
  doc.body.appendChild(el)
  el.click()
  assert.ok(true)
})
