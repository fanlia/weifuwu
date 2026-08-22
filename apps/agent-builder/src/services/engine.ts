/**
 * agent-builder 回合引擎（Phase 2——叙事模式最小）
 *
 * 事件 → 激活 agents（payload.target 或全部）→ 每 agent 一个对话回合
 * （LLM 按人设 + 关系上下文回应）→ 记录 ab_turns（叙事流可回溯）。
 * Phase 3+：叙事者整合 / 行动回合（code/browse）/ 周期推进。
 */
import type { WorldCtx } from '../routes/worlds.ts'

interface AgentRow { id: string; name: string; persona: string; capabilities: string[]; weight: number }
interface RelationRow { id: string; from_agent: string; to_agent: string; type: string; strength: number; directed: boolean; from_name?: string; to_name?: string }

/** 人设 + 世界背景 + 关系上下文 → system prompt（世界模型的灵魂：身份 × 关系） */
function buildAgentPrompt(worldName: string, agent: AgentRow, relations: RelationRow[]): string {
  const relLines = relations
    .filter((r) => r.from_agent === agent.id || r.to_agent === agent.id)
    .map((r) => {
      const other = r.from_agent === agent.id
        ? (r.to_name ?? r.to_agent)
        : (r.from_name ?? r.from_agent)
      const dir = r.from_agent === agent.id ? (r.directed ? '→' : '⇄') : (r.directed ? '←' : '⇄')
      return `- ${other}（${r.type}·强度 ${r.strength}）`
    })
  const weightLine = agent.weight && agent.weight > 1
    ? `你代表 ${agent.weight} 人（代表性原型——你的立场影响 ${agent.weight} 人的权重）。`
    : ''
  return [
    `你在世界「${worldName}」中扮演：${agent.name}。`,
    `人设：${agent.persona || '（未设定——请保持中立自然）'}`,
    weightLine,
    relLines.length ? `你与世界其他角色的关系：\n${relLines.join('\n')}` : '',
    '以你的身份对事件作出回应——用第一人称，符合你的性格与立场，2-4 句话。',
  ].filter(Boolean).join('\n\n')
}

/** 默认问卷题目（payload.questions 缺省——批处理 survey 模式） */
const DEFAULT_QUESTIONS = ['总体满意度（1-5 分）', '价格与价值评价', '改进建议']

/** 执行一个事件的全部回合（异步——POST 不阻塞）
 *  模式分发：survey（批处理——行动回合：按人设生成问卷答案 JSON）
 *           其他（叙事——对话回合：按人设回应事件） */
