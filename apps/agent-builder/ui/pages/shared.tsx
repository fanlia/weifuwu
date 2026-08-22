/**
 * agent-builder 只读分享页——旁观者视图（汇报场景）
 * 图谱 + 角色 + 叙事流 + 对话记录——无编辑/无注入/无对话（只读）
 */
import type { Component } from 'weifuwu/vdom'
import { h } from 'weifuwu/vdom'
import { Card, EmptyState, Icon, RelationGraph, Tag } from 'weifuwu/components'

interface SharedWorld {
  world: { id: string; name: string; type: string }
  agents: Array<{ id: string; name: string; persona: string; capabilities: string[]; weight: number }>
  relations: Array<{ from: string; to: string; type: string; strength: number; directed: boolean }>
  events: Array<{ id: string; type: string; payload: Record<string, unknown>; status: string; created_at: string }>
  turns: Array<{ id: string; event_id: string; agent_name: string; kind: string; output: string; status: string }>
  chats: Array<{ id: string; agent_name: string; mode: string; input: string; output: string }>
}

const TYPE_LABEL: Record<string, string> = { narrative: '推演', survey: '调研', company: '经营', city: '城市' }

export const SharedWorld: Component<{ token: string }> = async (initProps, ctx) => {
  let data: SharedWorld | null = null
  let error = ''
  try {
    const d = await ctx.api.get<SharedWorld>(`/api/shared/${initProps.token}`)
    data = d
  } catch (e) {
    error = e instanceof Error ? e.message : '加载失败'
  }
  ctx.render()
  return async () => {
    if (error) {
      return h('div', { class: 'wf-container wf-center', style: '--wf-max:640px;padding:80px 16px' }, [
        h(EmptyState, { title: '无法查看', description: error }),
        h('a', { href: '/', class: 'wf-text-sm', style: 'color:var(--wf-primary)' }, '← 返回'),
      ])
    }
    if (!data) return h('div', { class: 'wf-container wf-center', style: '--wf-max:640px;padding:80px 16px' }, h(EmptyState, { title: '加载中…' }))
    const { world, agents, relations, events, turns, chats } = data
    const gNodes = agents.map((a) => ({
      id: a.id, label: a.name, weight: a.weight,
      kind: (a.capabilities ?? []).includes('code') ? '行动型' : '认知型',
      sublabel: a.persona ? a.persona.slice(0, 10) : undefined,
    }))
    const gEdges = relations.map((r) => ({ from: r.from, to: r.to, type: r.type, strength: r.strength, directed: r.directed }))
    return h('div', { class: 'wf-container wf-stack', style: '--wf-max:1080px;--wf-gap:16px;padding:24px 16px' }, [
      h('div', { class: 'wf-row wf-between' }, [
        h('div', { class: 'wf-stack wf-gap-none' }, [
          h('div', { class: 'wf-row wf-gap-sm wf-center' }, [
            h('h1', { class: 'wf-text-2xl wf-m-0' }, world.name),
            h(Tag, {}, TYPE_LABEL[world.type] ?? world.type),
          ]),
          h('span', { class: 'wf-text-xs wf-text-tertiary' }, '只读分享——世界运行记录'),
        ]),
        h('a', { href: '/', class: 'wf-text-sm', style: 'color:var(--wf-primary)' }, '← 返回'),
      ]),
      // 图谱
      h(Card, { pad: 'md' }, [
        h('div', { class: 'wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm' }, [h(Icon, { name: 'globe', size: 14 }), ' 关系图谱']),
        h(RelationGraph, { nodes: gNodes, edges: gEdges, height: '420px' }),
      ]),
      // 角色（只读）
      h(Card, { pad: 'md' }, [
        h('div', { class: 'wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm' }, [h(Icon, { name: 'users', size: 14 }), ` 角色（${agents.length}）`]),
        h('div', { class: 'wf-grid', style: '--wf-cols:2;--wf-gap:8px' }, agents.map((a) =>
          h('div', { key: a.id, class: 'wf-surface wf-p-sm', style: 'border-radius:8px' }, [
            h('div', { class: 'wf-text-sm wf-text-semibold' }, [a.name, a.weight > 1 ? h('span', { class: 'wf-text-xs wf-text-tertiary wf-ml-xs' }, `代表 ${a.weight} 人`) : null]),
            h('div', { class: 'wf-text-xs wf-text-tertiary' }, a.persona || ''),
          ]),
        )),
      ]),
      // 叙事流 + 对话记录（只读——可回溯）
      h(Card, { pad: 'md' }, [
        h('div', { class: 'wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm' }, [h(Icon, { name: 'list', size: 14 }), ` 运行记录（${events.length} 事件 · ${turns.length} 回合 · ${chats.length} 对话）`]),
        h('div', { class: 'wf-stack', style: '--wf-gap:10px' }, events.map((ev) => {
          const evTurns = turns.filter((t) => t.event_id === ev.id)
          return h('div', { key: ev.id, class: 'wf-surface wf-p-sm', style: 'border-radius:8px' }, [
            h('div', { class: 'wf-row wf-gap-sm wf-text-sm wf-mb-xs' }, [
              h(Tag, { size: 'sm' }, ev.type),
              h('span', { class: 'wf-fill wf-text-medium' }, String(ev.payload?.description ?? JSON.stringify(ev.payload))),
            ]),
            h('div', { class: 'wf-stack', style: '--wf-gap:5px' }, evTurns.map((t) =>
              h('div', { key: t.id, class: 'wf-px-sm wf-py-xs', style: 'border-left:2px solid var(--wf-border,#e5e7eb)' }, [
                h('span', { class: 'wf-text-xs wf-text-semibold' }, `${t.agent_name}（${t.kind}）`),
                h('div', { class: 'wf-text-sm wf-text-secondary' }, t.output || ''),
              ]),
            )),
          ])
        })),
        chats.length > 0 ? h('div', { class: 'wf-stack wf-mt-sm', style: '--wf-gap:5px' }, [
          h('div', { class: 'wf-text-xs wf-text-tertiary wf-mt-sm' }, '对话记录（咨询/干预）：'),
          ...chats.map((c) => h('div', { key: c.id, class: 'wf-px-sm wf-py-xs', style: 'border-left:2px solid var(--wf-primary,#4f6ef7)' }, [
            h('div', { class: 'wf-text-xs' }, [h('span', { class: 'wf-text-semibold' }, '你：'), c.input]),
            h('div', { class: 'wf-text-sm wf-text-secondary' }, [h('span', { class: 'wf-text-semibold' }, `${c.agent_name}：`), c.output]),
          ])),
        ]) : null,
      ]),
    ])
  }
}
