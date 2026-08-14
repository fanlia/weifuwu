/**
 * AI 人格化（PERSONA-PLAN P0/P1/P2）——成员协议注入层
 *
 * AI/人可替换的核心：所有成员（无论人还是 AI）遵循同一套群协作协议。
 * 本模块提供纯函数，生成注入 AI 上下文的"人格层"：
 * - 同事名单（AI 知道群里还有谁、各擅长什么——分工共识）
 * - 历史消息署名（谁在说——语境）
 * - reply_to 引用（回的是哪条——语境）
 * - 协作纪律（认领/移交/汇报/称呼——行为协议，P2）
 *
 * 纪律均来自真实体验推演（PERSONA-PLAN）：真人团队群协作的隐性协议。
 */

export interface RosterMember {
  id: string
  name: string
  /** agents.type：user（真人）| ai | knowledge_base | webhook */
  type: string
  /** department_members.role：admin | member */
  role?: string | null
  /** agents.role_label：角色标签（如"财务分析"） */
  roleLabel?: string | null
  /** agents.expertise：专长描述（如"Excel/报表/预算"） */
  expertise?: string | null
}

const TYPE_LABEL: Record<string, string> = {
  user: '人',
  ai: 'AI',
  knowledge_base: '知识库',
  webhook: 'Webhook',
}

function typeLabelOf(type: string): string {
  return TYPE_LABEL[type] ?? type
}

/**
 * 同事名单文本（注入 AI 上下文——分工共识的基础）
 * 例：
 *   【本部门成员】
 *   - 王总（人·管理员）——老板/决策人
 *   - 财务助手（AI·财务分析）——Excel/报表/预算 ← 你
 *   - 产品知识库（知识库）——产品资料检索
 */
export function buildRosterText(members: RosterMember[], selfId: string): string {
  const lines = members.map((m) => {
    const typePart = [typeLabelOf(m.type), m.role === 'admin' ? '管理员' : ''].filter(Boolean).join('·')
    const tag = m.roleLabel ? `·${m.roleLabel}` : ''
    const expert = m.expertise ? `——${m.expertise}` : ''
    const selfMark = m.id === selfId ? ' ← 你' : ''
    return `- ${m.name}（${typePart}${tag}）${expert}${selfMark}`
  })
  return `【本部门成员】\n${lines.join('\n')}`
}

/**
 * 历史消息内容格式化：发信人署名 + reply_to 引用
 * 例：[王总] 把 Q3 报告发我
 * 例：[财务助手]（回复 [王总] "把 Q3 报告发我"）好的，马上
 */
export function buildHistoryContent(msg: {
  content: string
  senderName: string
  replyTo?: { senderName: string; content: string }
}): string {
  const prefix = `[${msg.senderName}]`
  if (msg.replyTo) {
    const quoted = msg.replyTo.content.length > 80 ? `${msg.replyTo.content.slice(0, 80)}…` : msg.replyTo.content
    return `${prefix}（回复 [${msg.replyTo.senderName}] "${quoted}"）${msg.content}`
  }
  return `${prefix} ${msg.content}`
}

export interface WorkspaceFileEntry {
  path: string
  size: number
  mtime?: string
}

const WORKSPACE_IGNORE = /(^|\/)(node_modules|\.git|\.next|dist|__pycache__)(\/|$)|(^|\/)\.[^\/]*$/

/**
 * 工作空间文件地图（C3 增强）——AI 开局就知道工作空间有什么
 * 例：
 *   【工作空间文件】
 *   - sales.csv（30B）
 *   - uploads/c2.csv（30B）
 *   - report.xlsx（9.5KB）
 *   需要读取时直接用相对路径（相对于工作空间根 /ws），无需 list_files。
 */
export function buildWorkspaceLayer(files: WorkspaceFileEntry[]): string {
  const visible = files.filter((f) => f.path && !WORKSPACE_IGNORE.test(f.path))
  if (visible.length === 0) return ''
  const lines = visible.map((f) => {
    const size = f.size >= 1024 ? `${(f.size / 1024).toFixed(1)}KB` : `${f.size}B`
    return `- ${f.path}（${size}）`
  })
  return `【工作空间文件】\n${lines.join('\n')}\n需要读取时直接用相对路径（相对于工作空间根 /ws），无需 list_files。`
}

/**
 * 统一人格注入层（chat.ts 各 systemPrompt 拼接点收敛到此处）
 * - 名单段：透传 buildRosterText 结果
 * - 协作纪律段：认领/委托/称呼/被@响应（P2——行为协议）
 */
export function buildPersonaLayer(opts: { rosterText: string; selfName: string }): string {
  return `${opts.rosterText}

【协作方式】你是本群成员，像真人同事一样协作：
1. 被 @ 时必须响应；看到需要你专业能力的问题可以主动参与
2. 需要专业协助时用 call_agent 委托（对方会知道是你委托的）；回复用 [对方名字] 称呼（如 "[王总] 好的"）
3. 收到任务先确认再执行；完成时汇报结果；失败必须明说原因并给出补全路径
4. 看到其他成员回复与你的认知不一致时，显式说明分歧点（给理由，不空对空）
5. 称呼、致谢、道歉——像真人同事一样自然；**禁止称对方为'用户'或'该用户'**——用'你/您'或对方名字

【组织角色】名单中标"管理员"的成员是群负责人/决策人：重要结论向他汇报，需要拍板的事项交给他；你是执行者——提方案、给建议，但最终决定权在负责人`
}
