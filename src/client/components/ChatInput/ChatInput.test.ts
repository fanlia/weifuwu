/**
 * ChatInput — 独立复用聊天输入条（AiChat 抽取 + 消费方复用）
 *
 * 纯输入层：不自带聊天逻辑（useChat 组合在消费方）。
 * 交互回调（onSend/onStop/onRetry）直接调用 props 回调。
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { ChatInput } from './ChatInput.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx as officialCreateTestCtx } from '../../vdom/testing.ts'
import { setupJsdom } from '../../vdom/setup.ts'

before(setupJsdom)


function createTestCtx(overrides?: Record<string, unknown>): UIContext {
  // 官方测试 ctx（vdom/testing——render/ui hooks mock——组件消费面）
  return officialCreateTestCtx(overrides as never)
}


/** class 匹配：token 精确或后代前缀 */
function classHit(cls: string, classPart: string): boolean {
  return cls.split(/\s+/).some((t) => t === classPart || t.startsWith(classPart + '-'))
}

/** 按 class 在 VNode 树中查找 */
async function find(node: any, classPart: string): Promise<any> {
  if (node == null) return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = await find(item, classPart)
      if (hit) return hit
    }
    return null
  }
  if (typeof node !== 'object') return null
  if (typeof node.type === 'function') return null // 只查 DOM 级（ChatInput 无子组件）
  if (typeof node.props?.class === 'string' && classHit(node.props.class, classPart)) return node
  const kids = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children]
  for (const k of kids) {
    const hit = await find(k, classPart)
    if (hit) return hit
  }
  return null
}

/** 收集按钮类节点 */
function buttons(vnode: any): any[] {
  const out: any[] = []
  ;(function walk(n: any) {
    if (!n || typeof n !== 'object') return
    if (n.type === 'button') out.push(n)
    const kids = Array.isArray(n.props?.children) ? n.props.children : [n.props?.children]
    for (const k of kids) walk(k)
  })(vnode)
  return out
}

/** 按钮文本 */
function btnText(b: any): string {
  const c = b?.props?.children
  if (Array.isArray(c)) return c.filter((x: any) => typeof x === 'string').join('')
  return String(c ?? '')
}

