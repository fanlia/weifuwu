/**
 * agent-builder 世界页面——列表 + 新建 + 详情（角色/关系/图谱/事件）
 * 纯框架消费：weifuwu/vdom + components（AppShell/RelationGraph/Card/Form...）零自定义组件
 */
import type { Component } from 'weifuwu/vdom'
import { h } from 'weifuwu/vdom'
import { AppShell, Button, Card, EmptyState, Form, Field, Icon, Input, Select, Tag } from 'weifuwu/components'

// ── 类型 ─────────────────────────────────────────────
interface World { id: string; name: string; type: string; status: string; agent_count: number; event_count: number; created_at: string }
interface Agent { id: string; name: string; persona: string; capabilities: string[]; weight: number; created_at: string }
interface Relation { id: string; from: string; to: string; type: string; strength: number; directed: boolean; from_name?: string; to_name?: string }
interface WorldDetail { world: World; agents: Agent[]; relations: Relation[]; events: Array<{ id: string; type: string; payload: any; status: string; created_at: string }> }

const TYPE_LABEL: Record<string, string> = {
  narrative: '推演', survey: '调研', company: '经营', city: '城市',
}
const TYPE_OPTIONS = [
  { value: 'narrative', label: '推演（叙事——人物对话回合）' },
  { value: 'survey', label: '调研（批处理——独立执行）' },
  { value: 'company', label: '经营（周期——组织决策）' },
  { value: 'city', label: '城市（宏观——代表原型）' },
]
const CAP_OPTIONS = [
  { value: 'speak', label: '🗣️ 对话' },
  { value: 'browse', label: '🌐 浏览器' },
  { value: 'code', label: '💻 编码' },
  { value: 'file', label: '📄 文件' },
  { value: 'analyze', label: '📊 分析' },
]

const errMsg = (e: unknown, fallback: string): string => {
  if (e instanceof Error) {
    try { const j = JSON.parse(e.message); if (j?.error) return String(j.error) } catch { /* 非 JSON */ }
    return e.message
  }
  return fallback
}

// ── 世界列表 ─────────────────────────────────────────
export const Worlds: Component = async (_props, ctx) => {
  let worlds: World[] = []
  let loading = true
  let error = ''
  const load = async (showSpinner = false) => {
    // mount 阶段禁止同步 ctx.render（真实事故——渲染中重跑工厂 → 栈溢出）
    if (showSpinner) { loading = true; error = ''; ctx.render() }
    try {
      const d = await ctx.api.get<{ worlds: World[] }>('/api/worlds')
      worlds = d.worlds ?? []
    } catch (e) { error = errMsg(e, '加载失败') }
    loading = false
    ctx.render()
  }
  void load()
  return async () => {
    const page = h('div', { class: 'wf-container wf-stack', style: '--wf-max:1080px;--wf-gap:16px;padding:24px 16px' }, [
      h('div', { class: 'wf-row wf-between wf-gap-sm' }, [
        h('div', { class: 'wf-stack wf-gap-none' }, [
          h('h1', { class: 'wf-text-2xl wf-m-0' }, '我的世界'),
          h('p', { class: 'wf-text-sm wf-text-secondary wf-m-0' }, '每个世界 = 一个可对话的 agent 空间——角色、关系、事件、记录'),
        ]),
        h('a', { href: '/worlds/new' }, h(Button, { variant: 'primary' }, [h(Icon, { name: 'plus', size: 14 }), ' 新建世界'])),
      ]),
      error ? h('div', { class: 'wf-text-sm wf-text-error' }, error) : null,
      loading ? h(EmptyState, { title: '加载中…', description: '世界列表读取中' }) :
      worlds.length === 0
        ? h(EmptyState, { title: '还没有世界', description: '创建一个世界——加角色、画关系、注入事件' })
        : h('div', { class: 'wf-grid', style: '--wf-cols:2;--wf-gap:12px' }, worlds.map((w) =>
          h('a', { key: w.id, href: `/worlds/${w.id}`, style: 'text-decoration:none;color:inherit' }, h(Card, { hover: true, pad: 'md' }, [
            h('div', { class: 'wf-row wf-between wf-gap-sm wf-mb-sm' }, [
              h('span', { class: 'wf-text-base wf-text-semibold' }, w.name),
              h(Tag, {}, TYPE_LABEL[w.type] ?? w.type),
            ]),
            h('div', { class: 'wf-text-xs wf-text-tertiary' }, [
              `${w.agent_count ?? 0} 角色 · ${w.event_count ?? 0} 事件`,
              ` · ${new Date(w.created_at).toLocaleDateString()}`,
            ]),
          ])),
        )),
    ])
    return h(AppShell, {
      nav: [{ key: '/', label: '世界', icon: h(Icon, { name: 'globe' }) }],
      path: '/',
      brand: { name: 'agent-builder', subtitle: 'Agent Worlds' },
      user: { name: '构建者' },
    }, page)
  }
}

// ── 新建世界 ─────────────────────────────────────────
export const NewWorld: Component = async (_props, ctx) => {
  let name = ''
  let type = 'narrative'
  let saving = false
  let error = ''
  const submit = async () => {
    if (!name.trim()) { error = '请输入世界名称'; ctx.render(); return }
    saving = true
    error = ''
    ctx.render()
    try {
      const d = await ctx.api.post<{ world: World }>('/api/worlds', { name, type })
      ctx.app.navigate(`/worlds/${d.world.id}`)
      return
    } catch (e) { error = errMsg(e, '创建失败') }
    saving = false
    ctx.render()
  }
  return async () => {
    const page = h('div', { class: 'wf-container', style: '--wf-max:640px;padding:24px 16px' }, [
      h('a', { href: '/', class: 'wf-text-sm', style: 'color:var(--wf-primary)' }, '← 返回世界列表'),
      h(Card, { pad: 'lg', class: 'wf-mt-md' }, [
        h('div', { class: 'wf-stack wf-gap-sm wf-mb-md' }, [
          h('h1', { class: 'wf-text-xl wf-m-0' }, '创建世界'),
          h('p', { class: 'wf-text-sm wf-text-secondary wf-m-0' }, '世界 = 角色 + 关系 + 事件——可对话的 agent 空间'),
        ]),
        h(Form, { onSubmit: (e: Event) => { e.preventDefault(); void submit() } }, [
          h(Field, { label: '世界名称 *' }, h(Input, { value: name, placeholder: '如：红楼梦推演 / 用户满意度调研', onInput: (e: Event) => { name = (e.target as HTMLInputElement).value; ctx.render() } })),
          h(Field, { label: '世界类型' }, h(Select, { value: type, options: TYPE_OPTIONS, onChange: (v: string) => { type = v; ctx.render() } })),
          error ? h('div', { class: 'wf-text-sm wf-text-error' }, error) : null,
          h(Button, { variant: 'primary', disabled: saving, onClick: submit }, saving ? '创建中…' : '创建世界'),
        ]),
      ]),
    ])
    return h(AppShell, {
      nav: [{ key: '/', label: '世界', icon: h(Icon, { name: 'globe' }) }],
      path: '/worlds/new',
      brand: { name: 'agent-builder', subtitle: 'Agent Worlds' },
      user: { name: '构建者' },
    }, page)
  }
}
