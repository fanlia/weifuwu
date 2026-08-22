/**
 * agent-builder 世界详情——角色/关系（图谱）/事件 三区管理
 * 纯框架：AppShell + RelationGraph + Card/Form/Select——零自定义组件
 */
import type { Component } from 'weifuwu/vdom'
import { h } from 'weifuwu/vdom'
import { AppShell, Button, Card, EmptyState, Form, Field, Icon, Input, RelationGraph, Select, Tag, Textarea } from 'weifuwu/components'
import type { RelationGraphNode, RelationGraphEdge } from 'weifuwu/components'

interface World { id: string; name: string; type: string; status: string; created_at: string }
interface Agent { id: string; name: string; persona: string; capabilities: string[]; weight: number }
interface Relation { id: string; from: string; to: string; type: string; strength: number; directed: boolean; from_name?: string; to_name?: string }
interface WorldEvent { id: string; type: string; payload: Record<string, unknown>; status: string; created_at: string }
interface Turn { id: string; event_id: string; agent_id: string; agent_name: string; kind: string; input: string; output: string; status: string; error: string | null }
interface Chat { id: string; agent_id: string; agent_name?: string; mode: string; input: string; output: string; created_at: string }

const TYPE_LABEL: Record<string, string> = { narrative: '推演', survey: '调研', company: '经营', city: '城市' }
const CAP_OPTIONS = [
  { value: 'speak', label: '🗣️ 对话' }, { value: 'browse', label: '🌐 浏览器' },
  { value: 'code', label: '💻 编码' }, { value: 'file', label: '📄 文件' }, { value: 'analyze', label: '📊 分析' },
]
const REL_TYPES = ['关联', '爱情', '亲情', '主仆', '汇报', '同盟', '敌对', '竞争']

const errMsg = (e: unknown, fallback: string): string => {
  if (e instanceof Error) {
    try { const j = JSON.parse(e.message); if (j?.error) return String(j.error) } catch { /* 非 JSON */ }
    return e.message
  }
  return fallback
}

