/**
 * 流式推送渲染回归测试——模拟 Chat 场景（ws wf:token → 组件 $ msgs 深赋值 content）
 *
 * 背景：agent-platform Chat 流式输出只显示前 3 字（"今天是"），刷新后完整。
 * 客户端 ws 已收到完整内容——验证组件 $ msgs 深赋值每次 token 是否触发 UI 更新。
 * 用组件内回调（模拟 ws onMessage 闭包捕获组件级 $）——与真实 Chat 一致。
 */
import { test, afterEach, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { UIRouter, uiServe, h } from '../ui-dom/index.ts'

before(setupJsdom)

afterEach(() => {
  createClientBrowser().clearBody()
  createClientBrowser().navigate('/')
})

function flush() {
  return new Promise<void>((r) => setTimeout(r, 0))
}

test('流式推送：组件 $ msgs 深赋值 content 每次 token 都触发渲染（UI 持续更新）', async () => {
  const b = createClientBrowser()
  const renderLog: string[] = []
  // 模拟 Chat：mount 时注册 ws onMessage（闭包捕获组件级 $）——真实 Chat 模式
  const Chat = (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    $.msgs = []
    // 模拟 ws onMessage 回调（Chat.tsx 的 ctx.ws.onMessage → m.content += text）
    const onToken = (text: string) => {
      // 首 token 前先有占位消息（Chat 的 ai_draft/new_message 创建空消息）
      let m = $.msgs.find((x: any) => x.id === 'm1')
      if (!m) { $.msgs.push({ id: 'm1', content: '', status: 'generating' }); m = $.msgs.find((x: any) => x.id === 'm1') }
      if (m) m.content += text
    }
    ;(globalThis as any).__chatOnToken = onToken
    return () => {
      renderLog.push($.msgs.map((m: any) => m.content).join(''))
      return h('div', { id: 'chat' }, $.msgs.map((m: any) => h('p', { key: m.id }, m.content)))
    }
  }
  const router = new UIRouter()
  router.get('/', () => h(Chat, {}))
  b.navigate('/')
  const el = b.createElement('div')
  b.bodyAppend(el)
  el.id = 'stream-root'
  const handle = uiServe(router, { root: '#stream-root' })
  await flush()

  // 初始：空 msgs（先推送占位消息——Chat 的 ai_draft/new_message 创建）
  const push = (globalThis as any).__chatOnToken as (t: string) => void
  assert.equal(typeof push, 'function', '组件 onToken 已注册')

  // 推送 3 个 token（"今" "天" "是"——用户场景停在此）
  const tokens1 = ['今', '天', '是']
  for (const t of tokens1) { push(t); await flush() }
  assert.equal(el.querySelector('#chat')?.textContent, '今天是', '3 个 token 后 UI 显示"今天是"')

  // 继续推送（完整内容——用户场景刷新后才显示）
  const tokens2 = ['几', '号', '？', '我', '不', '知', '道']
  for (const t of tokens2) { push(t); await flush() }
  assert.equal(el.querySelector('#chat')?.textContent, '今天是几号？我不知道', '所有 token 后 UI 显示完整内容（每次 token 都渲染）')

  // 渲染次数：初始 1 + 每次 token 1（+ 首 token 可能合并）——至少与 token 数相当
  assert.ok(renderLog.length >= tokens1.length + tokens2.length, `每次 token 都触发渲染（实际 ${renderLog.length} 次）`)
  handle.close()
})


test('流式推送：渲染进行中 token 到达（isRendering 拦截）→ pendingDirty 不丢——最终 UI 完整', async () => {
  const b = createClientBrowser()
  const Chat = (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    $.msgs = []
    const onToken = (text: string) => {
      let m = $.msgs.find((x: any) => x.id === 'm1')
      if (!m) { $.msgs.push({ id: 'm1', content: '' }); m = $.msgs.find((x: any) => x.id === 'm1') }
      if (m) m.content += text
    }
    ;(globalThis as any).__chatOnToken2 = onToken
    return () => {
      // 渲染 200 个节点——延长渲染时间，制造"渲染中 token 到达"窗口
      return h('div', { id: 'chat2' },
        $.msgs.map((m: any) => h('p', { key: m.id }, m.content)),
        ...Array.from({ length: 200 }, (_, i) => h('span', { key: 'x' + i }, String(i))),
      )
    }
  }
  const router = new UIRouter()
  router.get('/', () => h(Chat, {}))
  b.navigate('/')
  const el = b.createElement('div')
  b.bodyAppend(el)
  el.id = 'stream-root2'
  const handle = uiServe(router, { root: '#stream-root2' })
  await flush()

  const push = (globalThis as any).__chatOnToken2 as (t: string) => void
  // 快速连续推送（同一 tick 多个 token——渲染未完成窗口）
  push('今'); push('天'); push('是'); push('几'); push('号'); push('！')
  // 不 await 中间——立即再推（渲染微任务未消化）
  await Promise.resolve()
  push('完'); push('整')
  await flush()
  // 最终 UI 必须完整（渲染期 dirty 经 pendingDirty 补渲染——不丢 token）
  const text = el.querySelector('#chat2')?.textContent ?? ''
  assert.ok(text.includes('今天是几号！完整'), `渲染期 token 不丢——UI 完整（实际: ${text.slice(0, 20)}）`)
  handle.close()
})