describe('ChatInput', () => {
  it('默认单行 input + 发送按钮', async () => {
    const v = await renderVNode(ChatInput, { value: '', onChange: () => {}, onSend: () => {} }, createTestCtx())
    const input = await find(v, 'wf-chat-input')
    assert.ok(input, '应有输入元素')
    assert.equal(input.type, 'input', '默认单行 input（非 textarea）')
    const sendBtn = buttons(v).find((b) => btnText(b) === '发送')
    assert.ok(sendBtn, '应有发送按钮')
  })

  it('Enter → onSend（trim 后文本）；空输入不触发', async () => {
    const sent: string[] = []
    const ctx = createTestCtx()
    const v = await renderVNode(ChatInput, { value: '', onChange: () => {}, onSend: (t) => sent.push(t) }, ctx)
    const input = await find(v, 'wf-chat-input')
    input.props.onInput({ target: { value: '  hi  ' } })
    input.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    assert.deepEqual(sent, ['hi'], 'Enter 发送 trim 后文本')
    // keyword 已清空——再 Enter 不重复发送
    input.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    assert.equal(sent.length, 1, '发送后 keyword 清空——空输入不重复发送')
  })

  it('multiline：textarea 渲染；Enter 发送 / Shift+Enter 换行不发送', async () => {
    const sent: string[] = []
    const ctx = createTestCtx()
    const v = await renderVNode(ChatInput, { value: '', onChange: () => {}, onSend: (t) => sent.push(t), multiline: true }, ctx)
    const ta = await find(v, 'wf-chat-input')
    assert.equal(ta.type, 'textarea', 'multiline 渲染 textarea')
    ta.props.onInput({ target: { value: 'a\nb' } })
    ta.props.onKeyDown({ key: 'Enter', shiftKey: true, preventDefault: () => {} })
    assert.equal(sent.length, 0, 'Shift+Enter 换行不发送')
    ta.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    assert.deepEqual(sent, ['a\nb'], 'Enter 发送多行文本')
  })

  it('Ctrl+Enter 强制发送（多行场景双保险）', async () => {
    const sent: string[] = []
    const ctx = createTestCtx()
    const v = await renderVNode(ChatInput, { value: '', onChange: () => {}, onSend: (t) => sent.push(t), multiline: true }, ctx)
    const ta = await find(v, 'wf-chat-input')
    ta.props.onInput({ target: { value: 'x' } })
    ta.props.onKeyDown({ key: 'Enter', ctrlKey: true, preventDefault: () => {} })
    assert.deepEqual(sent, ['x'], 'Ctrl+Enter 发送')
    ta.props.onInput({ target: { value: 'y' } })
    ta.props.onKeyDown({ key: 'Enter', metaKey: true, preventDefault: () => {} })
    assert.deepEqual(sent, ['x', 'y'], 'Cmd+Enter 发送（macOS）')
  })

  it('streaming → 停止按钮（onStop）；非流式 → 发送按钮', async () => {
    const calls: string[] = []
    const ctx = createTestCtx()
    const v1 = await renderVNode(ChatInput, { value: '', onChange: () => {}, onSend: () => calls.push('send'), streaming: false, onStop: () => calls.push('stop') }, ctx)
    assert.ok(buttons(v1).find((b) => btnText(b) === '发送'))
    const v2 = await renderVNode(ChatInput, { value: '', onChange: () => {}, onSend: () => {}, streaming: true, onStop: () => calls.push('stop') }, ctx)
    const stopBtn = buttons(v2).find((b) => btnText(b) === '停止')
    assert.ok(stopBtn, '流式显示停止')
    stopBtn.props.onClick()
    assert.deepEqual(calls, ['stop'])
  })

  it('error → 重试按钮（onRetry）；streaming 时不显示', async () => {
    const calls: string[] = []
    const ctx = createTestCtx()
    const v1 = await renderVNode(ChatInput, { value: '', onChange: () => {}, onSend: () => {}, error: 'rate_limited', onRetry: () => calls.push('retry') }, ctx)
    const retryBtn = buttons(v1).find((b) => btnText(b) === '重试')
    assert.ok(retryBtn, '错误态显示重试')
    retryBtn.props.onClick()
    assert.deepEqual(calls, ['retry'])
    const v2 = await renderVNode(ChatInput, { value: '', onChange: () => {}, onSend: () => {}, streaming: true, error: 'x', onRetry: () => {} }, ctx)
    assert.ok(!buttons(v2).find((b) => btnText(b) === '重试'), '流式时不显示重试')
  })

  it('disabled → 输入与按钮禁用', async () => {
    const ctx = createTestCtx()
    const v = await renderVNode(ChatInput, { value: '', onChange: () => {}, onSend: () => {}, disabled: true }, ctx)
    const input = await find(v, 'wf-chat-input')
    assert.equal(input.props.disabled, true, '输入禁用')
    const sendBtn = buttons(v).find((b) => btnText(b) === '发送')
    assert.equal(sendBtn.props.disabled, true, '按钮禁用')
  })

  it('IME：组合期间 onInput 不触发 onChange；compositionend 恢复', async () => {
    const changes: string[] = []
    const ctx = createTestCtx()
    const v = await renderVNode(ChatInput, { value: '', onChange: (t) => changes.push(t), onSend: () => {} }, ctx)
    const input = await find(v, 'wf-chat-input')
    input.props.onCompositionStart({ isComposing: true })
    input.props.onInput({ target: { value: '中' }, isComposing: true })
    assert.equal(changes.length, 0, '组合期间不回流 onChange（§5.3 IME 纪律）')
    input.props.onCompositionEnd({ target: { value: '中' } })
    assert.equal(changes.at(-1), '中', 'compositionend 同步最终值')
  })

  it('onControl：mount 期回调上抛 handle——setKeyword 写内部输入态（不触发 onChange）', async () => {
    const changes: string[] = []
    let handle: any = null
    const kw = { v: '' }
    const ctx = {
      ...createTestCtx(),
      ui: {
        ...createTestCtx().ui,
        useControlledInput: () => ({
          value: '', setValue: () => {},
          get keyword() { return kw.v },
          setKeyword(v: string) { kw.v = v },
          get selectedLabel() { return '' },
          setSelectedLabel: () => {},
        }),
      },
    }
    const v = await renderVNode(ChatInput, {
      value: '', onChange: (t) => changes.push(t), onSend: () => {},
      onControl: (h) => { handle = h },
    }, ctx)
    assert.ok(handle, 'onControl 回调收到 handle（props 不可变契约——禁止 out-param 写 control.current）')
    handle.setKeyword('@小码 ')
    assert.equal(kw.v, '@小码 ', 'setKeyword 写入内部输入态（消费方随后 render() 回显）')
    assert.equal(changes.length, 0, 'setKeyword 不触发 onChange（由消费方决定是否回传共享态）')
    handle.setValue('hi')
    assert.equal(kw.v, 'hi', 'setValue 写内部态')
    assert.deepEqual(changes, ['hi'], 'setValue 触发 onChange（受控回传）')
  })

  it('labels 覆盖 + actions 插槽渲染', async () => {
    const ctx = createTestCtx()
    const actions = { type: 'span', props: { class: 'wf-chat-actions-test' }, key: null }
    const v = await renderVNode(ChatInput, {
      value: '', onChange: () => {}, onSend: () => {},
      labels: { send: '送出', placeholder: '说点什么…' },
      actions,
    }, ctx)
    const sendBtn = buttons(v).find((b) => btnText(b) === '送出')
    assert.ok(sendBtn, '自定义 send label')
    const act = await find(v, 'wf-chat-actions-test')
    assert.ok(act, 'actions 插槽渲染')
    const input = await find(v, 'wf-chat-input')
    assert.equal(input.props.placeholder, '说点什么…', '自定义 placeholder')
  })
})
