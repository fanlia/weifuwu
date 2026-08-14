/**
 * 风险策略引擎（C2）——工具调用风险分级（规则层优先于模型自判）
 *
 * 分级：
 *   high    删除/破坏/写外部 —— 必须人工审批
 *   medium  写工作区/命令执行/网络 —— 按 Agent 策略（智能分级默认审批）
 *   low     读/查询/检索 —— 自动执行（不审批）
 *
 * 策略（Agent 配置 risk_policy）：
 *   auto    智能分级（默认）——low 自动，medium/high 审批
 *   strict  严格审批——全部审批（兼容旧 human_in_the_loop=true 语义）
 *   off     关闭审批——全部自动
 *
 * 原则：策略是规则（信任边界），模型自判（未来 C2 增强）是建议——当前纯规则，零额外 LLM 调用。
 */

export type RiskLevel = 'low' | 'medium' | 'high'

export interface RiskPolicy {
  risk_policy: 'auto' | 'strict' | 'off'
}

/** 危险参数模式（含工具名兜底） */
const HIGH_PATTERNS: RegExp[] = [
  /\brm\b/i, /\bdelete\b/i, /\bremove\b/i, /\bdrop\b/i, /\btruncate\b/i,
  /\bunlink\b/i, /\bformat\b/i, /\bshutdown\b/i, /\breboot\b/i,
  /--force\b/i, /-rf\b/i,
]

const MEDIUM_PATTERNS: RegExp[] = [
  /\bwrite\b/i, /\bedit\b/i, /\bsave\b/i, /\bmv\b/i, /\brename\b/i, /\bmkdir\b/i,
  /\bexec\b/i, /\bbash\b/i, /\bcommand\b/i, /\bshell\b/i,
  /\bhttp\b/i, /\bpost\b/i, /\bfetch\b/i, /\brequest\b/i, /\bnetwork\b/i, /\bcurl\b/i,
]

/**
 * 工具调用风险判定（工具名 + 参数序列化——纯规则，确定性）
 */
export function riskOf(name: string, args: unknown): RiskLevel {
  const blob = `${name} ${JSON.stringify(args ?? {})}`
  if (HIGH_PATTERNS.some((re) => re.test(blob))) return 'high'
  if (MEDIUM_PATTERNS.some((re) => re.test(blob))) return 'medium'
  return 'low'
}

/**
 * 是否需要审批（按策略 + 风险）：
 *   off → false；strict → true；auto → risk !== 'low'
 */
export function needsApproval(policy: RiskPolicy['risk_policy'], name: string, args: unknown): boolean {
  if (policy === 'off') return false
  if (policy === 'strict') return true
  return riskOf(name, args) !== 'low'
}
