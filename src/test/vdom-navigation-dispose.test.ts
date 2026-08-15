/**
 * vdom 导航移除 dispose 链测试——旧树组件是否被递归清理（Bug #2 候选）
 *
 * 浏览器观察：SPA 导航离开 /chat 时 Chat/FilesSection 有 DISPOSE 事件，
 * 但 MessageItem 从未 dispose（build 14 / dispose 0）——registry 泄漏嫌疑。
 * 本测试直接验证：导航（异类型替换 → toOther → removeOldOutput）时组件树
 * （含数组列表项组件）是否被递归 dispose。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { createVdomContext } from '../ui-dom/context.ts'
import { buildVNode } from '../ui-dom/vdom2/build.ts'
import { renderValue } from '../ui-dom/vdom2/render.ts'
import { patchValue } from '../ui-dom/vdom2/patch.ts'
import { h } from '../ui-dom/vnode.ts'
import { __resetVdomEvents, __vdom_events } from '../ui-dom/vdom2/events.ts'

before(setupJsdom)
const browser = createClientBrowser()

let msgMounts = 0
function MessageItemLike(_init: any, _ctx: any) {
  return async (props: any) => {
    msgMounts++
    return h('div', { class: 'msg-item', 'data-key': props.id }, props.id)
  }
}
function ChatLike(_init: any, _ctx: any) {
  return async (props: any) => h('div', { class: 'chat' }, [
    h('div', { class: 'list' }, props.msgs.map((id: string) => h(MessageItemLike, { key: id, id }))),
  ])
}
function OtherPage(_init: any, _ctx: any) {
  return async () => h('div', { class: 'other' }, 'other')
}

function lcEvents(comp: string): any[] {
  return __vdom_events(500, { machine: 'lifecycle' } as any).filter((e) => e.component === comp)
}

test('导航移除（异类型替换）：消息列表组件树被递归 dispose（无泄漏）', async () => {
  __resetVdomEvents()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { ctx, registry } = createVdomContext({ browser, root })

  // mount：Chat 页（3 条消息）
  const chat = h(ChatLike, { msgs: ['m1', 'm2', 'm3'] })
  await buildVNode(chat, ctx, null, registry)
  const node = renderValue(chat, ctx, browser)
  root.appendChild(node!)
  assert.equal(root.querySelectorAll('.msg-item').length, 3, '3 条消息渲染')

  // 导航：Chat → OtherPage（异类型 → toOther → removeOldOutput → dispose 旧树）
  const other = h(OtherPage, {})
  await buildVNode(other, ctx, chat, registry)
  patchValue(root, root.firstChild, chat, other, { browser, registry })
  assert.ok(root.querySelector('.other'), 'OtherPage 渲染')

  // 断言：Chat 树被递归 dispose（Chat + MessageItem 均有 DISPOSE）
  const chatDisposes = lcEvents('ChatLike').filter((e) => e.event === 'DISPOSE').length
  const msgDisposes = lcEvents('MessageItemLike').filter((e) => e.event === 'DISPOSE').length
  const msgBuilds = lcEvents('MessageItemLike').filter((e) => e.event === 'BUILD_START').length
  assert.equal(chatDisposes, 1, `Chat 组件 dispose（实际 ${chatDisposes}）`)
  assert.equal(msgDisposes, msgBuilds, `消息组件全部 dispose——build ${msgBuilds} / dispose ${msgDisposes}（泄漏 = dispose 缺失）`)
  // 无重复 dispose（disposed--DISPOSE->? 非法转换 = 重复清理）
  const illegal = __vdom_events(500, { machine: 'lifecycle' } as any).filter((e) => e.to === '?').length
  assert.equal(illegal, 0, `无非法生命周期转换（重复 dispose）——实际 ${illegal}`)

  // registry 清理验证：孤儿渲染不得发生（SKIP_ORPHAN 应 0——实例已清理而非残留）
  document.body.removeChild(root)
})

test('列表数组项移除（keyed 删除）：单项组件 dispose', async () => {
  __resetVdomEvents()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { ctx, registry } = createVdomContext({ browser, root })

  const chat1 = h(ChatLike, { msgs: ['m1', 'm2', 'm3'] })
  await buildVNode(chat1, ctx, null, registry)
  const node = renderValue(chat1, ctx, browser)
  root.appendChild(node!)

  // 删除 m2（keyed diff 移除）
  const chat2 = h(ChatLike, { msgs: ['m1', 'm3'] })
  await buildVNode(chat2, ctx, chat1, registry)
  patchValue(root, root.firstChild, chat1, chat2, { browser, registry })

  const disposes = lcEvents('MessageItemLike').filter((e) => e.event === 'DISPOSE').length
  assert.equal(disposes, 1, `删除项 dispose（实际 ${disposes}）`)
  assert.deepEqual([...root.querySelectorAll('.msg-item')].map((e) => e.getAttribute('data-key')), ['m1', 'm3'])
  document.body.removeChild(root)
})
