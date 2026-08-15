/**
 * 组织层级服务（2026-12）——部门经理（type='department'）生命周期辅助
 *
 * 职责：
 * - 生成/刷新经理提示词（部门身份 + 成员名单——call_agent 分派用）
 *   成员增删后调用 refreshManagerPrompt——提示词不落快照（创建时成员名单会过期）
 */

type Sql = any

/** 生成经理系统提示词（部门名 + 当前成员名单） */
function buildManagerPrompt(deptName: string, memberNames: string): string {
  return `你是「${deptName}」的部门经理，代表该部门参与协作。

你的职责：
1. 作为部门代表回答与其他部门的协作请求
2. 需要部门成员实际干活时，用 call_agent 工具把任务分派给成员（一次一个成员）
3. 汇总成员结果后回复——你就是「${deptName}」的对外出口

部门成员：${memberNames || '（暂无 AI 成员——请先给部门添加 AI 能力）'}

任务完成后按以下结构汇报：
- ✅ 已完成：列出完成的事项
- ⚠️ 未完成：列出未完成的事项及原因（没有则省略）
- 📦 产物：生成的文件/结果位置（没有则省略）`
}

/**
 * 刷新部门经理提示词（成员名单实时化）
 * 调用时机：部门成员添加/移除后；部门创建后
 */
export async function refreshManagerPrompt(sql: Sql, appId: string, departmentId: string): Promise<void> {
  try {
    const [mgr] = await sql`
      SELECT id FROM agents WHERE department_id = ${departmentId} AND type = 'department' AND is_active = TRUE
    `
    if (!mgr) return
    const [dept] = await sql`SELECT name FROM departments WHERE id = ${departmentId} AND app_id = ${appId}`
    if (!dept) return
    const members = await sql`
      SELECT a.name FROM department_members dm JOIN agents a ON a.id = dm.agent_id
      WHERE dm.department_id = ${departmentId} AND a.type IN ('ai', 'knowledge_base') AND a.id != ${mgr.id}
    `
    const names = (members ?? []).map((m: any) => m.name).join('、')
    await sql`
      UPDATE agents SET system_prompt = ${buildManagerPrompt(String(dept.name), String(names))}
      WHERE id = ${mgr.id}
    `
  } catch { /* 刷新失败不阻断成员变更 */ }
}
