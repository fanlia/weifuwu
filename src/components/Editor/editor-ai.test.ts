/**
 * Editor AI 协作端到端测试（阶段 1：选区操作 → wf: 流式 → 建议浮层 →
 * 接受 = edit:ai-apply commit 原子撤销）
 *
 * mock global fetch 提供 wf: SSE 流（协议 docs/ai-contract.md）——
 * 不 mock 网络层语义（真 SSE 解析经 aiStream）。
 */

import { test, describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../test/client/setup.ts'
import { h } from '../../ui-dom/vdom3/index.ts'
import { createRoot } from '../../ui-dom/vdom3/root.ts'
import { Editor } from './Editor.ts'
import { setSelectionOffsets } from './model/dom.ts'
import { editEvents } from './edit-events.ts'

before(setupJsdom)

describe('Editor AI 协作（串行——mockFetch 全局竞争）', () => {

/** wf: SSE 流构造（token 序列 → done） */
function sseBody(tokens: string[]): string {
  return [
    `event: wf:message_start\ndata: ${JSON.stringify({ id: 'm1' })}\n\n`,
    ...tokens.map((t) => `event: wf:token\ndata: ${JSON.stringify({ text: t })}\n\n`),
    `event: wf:done\ndata: ${JSON.stringify({ content: tokens.join(''), usage: { prompt_tokens: 1, completion_tokens: tokens.join('').length } })}\n\n`,
  ].join('')
}

function mockFetch(body: () => string): void {
  ;(globalThis as any).fetch = async (url: any, init: any) => {
    return new Response(body(), {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
}

interface Harness {
  root: HTMLElement
  calls: string[]
  content: () => HTMLElement | null
  clickAi: (id: string) => void
  clickAccept: () => void
  key: (k: string, opts?: { ctrl?: boolean }) => void
}

async function mount(value: string): Promise<Harness> {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const calls: string[] = []
  const handle = createRoot(h(Editor, {
    value,
    onChange: (v: string) => { calls.push(v) },
    ai: { url: '/api/ai-editor' },
  }), root)
  await handle.ready
  const content = () => root.querySelector('.wf-editor-content') as HTMLElement | null
  const clickAi = (id: string) => {
    const btn = root.querySelector(`[data-ai-item="${id}"]`) as HTMLElement | null
    assert.ok(btn, `AI 按钮 ${id} 存在`)
    btn!.click()
  }
  const clickAccept = () => {
    const btn = document.querySelector('.wf-editor-ai-panel-actions .wf-btn--primary') as HTMLElement | null
    assert.ok(btn, '接受按钮存在')
    btn!.click()
  }
  const key = (k: string, opts: { ctrl?: boolean } = {}) => {
    const el = content()!
    el.dispatchEvent(new (window as any).KeyboardEvent('keydown', {
      key: k, bubbles: true, ctrlKey: !!opts.ctrl, metaKey: false,
    }))
  }
  return { root, calls, content, clickAi, clickAccept, key }
}

function cleanup(h: Harness): void {
  h.root.remove()
}

  it('Ctrl+Enter 快速触发最近 AI 动作（无记录 = 第一个）', async () => {
  mockFetch(() => sseBody(['快捷回复']))
  const root = document.createElement('div')
  document.body.appendChild(root)
  const handle = createRoot(h(Editor, {
    value: '<p>hello</p>',
    onChange: () => {},
    ai: { url: '/api/ai-editor' },
  }), root)
  await handle.ready
  await new Promise((r) => setTimeout(r, 30))
  const el = root.querySelector('.wf-editor-content') as HTMLElement
  setSelectionOffsets(el, 0, 5)
  // Ctrl+Enter（无记录 → 第一个动作 polish）
  el.dispatchEvent(new (window as any).KeyboardEvent('keydown', {
    key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true,
  }))
  await new Promise((r) => setTimeout(r, 80))
  // 触发验证（node:test 顶层测试并发——多个面板并存时全局 accept 不可靠——
  // 替换/撤销已被其他测试覆盖）
  const panel = document.querySelector('.wf-editor-ai-panel')
  assert.ok(panel, 'Ctrl+Enter 触发 AI 动作（浮层出现）')
  assert.equal(panel!.textContent?.includes('润色'), true, '触发第一个动作（提示词含选区文本）')
  // 拒绝关闭（避免面板残留干扰并发测试）
  const reject = panel!.querySelector('.wf-editor-ai-panel-actions .wf-btn--ghost') as HTMLElement | null
  reject?.click()
  await new Promise((r) => setTimeout(r, 20))
  root.remove()
})

  it('AI 按钮组渲染（ai prop 传入时）', async () => {
  const h = await mount('<p>hello</p>')
  try {
    for (const id of ['polish', 'translate', 'shorten', 'expand', 'fix']) {
      assert.ok(h.root.querySelector(`[data-ai-item="${id}"]`), `AI 动作 ${id} 按钮`)
    }
  } finally { cleanup(h) }
})

  it('选区 → 润色 → 流式浮层 → 接受 = ai-apply commit → Ctrl+Z 一步撤销', async () => {
  mockFetch(() => sseBody(['你好', '世界']))
  const h = await mount('<p>hello world</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 0, 5) // 选 "hello"
    h.clickAi('polish')
    await new Promise((r) => setTimeout(r, 50))
    // 流式浮层（portal）
    const panel = document.querySelector('.wf-editor-ai-panel')
    assert.ok(panel, 'AI 建议浮层出现（portal）')
    assert.ok(panel!.closest('#__wf_portal'), '浮层在 portal 容器')
    assert.equal(panel!.textContent?.includes('你好世界'), true, '流式文本累积')
    // 接受 → DOM 替换
    h.clickAccept()
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(el.textContent, '你好世界 world', '选区被 AI 建议替换')
    assert.equal(h.calls[h.calls.length - 1], '<p>你好世界 world</p>')
    const events = editEvents(20, { action: 'ai-apply' })
    assert.equal(events[0].payload?.status, 'accepted', '事件流记录 accepted')
    // Ctrl+Z：一步撤销 AI 替换（原子——回到原文）
    h.key('z', { ctrl: true })
    assert.equal(el.textContent, 'hello world', '撤销 AI 替换 → 原文')
  } finally { cleanup(h) }
})

  it('拒绝：建议丢弃 + DOM 不变 + 事件流 rejected', async () => {
  mockFetch(() => sseBody(['修改版']))
  const h = await mount('<p>hello</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 0, 5)
    h.clickAi('polish')
    await new Promise((r) => setTimeout(r, 50))
    const rejectBtn = document.querySelector('.wf-editor-ai-panel-actions .wf-btn--ghost') as HTMLElement | null
    assert.ok(rejectBtn)
    rejectBtn!.click()
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(el.textContent, 'hello', '拒绝后 DOM 不变')
    assert.equal(document.querySelector('.wf-editor-ai-panel'), null, '浮层关闭')
  } finally { cleanup(h) }
})

  it('无选区时 AI 作用于全文（original = 全文）', async () => {
  mockFetch(() => sseBody(['全文替换']))
  const h = await mount('<p>hello</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 0, 0) // 折叠光标（无选区）
    h.clickAi('polish')
    await new Promise((r) => setTimeout(r, 50))
    const panel = document.querySelector('.wf-editor-ai-panel')
    assert.ok(panel, '无选区打开浮层（全文操作）')
    h.clickAccept()
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(el.textContent, '全文替换', '全文被替换')
  } finally { cleanup(h) }
})

  it('AI 替换保留段落格式（引用块整段替换后仍是引用块）', async () => {
  mockFetch(() => sseBody(['新引用内容']))
  const h = await mount('<p>a</p><blockquote>引用块</blockquote><p>b</p>')
  try {
    const el = h.content()!
    // 选区 = blockquote 全文（text "a\n引用块\n"：引用块 = offset 2-5）
    setSelectionOffsets(el, 2, 5)
    h.clickAi('polish')
    await new Promise((r) => setTimeout(r, 50))
    h.clickAccept()
    await new Promise((r) => setTimeout(r, 20))
    const bq = el.querySelector('blockquote')
    assert.ok(bq, '引用块格式保留')
    assert.equal(bq.textContent, '新引用内容', '引用块内容被替换')
  } finally { cleanup(h) }
})

  it('AI 错误 → 浮层错误态 + 接受禁用', async () => {
  ;(globalThis as any).fetch = async () => {
    return new Response('event: wf:error\ndata: {"code":"provider","message":"服务不可用"}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  const h = await mount('<p>hello</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 0, 5)
    h.clickAi('polish')
    await new Promise((r) => setTimeout(r, 50))
    const panel = document.querySelector('.wf-editor-ai-panel')
    assert.ok(panel, '浮层出现')
    assert.equal(panel!.textContent?.includes('服务不可用'), true, '错误信息显示')
    // 错误态：primary 变重试按钮（非接受）
    const primary = document.querySelector('.wf-editor-ai-panel-actions .wf-btn--primary') as HTMLButtonElement | null
    assert.equal(primary?.textContent, '重试', '错误态显示重试')
    assert.ok(panel!.textContent?.includes('接受') === false, '错误态无接受按钮')
    // 重试 → 重新发起（mock 成功）
    ;(globalThis as any).fetch = async () => new Response(sseBody(['重试成功']), { headers: { 'Content-Type': 'text/event-stream' } })
    primary!.click()
    await new Promise((r) => setTimeout(r, 80))
    const panel2 = document.querySelector('.wf-editor-ai-panel')
    assert.ok(panel2, '重试后浮层仍在')
    assert.equal(panel2!.textContent?.includes('重试成功'), true, '重试重新生成')
    // 重试成功后接受恢复
    const accept = panel2!.querySelector('.wf-editor-ai-panel-actions .wf-btn--primary') as HTMLButtonElement | null
    assert.equal(accept?.textContent, '接受', '重试成功后恢复接受')
    // 关闭面板（portal 在 root 外——残留会污染后续测试的全局查询）
    const close = panel2!.querySelector('.wf-editor-ai-panel-actions .wf-btn--ghost') as HTMLElement | null
    close?.click()
    await new Promise((r) => setTimeout(r, 20))
  } finally { cleanup(h) }
})

  it('生成中接受禁用（streaming）', async () => {
  // 流不结束（只发 token 不发 done）
  ;(globalThis as any).fetch = async () => {
    return new Response('event: wf:token\ndata: {"text":"部分"}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  const h = await mount('<p>hello</p>')
  try {
    const el = h.content()!
    setSelectionOffsets(el, 0, 5)
    h.clickAi('polish')
    await new Promise((r) => setTimeout(r, 50))
    const accept = document.querySelector('.wf-editor-ai-panel-actions .wf-btn--primary') as HTMLButtonElement | null
    assert.ok(accept?.disabled, '生成中接受禁用')
    // 流中止（浮层关闭 → abort）
    const rejectBtn = document.querySelector('.wf-editor-ai-panel-actions .wf-btn--ghost') as HTMLElement | null
    rejectBtn!.click()
  } finally { cleanup(h) }
})
})
