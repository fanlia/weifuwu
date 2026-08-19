import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

/**
 * SessionList — 侧栏会话管理列表（AI 差异化）
 *
 * 会话分组（今天/昨天/更早）+ 选中高亮 + 搜索过滤 + 重命名/删除/新建。
 * 手动优先（let + render()）：
 *   - 重命名：行内编辑按钮 → 输入框（预填原标题）→ Enter 确认 / Escape 取消
 *   - 删除：悬停行内删除按钮（裁剪：不做右键菜单）
 *   - 键盘：方向键移动焦点 + Enter 激活（列表容器 onKeyDown）
 *
 * ```tsx
 * <SessionList sessions={sessions} activeId={cur} onSelect={setCur}
 *   onNew={createSession} onRename={renameSession} onDelete={deleteSession} searchable />
 * ```
 */
export interface Session {
  id: string
  title: string
  /** 更新时间戳（ms）——分组（今天/昨天/更早）；缺省进「更早」 */
  updatedAt?: number
}

export interface SessionListProps {
  sessions: Session[]
  /** 当前选中会话 id（高亮 + aria-selected） */
  activeId?: string
  /** 点击会话（键盘 Enter 同） */
  onSelect?: (id: string) => void
  /** 新建按钮（渲染条件：onNew 提供） */
  onNew?: () => void
  /** 重命名（行内编辑 Enter 确认） */
  onRename?: (id: string, title: string) => void
  /** 删除（行内悬停按钮） */
  onDelete?: (id: string) => void
  /** 顶部搜索框（按标题过滤） */
  searchable?: boolean
  /** 新建按钮文案（默认「新建会话」） */
  newLabel?: string
}

const DAY = 24 * 3600 * 1000

/** 分组标签：今天 / 昨天 / 更早（确定性：now 可注入） */
export function groupKey(t: number, now = Date.now()): 'today' | 'yesterday' | 'earlier' {
  const todayStart = new Date(now).setHours(0, 0, 0, 0)
  const yesterdayStart = todayStart - DAY
  if (t >= todayStart) return 'today'
  if (t >= yesterdayStart) return 'yesterday'
  return 'earlier'
}

const GROUP_LABEL: Record<string, string> = { today: '今天', yesterday: '昨天', earlier: '更早' }

export const SessionList: Component<SessionListProps, UIContext> = async (_init, ctx) => {
  // ── 手动状态（组件库纪律：let + render()）──
  let keyword = ''
  let renamingId: string | undefined
  let renameValue = ''
  /** 键盘导航焦点 id（与 activeId 独立：方向键移动高亮） */
  let focusId: string | undefined

  return async (props) => {
    const { sessions, activeId, onSelect, onNew, onRename, onDelete, searchable, newLabel = '新建会话' } = props

    // 搜索过滤 + 分组
    const filtered = keyword
      ? sessions.filter((s) => s.title.toLowerCase().includes(keyword.toLowerCase()))
      : sessions
    const groups: { key: string; items: Session[] }[] = []
    for (const s of filtered) {
      const k = groupKey(s.updatedAt ?? 0)
      const g = groups.find((x) => x.key === k)
      if (g) g.items.push(s)
      else groups.push({ key: k, items: [s] })
    }

    // 键盘焦点索引（flatten）
    const flat = filtered
    const focusIdx = focusId ? flat.findIndex((s) => s.id === focusId) : flat.findIndex((s) => s.id === (activeId ?? ''))

    const handleListKeyDown = (e: any) => {
      if (flat.length === 0) return
      const cur = focusIdx >= 0 ? focusIdx : 0
      let next = cur
      if (e.key === 'ArrowDown') next = Math.min(cur + 1, flat.length - 1)
      else if (e.key === 'ArrowUp') next = Math.max(cur - 1, 0)
      else return
      e.preventDefault()
      focusId = flat[next].id
      ctx.render()
    }

    // 行渲染
    const renderRow = (s: Session) => {
      const active = s.id === activeId
      const focused = s.id === focusId
      const isRenaming = s.id === renamingId

      if (isRenaming) {
        return h('div', {
          key: s.id,
          class: 'wf-session-item wf-session-item--rename',
          'data-id': s.id,
        }, h('input', {
          class: 'wf-session-rename-input',
          value: renameValue,
          'aria-label': '重命名会话',
          onInput: (e: any) => { renameValue = e.target.value },
          onKeyDown: (e: any) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              const v = renameValue.trim()
              if (v) onRename?.(s.id, v)
              renamingId = undefined
              ctx.render()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              renamingId = undefined
              ctx.render()
            }
          },
          onBlur: () => { if (renamingId === s.id) { renamingId = undefined; ctx.render() } },
        }))
      }

      return h('div', {
        key: s.id,
        class: `wf-session-item${active ? ' wf-session-item--active' : ''}${focused ? ' wf-session-item--focus' : ''}`,
        'data-id': s.id,
        role: 'option',
        'aria-selected': active ? 'true' : 'false',
        onClick: () => onSelect?.(s.id),
        onKeyDown: (e: any) => { if (e.key === 'Enter') { e.preventDefault(); onSelect?.(s.id) } },
      }, [
        h('span', { class: 'wf-session-title' }, s.title),
        onRename
          ? h('button', {
              type: 'button',
              class: 'wf-session-rename',
              'aria-label': `重命名 ${s.title}`,
              onClick: (e: Event) => { e.stopPropagation(); renamingId = s.id; renameValue = s.title; ctx.render() },
            }, h(Icon, { name: 'edit' }))
          : null,
        onDelete
          ? h('button', {
              type: 'button',
              class: 'wf-session-del',
              'aria-label': `删除 ${s.title}`,
              onClick: (e: Event) => { e.stopPropagation(); onDelete(s.id) },
            }, h(Icon, { name: 'trash' }))
          : null,
      ])
    }

    const listBody = filtered.length === 0
      ? [h('div', { class: 'wf-session-empty' }, '暂无会话')]
      : groups.map((g) => [
          h('div', { class: 'wf-session-group-title', key: `g-${g.key}` }, GROUP_LABEL[g.key]),
          ...g.items.map(renderRow),
        ])

    return h('div', { class: 'wf-session' }, [
      // 头部：搜索 + 新建
      (searchable || onNew) ? h('div', { class: 'wf-session-head' }, [
        searchable
          ? h('input', {
              class: 'wf-session-search',
              placeholder: '搜索会话…',
              'aria-label': '搜索会话',
              value: keyword,
              onInput: (e: any) => { keyword = e.target.value; ctx.render() },
            })
          : null,
        onNew
          ? h('button', {
              type: 'button',
              class: 'wf-session-new wf-btn wf-btn--primary wf-btn--sm',
              onClick: () => onNew(),
            }, h(Icon, { name: 'plus' }))
          : null,
      ]) : null,
      h('div', {
        class: 'wf-session-list',
        role: 'listbox',
        'aria-label': '会话列表',
        tabindex: onSelect ? 0 : undefined,
        onKeyDown: handleListKeyDown,
      }, listBody),
    ])
  }
}
