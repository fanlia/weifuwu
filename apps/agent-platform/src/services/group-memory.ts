/**
 * 群共识记忆（PERSONA-PLAN P4）——记忆层补全
 *
 * 机制：每 N 条消息用轻量模型提取群共识（【已决定】【进行中】【待办】【背景】），
 * 存 group_memories 表；后续所有 AI 上下文注入该摘要——AI 记得"群里决定过什么"。
 * 与 agent_memories（个人记忆）互补：个人记偏好，群记忆记共识。
 * 成本控制：节流生成（每 N 条一次）+ 轻量模型 + 失败静默。
 */

export const GROUP_MEMORY_INTERVAL = 20 // 每 20 条消息生成/刷新一次
export const GROUP_MEMORY_MAX = 500 // 摘要上限字符

/** 节流判定：msg_count 达到 N 的倍数时生成 */
export function shouldGenerateGroupMemory(msgCount: number, interval = GROUP_MEMORY_INTERVAL): boolean {
  return msgCount > 0 && msgCount % interval === 0
}

/** 摘要注入层（systemPrompt 追加段） */
export function buildGroupMemoryLayer(summary: string): string {
  if (!summary || !summary.trim()) return ''
  return `【群共识记忆】这是群里此前讨论的结论——优先遵守：
${summary.trim().slice(0, GROUP_MEMORY_MAX)}`
}

/** LLM 提取提示（轻量模型——成本可控） */
export const GROUP_MEMORY_PROMPT = `从群聊消息中提取群共识，格式：
【已决定】群里敲定的事项
【进行中】正在做的事
【待办】答应要做还没做的
【背景】反复出现的背景信息
没有的段落省略。只输出摘要本身，最多 150 字。`

/**
 * 群共识更新（fire-and-forget——不阻塞消息流）
 * 模式对齐 C3 updateMemory：失败静默。
 */
export async function updateGroupMemory(
  ctx: any,
  departmentId: string,
): Promise<void> {
  try {
    const { sql } = ctx
    // 计数（幂等 upsert 初始化）
    const [row] = await sql`
      INSERT INTO group_memories (department_id, msg_count)
      VALUES (${departmentId}, 1)
      ON CONFLICT (department_id) DO UPDATE SET msg_count = group_memories.msg_count + 1
      RETURNING msg_count
    `
    const count = Number(row?.msg_count ?? 0)
    if (!shouldGenerateGroupMemory(count)) return

    // 取最近消息（含署名——P1-1 格式复用）
    const recent = (await sql`
      SELECT a.name as sender_name, m.content
      FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE m.department_id = ${departmentId} AND m.ai_approved != FALSE
      ORDER BY m.created_at DESC
      LIMIT 30
    `) as unknown as Array<{ sender_name: string; content: string }>
    if (recent.length === 0) return

    const transcript = recent.reverse()
      .map((m) => `[${String(m.sender_name ?? '未知')}] ${String(m.content ?? '').slice(0, 200)}`)
      .join('\n')
      .slice(0, 6000)

    // 轻量模型优先（lightModel 配置在 agent 上——这里取部门任一 AI 的配置；无则主模型）
    let lightModel: string | undefined
    try {
      const [anyAgent] = await sql`SELECT light_model FROM agents WHERE app_id = ${ctx.appId} AND light_model IS NOT NULL LIMIT 1`
      lightModel = anyAgent?.light_model ? String(anyAgent.light_model) : undefined
    } catch { /* 无轻量模型配置 */ }

    const ai = ctx.ai
    const res = await ai.chat({
      model: lightModel,
      messages: [
        { role: 'system', content: GROUP_MEMORY_PROMPT },
        { role: 'user', content: transcript },
      ],
      max_tokens: 200,
    })
    const summary = String(res?.choices?.[0]?.message?.content ?? '').trim()
    if (summary && summary.length > 10) {
      await sql`
        INSERT INTO group_memories (department_id, summary, updated_at)
        VALUES (${departmentId}, ${summary.slice(0, GROUP_MEMORY_MAX)}, NOW())
        ON CONFLICT (department_id) DO UPDATE SET summary = EXCLUDED.summary, updated_at = NOW()
      `
    }
  } catch { /* 群共识更新失败静默——不影响消息流 */ }
}
