/**
 * 主页面渲染基线测试（UI-REFACTOR-PLAN M1——UI 测试保护网）
 *
 * 目的：AgentDetail 拆分（M2）的回归保护网——8 区渲染基线。
 * 真实渲染管线（mountToDom：buildVNode → renderValue → DOM）。
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../../../src/test/client/setup.ts'
import { h } from '../../../../src/ui-dom/vnode.ts'
import { makeAppCtx, mountPage, MOCK_AI_AGENT } from './helpers.ts'
import { Login } from '../../ui/pages/Login.tsx'
import { Settings } from '../../ui/pages/Settings.tsx'
import { AgentDetail } from '../../ui/pages/AgentDetail.tsx'

before(setupJsdom)

describe('Login 渲染基线', () => {
  it('标题 + 表单 + 注册入口', async () => {
    const { container } = await mountPage('/login', () => h(Login, {}))
    const text = container.textContent ?? ''
    assert.ok(text.includes('登录'), '标题')
    assert.ok(text.includes('立即注册'), '注册入口')
    assert.ok(container.querySelector('input[type=email], input'), '邮箱输入')
  })
})

describe('Settings 渲染基线', () => {
  it('四卡：基本资料/外观/审计/系统状态', async () => {
    const { container } = await mountPage('/settings', () => h(Settings, {}), {
      routes: [
        { method: 'GET', pattern: '/api/audit', handler: () => ({ entries: [], total: 0 }) },
        { method: 'GET', pattern: '/api/ops', handler: () => ({ sandbox: { available: true, mode: 'persistent', poolSize: 0, maxContainers: 20, imageReady: true }, auditToday: 3 }) },
      ],
    })
    const text = container.textContent ?? ''
    assert.ok(text.includes('基本资料'), '基本资料卡')
    assert.ok(text.includes('外观'), '外观卡')
    assert.ok(text.includes('审计日志'), '审计卡')
    assert.ok(text.includes('系统状态'), '系统状态卡')
    assert.ok(text.includes('运行中'), '沙盒状态徽章')
  })
})

describe('AgentDetail 渲染基线（拆分保护网）', () => {
  function detailOpts() {
    return {
      routes: [
        { method: 'GET', pattern: /^\/api\/agents\/agent-1\/skills$/, handler: () => ({ skills: [] }) },
        { method: 'GET', pattern: '/api/skills/available', handler: () => ({ skills: [] }) },
        { method: 'GET', pattern: /^\/api\/agents\?/, handler: () => ({ agents: [] }) },
        { method: 'GET', pattern: '/versions', handler: () => ({ versions: [] }) },
        { method: 'GET', pattern: '/logs', handler: () => ({ logs: [] }) },
        { method: 'GET', pattern: '/api/agents/agent-1', handler: () => ({ agent: MOCK_AI_AGENT }) },
      ],
    }
  }

  it('ai 类型：8 区中 7 区渲染（无 Webhook 区）', async () => {
    const { container } = await mountPage('/agents/agent-1', () => h(AgentDetail, {}), detailOpts(), '/agents/:id')
    const text = container.textContent ?? ''
    // 7 区（ai 类型）
    assert.ok(text.includes('基本设置'), '配置区')
    assert.ok(text.includes('技能管理'), '技能区')
    assert.ok(text.includes('工作空间文件'), '文件区')
    assert.ok(text.includes('绑定知识库'), '知识库绑定（ai 类型——文档管理仅 KB 类型）')
    assert.ok(!text.includes('知识库文档'), 'ai 类型无文档管理区')
    assert.ok(text.includes('测试对话'), '对话区')
    assert.ok(text.includes('执行日志'), '日志区')
    assert.ok(text.includes('版本管理'), '版本区')
    // ai 类型无 Webhook 配置区（入站端点文案）
    assert.ok(!text.includes('入站端点'), 'ai 类型无 Webhook 区')
    // 数据回填
    assert.ok(text.includes('测试 Agent'), '名称回填')
    const taValues = [...container.querySelectorAll('textarea')].map((t) => (t as HTMLTextAreaElement).value).join('|')
    assert.ok(taValues.includes('你是测试助手'), '系统提示回填（textarea value）')
  })

  it('无权限/不存在 → 错误态（非空表单）', async () => {
    const { container } = await mountPage('/agents/missing', () => h(AgentDetail, {}), {
      routes: [{ method: 'GET', pattern: '/api/agents/missing', handler: () => { throw new Error(JSON.stringify({ error: 'Agent 不存在' })) } }],
    }, '/agents/:id')
    const text = container.textContent ?? ''
    assert.ok(text.includes('不存在或无权访问'), '错误态文案')
    assert.ok(!text.includes('基本设置'), '不渲染空表单')
  })
})
