/**
 * C5 答案缓存——相似问题直接返回缓存答案（零 token）
 *
 * 相似度：字符二元组集合 Jaccard（中文友好、零依赖）。
 * 缓存策略：通用/事实型问题缓存；个性化（我/我的）、时效型（几号/天气）不缓存。
 * 命中回复带标注 + 计数——价值报告可统计缓存节省。
 */

export const CACHE_THRESHOLD = 0.7 // 相似度命中阈值（同义句 0.75、无关句 0——0.7 安全）

/** 特征集合：一元组 + 二元组混合（中文+英文混排友好——词序弱敏感） */
function features(text: string): Set<string> {
  const set = new Set<string>()
  const t = String(text ?? '').replace(/\s+/g, '').toLowerCase()
  for (let i = 0; i < t.length; i++) {
    set.add(`1:${t[i]}`)
    if (i < t.length - 1) set.add(`2:${t.slice(i, i + 2)}`)
  }
  return set
}

/** Jaccard 相似度 [0,1]（混合特征——"什么是 REST API？" vs "REST API 是什么？" 高相似） */
export function similarity(a: string, b: string): number {
  const sa = features(a)
  const sb = features(b)
  if (sa.size === 0 && sb.size === 0) return 1
  let inter = 0
  for (const g of sa) if (sb.has(g)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 0 : inter / union
}

/** 个性化/时效性问题不缓存 */
// 个人数据模式："我的+具体名词"（订单/余额/账户…）——"给我写个代码"（祈使）仍可缓存
const PERSONAL_DATA_RE = /我的[^，。！？\s]{0,8}(订单|余额|账户|信息|数据|文件|密码|记录|资料|位置|状态|名字|号码|聊天|对话)/
const TIME_SENSITIVE_RE = /(今天|明天|昨天|现在|几号|几点|天气|新闻|最新|当前|最新消息)/

export function shouldCacheQuestion(question: string): boolean {
  const q = String(question ?? '')
  if (PERSONAL_DATA_RE.test(q)) return false
  if (TIME_SENSITIVE_RE.test(q)) return false
  return q.length >= 4 // 太短的问题（"你好"）无缓存价值
}

export interface CachedAnswer {
  question: string
  answer: string
  hits: number
}

/** 在缓存中查找相似问题（≥ 阈值命中） */
export function findCachedAnswer(question: string, cache: CachedAnswer[]): CachedAnswer | null {
  let best: CachedAnswer | null = null
  let bestSim = 0
  for (const c of cache) {
    const sim = similarity(question, c.question)
    if (sim > bestSim) { bestSim = sim; best = c }
  }
  return best && bestSim >= CACHE_THRESHOLD ? best : null
}

/** 缓存命中回复（标注来源 + 命中次数——价值可见） */
export function buildCachedReply(answer: string, hits: number): string {
  return `${answer}\n\n（来自缓存答案——同类问题已回复 ${hits} 次，零 token 消耗）`
}
