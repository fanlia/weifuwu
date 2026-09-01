import type { ChatMessage, MessageTool } from '../lib/types'

/** wf 协议事件面（2027-09 从 Chat.tsx 抽出——纯函数状态机——零 DOM/零闭包）
 *
 *  为什么抽：wf:* 是 AI 回复的完整协议（占位自愈/工具累积/状态推进/完成落定）——
 *  混在 961 行页面闭包内不可单测——抽出后可 node 直测（契约层）——
 *  行为零变更（逐分支原样迁移——应用层调用面同语义）。
 *
 *  事件形状（应用协议——服务端 ws 事件面）：
 *  - wf:step       { messageId, agentId, stepType: 'llm' | 'tool', name?, args? }
 *  - wf:token      { messageId, agentId, text }
 *  - wf:tool_result { messageId, agentId, name, ok, result?, error? }
 *  - wf:done       { messageId, agentId, content?, usage? }
 *  - wf:error      { messageId, agentId }
 */
export interface WfEvent {
  type: string
  messageId?: string
  agentId?: string
  agentName?: string
  stepType?: string
  name?: string
  args?: unknown
  text?: string
  ok?: boolean
  result?: unknown
  error?: string
  content?: string
  usage?: unknown
  /** CHAT-INTERACTION 波次 2：快捷确认选项（wf:done 载荷扩展——AI [[choices:...]] 剥离后） */
  quickReplies?: string[]
}

export interface WfApplyResult {
  /** 新消息数组（不可变更新——应用层直接替换引用——渲染管线引用比较） */
  msgs: ChatMessage[]
  /** AI 干活开关（呼吸灯——step on / done+error off——应用层消费） */
  working: Array<{ agentId: string; on: boolean }>
}

function ensureMsg(msgs: ChatMessage[], ev: WfEvent): { arr: ChatMessage[]; idx: number } {
  const mid = String(ev.messageId ?? '')
  const idx = msgs.findIndex((m) => m.id === mid)
  if (idx !== -1) return { arr: msgs, idx }
  if (!mid) return { arr: msgs, idx: -1 }
  // 占位自愈（2027-09——工具型回复首事件可能是 wf:step tool（无 llm 前置）——
  // 无消息时创建 generating 占位——token/done 接续——否则前端零消息）
  return {
    arr: [...msgs, {
      id: mid, sender_id: ev.agentId ?? 'ai', sender_name: ev.agentName ?? 'AI',
      sender_type: 'ai', content: '', msg_type: 'text', created_at: new Date().toISOString(),
      status: 'generating', tools: [] as MessageTool[],
    }],
    idx: msgs.length,
  }
}

/**
 * 单事件应用（纯函数——不可变更新——同事件幂等语义与 Chat.tsx 原实现一致）
 *  - step llm：状态推进 thinking（complete/error 不降级）
 *  - step tool：同名 running 不去重（无同名 running 才追加）
 *  - token：累积 + generating（complete/error 不降级）
 *  - tool_result：running → done/error（B1——失败显式 error——非静默完成）
 *  - done：content/usage 落定 + complete；error：⚠️ + error 态
 */
export function applyWfEvent(msgs: ChatMessage[], ev: WfEvent): WfApplyResult {
  const working: Array<{ agentId: string; on: boolean }> = []
  const agentId = ev.agentId ?? 'ai'

  if (ev.type === 'wf:step') {
    const r = ensureMsg(msgs, ev)
    let arr = r.arr
    const idx = r.idx
    if (idx !== -1) {
      const m = arr[idx]
      if (ev.stepType === 'llm') {
        if (m.status !== 'complete' && m.status !== 'error') arr = arr.map((x, i) => (i === idx ? { ...x, status: 'thinking' as const } : x))
      } else if (ev.stepType === 'tool') {
        const tools = m.tools ?? []
        if (!tools.some((t) => t.name === ev.name && t.status === 'running')) {
          arr = arr.map((x, i) => (i === idx ? { ...x, tools: [...tools, { name: ev.name ?? 'tool', args: ev.args, status: 'running' as const }] } : x))
        }
      }
    }
    working.push({ agentId, on: true })
    return { msgs: arr, working }
  }

  if (ev.type === 'wf:token') {
    const r = ensureMsg(msgs, ev)
    let arr = r.arr
    if (r.idx !== -1) {
      arr = arr.map((x, i) => (i === r.idx
        ? { ...x, content: x.content + (ev.text ?? ''), status: x.status !== 'complete' && x.status !== 'error' ? ('generating' as const) : x.status }
        : x))
    }
    return { msgs: arr, working }
  }

  if (ev.type === 'wf:tool_result') {
    const r = ensureMsg(msgs, ev)
    let arr = r.arr
    if (r.idx !== -1) {
      const m = arr[r.idx]
      const isErr = ev.ok === false
      const newStatus: 'done' | 'error' = isErr ? 'error' : 'done'
      const tools = (m.tools ?? []).map((t) => t.name === ev.name && t.status === 'running'
        ? { ...t, status: newStatus, result: isErr ? `执行失败：${ev.error ?? String(ev.result ?? '未知错误')}` : ev.result }
        : t)
      arr = arr.map((x, i) => (i === r.idx
        ? { ...x, tools, status: x.status !== 'complete' && x.status !== 'error' ? ('thinking' as const) : x.status }
        : x))
    }
    return { msgs: arr, working }
  }

  if (ev.type === 'wf:done') {
    const r = ensureMsg(msgs, ev)
    let arr = r.arr
    if (r.idx !== -1) {
      const m = arr[r.idx]
      arr = arr.map((x, i) => (i === r.idx
        ? { ...x, content: ev.content ?? x.content, status: 'complete' as const, usage: (ev.usage as ChatMessage['usage']) ?? x.usage, quick_replies: ev.quickReplies ?? x.quick_replies }
        : x))
      // CHAT-UX 波次 1（C1 兕底）：事件无 agentId 时从消息 sender_id 推导——
      // 服务端漏带也不卡灯（呼吸灯永久「干活中…」实证的客户端防线）
      working.push({ agentId: ev.agentId ?? m.sender_id ?? agentId, on: false })
    } else {
      working.push({ agentId, on: false })
    }
    return { msgs: arr, working }
  }

  if (ev.type === 'wf:error') {
    const r = ensureMsg(msgs, ev)
    let arr = r.arr
    if (r.idx !== -1) {
      const m = arr[r.idx]
      arr = arr.map((x, i) => (i === r.idx
        ? { ...x, content: x.content || '⚠️ AI 回复失败', status: 'error' as const }
        : x))
      working.push({ agentId: ev.agentId ?? m.sender_id ?? agentId, on: false })
    } else {
      working.push({ agentId, on: false })
    }
    return { msgs: arr, working }
  }

  return { msgs, working }
}
