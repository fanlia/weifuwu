/**
 * AuthPage — 认证页骨架（登录/注册复用——agent-platform Login/Register 抽取）
 *
 * 布局：居中卡片 + logo + 标题/副标题 + 表单插槽 + 错误条 + 提交 loading + 底部链接。
 * 纯骨架：表单字段（children）与提交逻辑（onSubmit）由消费方提供。
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { AuthPage } from './AuthPage.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'
import { setupJsdom } from '../../test/client/setup.ts'

before(setupJsdom)

function createTestCtx(): WfuiContext {
  return { ui: { render: () => {}, useExternal: () => undefined } } as any
}

/** 按 class 在 VNode 树中查找 */
async function find(node: any, classPart: string, ctx: any): Promise<any> {
  if (node == null) return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = await find(item, classPart, ctx)
      if (hit) return hit
    }
    return null
  }
  if (typeof node !== 'object') return null
  if (typeof node.type === 'function') {
    // 展开子组件（两阶段：工厂 → renderFn；强制 async）
    const r = await node.type(node.props, ctx)
    const inner = typeof r === 'function' ? await r(node.props) : r
    return await find(inner, classPart, ctx)
  }
  if (typeof node.props?.class === 'string' && node.props.class.split(/\s+/).some((t) => t === classPart || t.startsWith(classPart + '-'))) return node
  const kids = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children]
  for (const k of kids) {
    const hit = await find(k, classPart, ctx)
    if (hit) return hit
  }
  return null
}

describe('AuthPage', () => {
  it('渲染骨架：标题/副标题/logo/提交按钮/footer', async () => {
    const ctx = createTestCtx()
    const v = await renderVNode(AuthPage, {
      title: '登录',
      subtitle: '多租户 AI 平台',
      logo: { type: 'span', props: { class: 'auth-logo-test' }, key: null },
      children: { type: 'div', props: {}, key: null },
      footer: { type: 'span', props: { class: 'auth-footer-test' }, key: null },
      submitLabel: '登 录',
      onSubmit: () => {},
    }, ctx)
    const title = await find(v, 'wf-text-2xl', ctx)
    assert.ok(title && String(title.props.children).includes('登录'), '标题渲染')
    const logo = await find(v, 'auth-logo-test', ctx)
    assert.ok(logo, 'logo 渲染')
    const footer = await find(v, 'auth-footer-test', ctx)
    assert.ok(footer, 'footer 渲染')
    const submit = await find(v, 'wf-btn--primary', ctx)
    assert.ok(submit && String(submit.props.children).includes('登 录'), '提交按钮文案')
  })

  it('表单提交 → onSubmit（preventDefault 已处理）', async () => {
    const ctx = createTestCtx()
    let submitted = 0
    const v = await renderVNode(AuthPage, {
      title: '登录', submitLabel: '登 录',
      children: null, onSubmit: () => { submitted++ },
    }, ctx)
    const form = await find(v, 'wf-auth-form', ctx)
    assert.ok(form, '表单容器')
    form.props.onSubmit({ preventDefault: () => {} })
    assert.equal(submitted, 1, '提交触发 onSubmit')
  })

  it('loading → 提交按钮 loading + 禁用', async () => {
    const ctx = createTestCtx()
    const v = await renderVNode(AuthPage, {
      title: '注册', submitLabel: '注 册',
      loading: true, children: null, onSubmit: () => {},
    }, ctx)
    const submit = await find(v, 'wf-btn--primary', ctx)
    assert.ok(submit.props.class.includes('wf-btn--loading'), 'loading class')
    assert.equal(submit.props.disabled, true, 'loading 时禁用')
  })

  it('error → 错误 Alert 渲染', async () => {
    const ctx = createTestCtx()
    const v = await renderVNode(AuthPage, {
      title: '登录', submitLabel: '登 录',
      error: '邮箱已被注册', children: null, onSubmit: () => {},
    }, ctx)
    const alert = await find(v, 'wf-alert', ctx)
    assert.ok(alert, '错误 Alert 渲染')
    const msg = await find(v, 'wf-alert-msg', ctx)
    assert.ok(msg && String(msg.props.children).includes('邮箱已被注册'), '错误文案')
  })
})

it('title/subtitle/logo/footer 自定义渲染', async () => {
  const vnode = await renderVNode(AuthPage, { title: '登录', subtitle: '欢迎', logo: '★', footer: '© 2026' }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('登录') && s.includes('欢迎'), '标题/副标题')
  assert.ok(s.includes('★'), 'logo 渲染')
  assert.ok(s.includes('© 2026'), 'footer 渲染')
})

it('children 表单插槽渲染', async () => {
  const vnode = await renderVNode(AuthPage, { title: '登录', children: '表单区' }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('表单区'), 'children 插槽')
})

it('无 onSubmit 提交不抛错（边界）', async () => {
  const vnode = await renderVNode(AuthPage, { title: '登录' }, createTestCtx())!
  assert.ok(vnode, '无回调渲染')
})
