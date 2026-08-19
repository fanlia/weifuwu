/**
 * AiChat 组件测试（vdom3 迁移补测——vdom2 引擎删除后重建最小基线）
 * 声明式渲染 + 空态 + 会话渲染（renderVNode 层——vdom3 testing）
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../vdom/setup.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'
import { AiChat } from './AiChat.ts'

before(setupJsdom)

const chatHandle = () => ({
  messages: [] as any[], input: '', streaming: false, error: null, usage: null,
  send: () => {}, stop: () => {}, retry: () => {}, clear: () => {}, dispose: () => {},
  subscribe: () => () => {},
})

test('渲染：容器结构（wf-aichat + 空态文案）', async () => {
  const vnode = await renderVNode(AiChat, { chat: chatHandle() }, createTestCtx())
  const root = vnode as any
  assert.equal(root.props.class, 'wf-aichat', '根容器')
  const text = JSON.stringify(root.props.children)
  assert.ok(text.includes('输入消息开始对话'), '空态')
})

test('渲染：消息列表渲染（user/assistant 气泡）', async () => {
  const chat = chatHandle()
  chat.messages = [
    { id: 'u1', role: 'user', content: '你好', status: 'done' },
    { id: 'a1', role: 'assistant', content: '回复', status: 'done' },
  ]
  const vnode = await renderVNode(AiChat, { chat }, createTestCtx())
  assert.ok(JSON.stringify(vnode).includes('你好'), 'user 消息')
  assert.ok(JSON.stringify(vnode).includes('回复'), 'assistant 消息')
})

test('渲染：输入条（发送按钮）存在', async () => {
  const vnode = await renderVNode(AiChat, { chat: chatHandle() }, createTestCtx())
  assert.ok(JSON.stringify(vnode).includes('发送'), '发送按钮')
})