export const WorldDetail: Component<{ id: string }> = async (initProps, ctx) => {
  const worldId = initProps.id
  let world: World | null = null
  let agents: Agent[] = []
  let relations: Relation[] = []
  let events: WorldEvent[] = []
  let turns: Turn[] = []
  let loading = true
  let error = ''
  let pollTimer: ReturnType<typeof setInterval> | null = null
  // 页面卸载清理轮询（vdom 纪律——监听类资源 must 清理）
  ctx.ui.onUnmount(() => { if (pollTimer) clearInterval(pollTimer) })
  let selectedAgent: string | null = null

  // 定向对话（Phase 3——与任一角色随时对话）
  let chatAgentId: string | null = null
  let chatHistory: Chat[] = []
  let chatMsg = ''
  let chatMode: 'consult' | 'intervene' = 'consult'
  let chatBusy = false
  let shareUrl = ''

  // 添加角色表单
  let newName = ''
  let newPersona = ''
  let newCaps = ['speak']
  // 添加关系表单
  let relFrom = ''
  let relTo = ''
  let relType = '关联'
  let relStrength = 3
  // 事件注入表单
  let evType = 'action'
  let evDesc = ''

  const load = async (showSpinner = false) => {
    // mount 阶段禁止同步 ctx.render（真实事故——渲染中重跑工厂 → 栈溢出）
    if (showSpinner) { loading = true; error = ''; ctx.render() }
    try {
      const d = await ctx.api.get<{ world: World; agents: Agent[]; relations: Relation[]; events: WorldEvent[]; turns: Turn[] }>(`/api/worlds/${worldId}`)
      world = d.world
      agents = d.agents ?? []
      relations = d.relations ?? []
      events = d.events ?? []
      turns = d.turns ?? []
      // 全部回合完成 → 停轮询
      if (pollTimer && events.every((ev) => ev.status !== 'running' && ev.status !== 'pending')) {
        clearInterval(pollTimer); pollTimer = null
      }
    } catch (e) { error = errMsg(e, '加载失败') }
    loading = false
    ctx.render()
  }
  void load()

  const addAgent = async () => {
    if (!newName.trim()) return
    try {
      await ctx.api.post(`/api/worlds/${worldId}/agents`, { name: newName, persona: newPersona, capabilities: newCaps })
      newName = ''; newPersona = ''
      await load()
    } catch (e) { error = errMsg(e, '添加角色失败'); ctx.render() }
  }
  const delAgent = async (id: string) => {
    await ctx.api.delete(`/api/agents/${id}`).catch(() => {})
    await load()
  }
  const addRelation = async () => {
    if (!relFrom || !relTo || relFrom === relTo) { error = '请选择两个不同角色'; ctx.render(); return }
    try {
      await ctx.api.post(`/api/worlds/${worldId}/relations`, { from: relFrom, to: relTo, type: relType, strength: relStrength })
      relFrom = ''; relTo = ''
      await load()
    } catch (e) { error = errMsg(e, '添加关系失败'); ctx.render() }
  }
  const delRelation = async (id: string) => {
    await ctx.api.delete(`/api/relations/${id}`).catch(() => {})
    await load()
  }
  const makeShare = async () => {
    try {
      const d = await ctx.api.post<{ url: string }>(`/api/worlds/${worldId}/share`)
      shareUrl = `${location.origin}${d.url}`
    } catch (e) { error = errMsg(e, '生成分享失败') }
    ctx.render()
  }
  const openChat = async (agentId: string) => {
    chatAgentId = agentId
    chatHistory = []
    chatMsg = ''
    ctx.render()
    try {
      const d = await ctx.api.get<{ chats: Chat[] }>(`/api/agents/${agentId}/chats`)
      chatHistory = d.chats ?? []
    } catch { /* 历史加载失败不阻塞 */ }
    ctx.render()
  }
  const sendChat = async () => {
    if (!chatAgentId || !chatMsg.trim() || chatBusy) return
    const msg = chatMsg
    chatMsg = ''
    chatBusy = true
    ctx.render()
    try {
      const d = await ctx.api.post<{ chat: Chat; event: unknown }>(`/api/agents/${chatAgentId}/chat`, { message: msg, mode: chatMode })
      chatHistory = [...chatHistory, d.chat]
      if (d.event && chatMode === 'intervene') {
        // 干预生成的事件——刷新叙事流（轮询回合）
        if (!pollTimer) pollTimer = setInterval(() => void load(), 3000)
      }
    } catch (e) { error = errMsg(e, '对话失败') }
    chatBusy = false
    ctx.render()
  }
  const injectEvent = async () => {
    if (!evDesc.trim()) return
    try {
      await ctx.api.post(`/api/worlds/${worldId}/events`, { type: evType, payload: { description: evDesc } })
      evDesc = ''
      await load()
      // 回合异步执行——轮询刷新叙事流（3s——全部 done 自动停）
      if (!pollTimer) pollTimer = setInterval(() => void load(), 3000)
    } catch (e) { error = errMsg(e, '注入事件失败'); ctx.render() }
  }

  const renderTurnOutput = (t: Turn) => {
    if (t.kind === 'survey') {
      try {
        const j = JSON.parse(t.output)
        const answers = j.answers ?? j
        if (typeof answers === 'object' && answers !== null) {
          return h('div', { class: 'wf-stack', style: '--wf-gap:2px' }, Object.entries(answers).map(([q, a]) =>
            h('div', { key: q, class: 'wf-text-sm wf-text-secondary' }, [
              h('span', { class: 'wf-text-medium' }, `${q}：`), String(a),
            ])))
        }
      } catch { /* 非 JSON——按文本显示 */ }
    }
    return h('div', { class: 'wf-text-sm wf-text-secondary' }, t.output)
  }

  return async () => {
    // 图谱数据（关系可视化）
    const gNodes: RelationGraphNode[] = agents.map((a) => ({
      id: a.id, label: a.name,
      kind: (a.capabilities ?? ['speak']).includes('code') ? '行动型' : (a.capabilities ?? []).includes('browse') ? '浏览型' : '认知型',
      sublabel: a.persona ? a.persona.slice(0, 10) : undefined,
      weight: a.weight,
    }))
    const gEdges: RelationGraphEdge[] = relations.map((r) => ({
      from: r.from, to: r.to, type: r.type, strength: r.strength, directed: r.directed,
    }))
    const agentOpts = agents.map((a) => ({ value: a.id, label: a.name }))

    const page = h('div', { class: 'wf-container wf-stack', style: '--wf-max:1200px;--wf-gap:16px;padding:24px 16px' }, [
      // 头部
      h('div', { class: 'wf-row wf-between wf-gap-sm' }, [
        h('div', { class: 'wf-stack wf-gap-none' }, [
          h('a', { href: '/', class: 'wf-text-sm', style: 'color:var(--wf-primary)' }, '← 世界列表'),
          h('div', { class: 'wf-row wf-gap-sm wf-center wf-mt-xs' }, [
            h('h1', { class: 'wf-text-2xl wf-m-0' }, world?.name ?? '世界详情'),
            world ? h(Tag, {}, TYPE_LABEL[world.type] ?? world.type) : null,
          ]),
        ]),
        h('div', { class: 'wf-row wf-gap-xs' }, [
          h(Button, { variant: 'ghost', size: 'sm', onClick: () => void makeShare() }, [h(Icon, { name: 'external-link', size: 13 }), ' 分享']),
          h(Button, { variant: 'ghost', size: 'sm', onClick: () => void load(true) }, [h(Icon, { name: 'refresh', size: 13 }), ' 刷新']),
        ]),
      ]),
      shareUrl ? h('div', { class: 'wf-surface wf-p-sm wf-row wf-gap-sm', style: 'border-radius:8px' }, [
        h('span', { class: 'wf-text-sm wf-fill wf-truncate' }, `只读链接：${shareUrl}`),
        h(Button, { size: 'sm', variant: 'ghost', onClick: () => { void navigator.clipboard?.writeText(shareUrl); ctx.render() } }, '复制'),
      ]) : null,
      error ? h('div', { class: 'wf-text-sm wf-text-error' }, error) : null,

      // 图谱（关系可视化）
      h(Card, { pad: 'md' }, [
        h('div', { class: 'wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm' }, [h(Icon, { name: 'globe', size: 14 }), ' 关系图谱']),
        agents.length === 0
          ? h(EmptyState, { title: '暂无角色', description: '在下方添加角色后自动生成图谱' })
          : h(RelationGraph, {
            nodes: gNodes, edges: gEdges,
            selectedId: selectedAgent,
            onSelect: (id) => { selectedAgent = id; ctx.render() },
            height: '460px',
          }),
      ]),

      h('div', { class: 'wf-grid', style: '--wf-cols:2;--wf-gap:16px' }, [
        // 左：角色管理
        h(Card, { pad: 'md' }, [
          h('div', { class: 'wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm' }, [h(Icon, { name: 'users', size: 14 }), ` 角色（${agents.length}）`]),
          agents.length === 0 ? h(EmptyState, { title: '暂无角色', description: '添加角色的示例人设：贾宝玉——怡红公子，敏感多情' }) :
          h('div', { class: 'wf-stack', style: '--wf-gap:8px' }, agents.map((a) =>
            h('div', { key: a.id, class: 'wf-surface wf-p-sm wf-row wf-gap-sm', style: 'border-radius:8px' }, [
              h('div', { class: 'wf-fill wf-stack wf-gap-none' }, [
                h('div', { class: 'wf-text-sm wf-text-semibold' }, a.name),
                h('div', { class: 'wf-text-xs wf-text-tertiary wf-truncate' }, a.persona || '（无人设）'),
                h('div', { class: 'wf-row wf-gap-xs wf-mt-xs' }, (a.capabilities ?? []).map((c) => h(Tag, { key: c, size: 'sm' }, CAP_OPTIONS.find((o) => o.value === c)?.label ?? c))),
              ]),
              h('div', { class: 'wf-row wf-gap-xs wf-shrink' }, [
                h(Button, { size: 'sm', variant: 'ghost', title: '对话', onClick: () => void openChat(a.id) }, [h(Icon, { name: 'message', size: 13 })]),
                h(Button, { size: 'sm', variant: 'ghost', title: '删除', onClick: () => void delAgent(a.id) }, [h(Icon, { name: 'trash', size: 13 })]),
              ]),
            ]),
          )),
          h(Form, { class: 'wf-stack wf-gap-sm wf-mt-md', style: '--wf-gap:8px' }, [
            h(Field, { label: '角色名称 *' }, h(Input, { value: newName, placeholder: '如：贾宝玉', onInput: (e: Event) => { newName = (e.target as HTMLInputElement).value; ctx.render() } })),
            h(Field, { label: '人设' }, h(Input, { value: newPersona, placeholder: '如：怡红公子——敏感多情，厌恶仕途经济', onInput: (e: Event) => { newPersona = (e.target as HTMLInputElement).value; ctx.render() } })),
            h(Field, { label: '能力' }, h(Select, { value: newCaps, options: CAP_OPTIONS, multiple: true, onChange: (v: string[]) => { newCaps = v; ctx.render() } })),
            h(Button, { size: 'sm', variant: 'primary', onClick: addAgent }, [h(Icon, { name: 'plus', size: 13 }), ' 添加角色']),
          ]),
        ]),

        // 右：关系管理
        h(Card, { pad: 'md' }, [
          h('div', { class: 'wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm' }, [h(Icon, { name: 'layout', size: 14 }), ` 关系（${relations.length}）`]),
          relations.length === 0 ? h(EmptyState, { title: '暂无关系', description: '添加关系的示例：贾宝玉 ⇄ 林黛玉（爱情·强度 5）' }) :
          h('div', { class: 'wf-stack', style: '--wf-gap:8px' }, relations.map((r) =>
            h('div', { key: r.id, class: 'wf-surface wf-p-sm wf-row wf-gap-sm', style: 'border-radius:8px' }, [
              h('div', { class: 'wf-fill wf-text-sm' }, [
                `${r.from_name} ${r.directed ? '→' : '⇄'} ${r.to_name}`,
                h('span', { class: 'wf-text-xs wf-text-tertiary wf-ml-sm' }, `${r.type} · 强度 ${r.strength}`),
              ]),
              h(Button, { size: 'sm', variant: 'ghost', title: '删除', onClick: () => void delRelation(r.id) }, [h(Icon, { name: 'trash', size: 13 })]),
            ]),
          )),
          h(Form, { class: 'wf-stack wf-gap-sm wf-mt-md', style: '--wf-gap:8px' }, [
            h('div', { class: 'wf-grid', style: '--wf-cols:2;--wf-gap:8px' }, [
              h(Field, { label: '从' }, h(Select, { value: relFrom, options: agentOpts, placeholder: '角色 A', onChange: (v: string) => { relFrom = v; ctx.render() } })),
              h(Field, { label: '到' }, h(Select, { value: relTo, options: agentOpts, placeholder: '角色 B', onChange: (v: string) => { relTo = v; ctx.render() } })),
            ]),
            h('div', { class: 'wf-grid', style: '--wf-cols:2;--wf-gap:8px' }, [
              h(Field, { label: '类型' }, h(Select, { value: relType, options: REL_TYPES.map((t) => ({ value: t, label: t })), onChange: (v: string) => { relType = v; ctx.render() } })),
              h(Field, { label: '强度 1-5' }, h(Select, { value: String(relStrength), options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) })), onChange: (v: string) => { relStrength = Number(v); ctx.render() } })),
            ]),
            h(Button, { size: 'sm', variant: 'primary', onClick: addRelation }, [h(Icon, { name: 'plus', size: 13 }), ' 添加关系']),
          ]),
        ]),
      ]),

      // 定向对话面板（Phase 3——与任一角色随时对话——咨询/干预）
      chatAgentId ? h(Card, { pad: 'md' }, [
        h('div', { class: 'wf-row wf-between wf-mb-sm' }, [
          h('div', { class: 'wf-text-sm wf-text-semibold' }, [h(Icon, { name: 'message', size: 14 }), ` 与 ${agents.find((a) => a.id === chatAgentId)?.name ?? '角色'} 对话`]),
          h(Button, { size: 'sm', variant: 'ghost', onClick: () => { chatAgentId = null; ctx.render() } }, [h(Icon, { name: 'close', size: 13 })]),
        ]),
        h('div', { class: 'wf-stack wf-gap-xs wf-mb-sm', style: '--wf-gap:6px;max-height:200px;overflow:auto' }, [
          chatHistory.length === 0
            ? h('div', { class: 'wf-text-xs wf-text-tertiary' }, '还没有对话——你可以咨询（了解立场）或干预（你的话成为世界事件）')
            : chatHistory.map((c) => h('div', { key: c.id, class: 'wf-stack wf-gap-none wf-px-sm wf-py-xs', style: 'border-left:2px solid var(--wf-border,#e5e7eb)' }, [
              h('div', { class: 'wf-text-xs' }, [h('span', { class: 'wf-text-semibold' }, '你：'), c.input]),
              h('div', { class: 'wf-text-sm wf-text-secondary' }, [h('span', { class: 'wf-text-semibold wf-text-primary' }, `${c.agent_name ?? 'ta'}：`), c.output]),
            ])),
        ]),
        h('div', { class: 'wf-row wf-gap-sm' }, [
          h(Select, { value: chatMode, options: [{ value: 'consult', label: '咨询（不改世界）' }, { value: 'intervene', label: '干预（成为世界事件）' }], onChange: (v: string) => { chatMode = v as 'consult' | 'intervene'; ctx.render() } }),
          h(Textarea, { class: 'wf-fill', rows: 2, value: chatMsg, placeholder: chatMode === 'consult' ? '问 ta 任何问题…' : '你的意见将成为世界事件，全体角色回应…', onInput: (e: Event) => { chatMsg = (e.target as HTMLTextAreaElement).value; ctx.render() } }),
          h(Button, { variant: 'primary', disabled: chatBusy || !chatMsg.trim(), onClick: sendChat }, chatBusy ? '回应中…' : '发送'),
        ]),
      ]) : null,

      // 事件区（Phase 2 触发回合——当前记录）
      h(Card, { pad: 'md' }, [
        h('div', { class: 'wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm' }, [h(Icon, { name: 'zap', size: 14 }), ` 事件（${events.length}）`]),
        h('div', { class: 'wf-grid', style: '--wf-cols:3;--wf-gap:8px' }, [
          h(Select, { value: evType, options: [{ value: 'action', label: '行动' }, { value: 'survey', label: '填表' }, { value: 'plot', label: '剧情' }, { value: 'policy', label: '政策' }], onChange: (v: string) => { evType = v; ctx.render() } }),
          h(Input, { value: evDesc, placeholder: '事件描述（如：元春省亲）', onInput: (e: Event) => { evDesc = (e.target as HTMLInputElement).value; ctx.render() } }),
          h(Button, { variant: 'primary', onClick: injectEvent, disabled: !evDesc.trim() }, '注入事件'),
        ]),
        events.length === 0 ? h('div', { class: 'wf-text-xs wf-text-tertiary wf-mt-sm' }, '暂无事件——注入事件后角色按人设回应（叙事流）') :
        h('div', { class: 'wf-stack wf-mt-sm', style: '--wf-gap:8px' }, events.map((ev) => {
          const evTurns = turns.filter((t) => t.event_id === ev.id)
          const doneCount = evTurns.filter((t) => t.status === 'done').length
          return h('div', { key: ev.id, class: 'wf-surface wf-p-sm', style: 'border-radius:8px' }, [
            h('div', { class: 'wf-row wf-gap-sm wf-text-sm wf-mb-xs' }, [
              h(Tag, { size: 'sm' }, ev.type),
              h('span', { class: 'wf-fill wf-text-medium' }, String(ev.payload?.description ?? JSON.stringify(ev.payload))),
              ev.status === 'running'
                ? h('Tag', { size: 'sm' }, `回合中 ${doneCount}/${evTurns.length}…`)
                : h('span', { class: 'wf-text-xs wf-text-tertiary' }, new Date(ev.created_at).toLocaleTimeString()),
            ]),
            // 宏观指标影响（policy 闭环——聚合民意评估）
            ev.payload?.impact ? (() => {
              try {
                const j = JSON.parse(String(ev.payload.impact))
                const inds = j.indicators ?? {}
                return h('div', { class: 'wf-surface wf-p-sm wf-mt-xs', style: 'border-radius:6px;background:var(--wf-surface-2,#fafafa)' }, [
                  h('div', { class: 'wf-text-xs wf-text-semibold wf-mb-xs' }, '📊 宏观指标影响'),
                  h('div', { class: 'wf-stack', style: '--wf-gap:2px' }, Object.entries(inds).map(([k, v]) =>
                    h('div', { key: k, class: 'wf-text-xs wf-text-secondary' }, [h('span', { class: 'wf-text-medium' }, `${k}：`), String(v)]))),
                  j.consensus ? h('div', { class: 'wf-text-xs wf-text-secondary wf-mt-xs' }, [h('span', { class: 'wf-text-medium' }, '共识：'), String(j.consensus)]) : null,
                  j.support ? h('div', { class: 'wf-text-xs wf-text-primary wf-mt-xs' }, `支持率：${j.support}`) : null,
                ])
              } catch { return null }
            })() : null,
            // 叙事流：每个角色的回合回应
            evTurns.length === 0
              ? h('div', { class: 'wf-text-xs wf-text-tertiary' }, ev.status === 'pending' ? '等待回合引擎…' : '（无角色回应）')
              : h('div', { class: 'wf-stack', style: '--wf-gap:6px' }, evTurns.map((t) =>
                h('div', { key: t.id, class: 'wf-stack wf-gap-none wf-px-sm wf-py-xs', style: 'border-left:2px solid var(--wf-border,#e5e7eb)' }, [
                  h('div', { class: 'wf-row wf-gap-sm wf-text-xs' }, [
                    h('span', { class: 'wf-text-semibold' }, t.agent_name),
                    t.status === 'done' ? h('span', { class: 'wf-text-tertiary' }, '已回应') :
                    t.status === 'error' ? h('span', { class: 'wf-text-error' }, '失败') :
                    h('span', { class: 'wf-text-primary' }, '回应中…'),
                  ]),
                  t.status === 'done' && t.output
                    ? renderTurnOutput(t)
                    : t.status === 'error'
                      ? h('div', { class: 'wf-text-xs wf-text-error' }, t.error ?? '')
                      : null,
                ]),
              )),
          ])
        })),
      ]),
    ])
    return h(AppShell, {
      nav: [{ key: '/', label: '世界', icon: h(Icon, { name: 'globe' }) }],
      path: `/worlds/${worldId}`,
      brand: { name: 'agent-builder', subtitle: 'Agent Worlds' },
      user: { name: '构建者' },
    }, loading && !world ? h(EmptyState, { title: '加载中…' }) : page)
  }
}