export async function runEventTurns(ctx: WorldCtx, eventId: string): Promise<void> {
  try {
    const [ev] = await ctx.sql.unsafe<{ id: string; world_id: string; type: string; payload: { description?: string; target?: string[]; title?: string; questions?: string[] } }>(
      'SELECT * FROM ab_events WHERE id = $1', [eventId])
    if (!ev) return
    const [world] = await ctx.sql.unsafe<{ name: string }>('SELECT name FROM ab_worlds WHERE id = $1', [ev.world_id])
    const target = Array.isArray(ev.payload?.target) ? ev.payload.target : null
    const agents = target && target.length > 0
      ? await ctx.sql.unsafe<AgentRow>('SELECT * FROM ab_agents WHERE world_id = $1 AND id = ANY($2::uuid[])',
          [ev.world_id, `{${target.join(',')}}`]) // PG 数组字面量（协议层 JS 数组编码问题绕开）
      : await ctx.sql.unsafe<AgentRow>('SELECT * FROM ab_agents WHERE world_id = $1', [ev.world_id])
    const relations = await ctx.sql.unsafe<RelationRow>(
      `SELECT r.*, fa.name AS from_name, ta.name AS to_name
       FROM ab_relations r JOIN ab_agents fa ON fa.id = r.from_agent JOIN ab_agents ta ON ta.id = r.to_agent
       WHERE r.world_id = $1`, [ev.world_id])
    const desc = String(ev.payload?.description ?? '')
    const isSurvey = ev.type === 'survey'
    const isCycle = ev.type === 'cycle'
    const isPolicy = ev.type === 'policy'
    const questions = Array.isArray(ev.payload?.questions) && ev.payload.questions.length > 0
      ? ev.payload.questions
      : DEFAULT_QUESTIONS
    await ctx.sql.unsafe("UPDATE ab_events SET status = 'running' WHERE id = $1", [eventId])
    for (const agent of agents) {
      const kind = isSurvey ? 'survey' : (isCycle || isPolicy) ? 'action' : 'dialogue'
      const [turn] = await ctx.sql.unsafe<{ id: string }>(
        "INSERT INTO ab_turns (event_id, agent_id, kind, input, status) VALUES ($1, $2, $3, $4, 'running') RETURNING id",
        [eventId, agent.id, kind, desc])
      try {
        const user = isSurvey
          ? `问卷《${ev.payload?.title ?? '调查'}》——题目：\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n请以 ${agent.name} 的身份逐题作答，输出 JSON：{"answers": {"题目": "你的答案"}}——不要输出 JSON 以外的内容。`
          : isCycle
            ? `经营周期事件：${desc}\n\n这是新一经营周期。请以 ${agent.name} 的岗位职责作出本周期行动与决策——含：1) 你关注什么 2) 你采取的行动/决策 3) 你对上级的汇报要点。用第一人称，2-4 句话。`
            : isPolicy
              ? `城市政策提案：${desc}\n\n请以 ${agent.name} 的群体身份评估这项政策——含：1) 对你代表的群体影响如何 2) 你支持还是反对（及理由）3) 你的诉求。用第一人称，2-4 句话。`
              : `世界事件：${desc}\n\n请以你的身份回应。`
        const res = await ctx.ai.chat({
          model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
          messages: [
            { role: 'system', content: buildAgentPrompt(world?.name ?? '未命名世界', agent, relations) },
            { role: 'user', content: user },
          ],
          temperature: isSurvey ? 0.7 : 0.8,
          max_tokens: isSurvey ? 700 : 500,
        })
        const content = res.choices?.[0]?.message?.content ?? ''
        await ctx.sql.unsafe("UPDATE ab_turns SET output = $2, status = 'done' WHERE id = $1", [turn.id, content])
      } catch (e) {
        await ctx.sql.unsafe("UPDATE ab_turns SET status = 'error', error = $2 WHERE id = $1",
          [turn.id, String((e as Error).message).slice(0, 500)])
      }
    }
    // 政策事件闭环：聚合各代表回应 → 指标影响评估（宏观层 L0 最小——
    // LLM 综合评估——后续可替换为方程模型）
    if (isPolicy) {
      try {
        const doneTurns = await ctx.sql.unsafe<{ agent_name: string; output: string }>(
          `SELECT a.name AS agent_name, t.output FROM ab_turns t JOIN ab_agents a ON a.id = t.agent_id
           WHERE t.event_id = $1 AND t.status = 'done'`, [eventId])
        if (doneTurns.length > 0) {
          const summary = doneTurns.map((t) => `${t.agent_name}：${t.output.slice(0, 200)}`).join('\n')
          const res = await ctx.ai.chat({
            model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
            messages: [
              { role: 'system', content: '你是城市政策评估分析师。综合各群体代表的回应，评估政策实施后的宏观指标影响。输出 JSON：{"indicators": {"指标名": "变化描述（含方向 ↑/↓/→ 与程度）"}, "consensus": "一句话共识", "support": "支持率估计（百分数）"}——不要输出 JSON 以外的内容。' },
              { role: 'user', content: `政策与各群体回应：\n${summary}` },
            ],
            temperature: 0.4,
            max_tokens: 500,
          })
          const impact = res.choices?.[0]?.message?.content ?? ''
          const ev = await ctx.sql.unsafe<{ payload: Record<string, unknown> }>('SELECT payload FROM ab_events WHERE id = $1', [eventId])
          if (ev[0]) {
            await ctx.sql.unsafe('UPDATE ab_events SET payload = $2 WHERE id = $1',
              [eventId, JSON.stringify({ ...(ev[0].payload ?? {}), impact })])
          }
        }
      } catch (e) {
        console.error('[engine] 指标评估失败:', e)
      }
    }
    await ctx.sql.unsafe("UPDATE ab_events SET status = 'done' WHERE id = $1", [eventId])
  } catch (e) {
    console.error('[engine] 回合执行失败:', e)
  }
}
