/**
 * 回归测试——Chat 流式输出停更（agent-platform 真实 bug）
 *
 * 症状：AI 流式输出 token 只渲染了开头（如"今天是"），后续 token 全部不更新；
 *       刷新页面后从 DB 读到完整消息（DB 更新了，前端 DOM 没跟上）。
 *
 * 根因链：
 *   1. AI 占位消息 content='' → Markdown 组件返回 null → patchValue 组件路径
 *      `if (!returnedNode) newV._refNode = null` 清掉 _refNode
 *   2. 首个 token 渲染：oldInput=null（旧输出 null）→ 新增路径 appendChild → DOM 显示"今天是"
 *      ——但 newV._refNode 仍是 null（组件路径开头 `newV._refNode = oldNode` 被 null 覆盖）
 *   3. 后续 token 渲染：oldInput 非空（旧 div）但 oldNode=null（_refNode 丢）→
 *      patchValue 原生元素路径 `oldNode && oldNode.nodeType === 1` 不成立 → 静默 return null
 *      → DOM 永不更新
 *
 * 修复：patchValue 原生元素路径对「oldNode 丢失但旧输出非空」不再静默——
 *       重新渲染插入（自愈）；同时组件路径不再用 null 覆盖已有 _refNode。
 */
import { test, afterEach, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { UIRouter, uiServe, h } from '../ui-dom/index.ts'
import { Markdown } from '../components/Markdown/Markdown.ts'

before(setupJsdom)

afterEach(() => {
  createClientBrowser().clearBody()
  createClientBrowser().navigate('/')
  ;(globalThis as any).__setText = undefined
})

function mount(id: string): HTMLDivElement {
  const b = createClientBrowser()
  const el = b.createElement('div')
  b.bodyAppend(el)
  el.id = id
  return el
}

function flush() {
  return new Promise<void>((r) => setTimeout(r, 0))
}

/** 模拟 Chat 消息列表：Markdown 占位（content='' → null）→ token 逐步累积 */
function makeApp() {
  const App = async (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    $.msgs = [{ id: 'm1', content: '', status: 'thinking' }]
    ;(globalThis as any).__setContent = (c: string) => { $.msgs[0].content = c }
    return () =>
      h('div', { id: 'chat' },
        $.msgs.map((m: any) =>
          h('div', { key: m.id, class: 'msg' }, h(Markdown, { content: m.content })),
        ),
      )
  }
  return App
}

test('流式回归：Markdown 占位(null)→token 累积→DOM 必须持续更新', async () => {
  const b = createClientBrowser()
  const App = makeApp()
  const router = new UIRouter()
  router.get('/', () => h(App, {}))
  b.navigate('/')
  const el = mount('rt-md-stream')
  const handle = uiServe(router, { root: '#rt-md-stream' })
  await flush()

  // 占位：content='' → Markdown 渲染 null → 无 .wf-md
  assert.equal(el.querySelector('.wf-md'), null, '占位消息（空 content）Markdown 输出 null')

  // token1：content='今天是' → 新增路径 → DOM 出现
  ;(globalThis as any).__setContent('今天是')
  await flush()
  assert.equal(el.querySelector('.wf-md')?.textContent, '今天是', '首个 token 应渲染')

  // token2：content='今天是 **2026**' → DOM 必须更新
  // （修复前：_refNode 丢失 → patchValue 静默跳过 → DOM 停在"今天是"）
  ;(globalThis as any).__setContent('今天是 **2026**')
  await flush()
  assert.equal(el.querySelector('.wf-md')?.textContent, '今天是 2026', '后续 token 必须继续渲染（不得停更）')

  // token3：继续累积 → 仍更新
  ;(globalThis as any).__setContent('今天是 **2026年8月10日**，星期一。')
  await flush()
  assert.equal(el.querySelector('.wf-md')?.textContent, '今天是 2026年8月10日，星期一。', '持续累积持续更新')

  handle.close()
})

test('流式回归：占位非空内容直接流式（无 null 占位）也必须正常', async () => {
  const b = createClientBrowser()
  const App = async (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    $.text = '开始'
    ;(globalThis as any).__setContent = (c: string) => { $.text = c }
    return () => h('div', { id: 'chat' }, h('div', { class: 'msg' }, h(Markdown, { content: $.text })))
  }
  const router = new UIRouter()
  router.get('/', () => h(App, {}))
  b.navigate('/')
  const el = mount('rt-md-stream2')
  const handle = uiServe(router, { root: '#rt-md-stream2' })
  await flush()
  assert.equal(el.querySelector('.wf-md')?.textContent, '开始')

  ;(globalThis as any).__setContent('开始 **流式** 更新')
  await flush()
  assert.equal(el.querySelector('.wf-md')?.textContent, '开始 流式 更新', '普通流式更新正常')
  handle.close()
})

test('流式回归：消息列表增删（模拟多条消息）不破坏后续更新', async () => {
  const b = createClientBrowser()
  const App = async (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    $.msgs = [{ id: 'm0', content: '' }]
    ;(globalThis as any).__addMsg = (id: string, c: string) => { $.msgs.push({ id, content: c }) }
    ;(globalThis as any).__setMsg = (id: string, c: string) => {
      const m = $.msgs.find((x: any) => x.id === id)
      if (m) m.content = c
    }
    return () =>
      h('div', { id: 'chat' },
        $.msgs.map((m: any) => h('div', { key: m.id, class: 'msg' }, h(Markdown, { content: m.content }))),
      )
  }
  const router = new UIRouter()
  router.get('/', () => h(App, {}))
  b.navigate('/')
  const el = mount('rt-md-multi')
  const handle = uiServe(router, { root: '#rt-md-multi' })
  await flush()

  // 新增第 2 条消息（占位空）
  ;(globalThis as any).__addMsg('m1', '')
  await flush()
  assert.equal(el.querySelectorAll('.msg').length, 2, '两条消息')

  // 第 1 条流式（空 → 内容）
  ;(globalThis as any).__setMsg('m0', '第一条')
  await flush()
  assert.equal(el.querySelectorAll('.wf-md')[0]?.textContent, '第一条')

  // 第 2 条流式（空 → 内容）
  ;(globalThis as any).__setMsg('m1', '第二条')
  await flush()
  assert.equal(el.querySelectorAll('.wf-md')[1]?.textContent, '第二条', '第二条空占位后流式必须渲染')

  // 第 1 条继续累积
  ;(globalThis as any).__setMsg('m0', '第一条 **继续**')
  await flush()
  assert.equal(el.querySelectorAll('.wf-md')[0]?.textContent, '第一条 继续', '第一条继续累积更新')

  handle.close()
})
