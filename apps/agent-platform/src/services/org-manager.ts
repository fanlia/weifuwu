/**
 * 组织层级服务（2026-12）——部门经理（type='department'）生命周期辅助
 *
 * 职责：
 * - 生成/刷新经理提示词（部门身份 + 成员名单——call_agent 分派用）
 *   成员增删后调用 refreshManagerPrompt——提示词不落快照（创建时成员名单会过期）
 */
import type { Orm } from 'weifuwu'
import { and, eq } from 'weifuwu'
import { tables } from '../db/orm.ts'

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
 * 刷新部门经理提示词（成员名单实时化——表绑定面）
 * 调用时机：部门成员添加/移除后；部门创建后
 */
export async function refreshManagerPrompt(orm: Orm, appId: string, departmentId: string): Promise<void> {
  try {
    const T = tables(orm)
    const [mgr] = await T.agents
      .select('id')
      .where(and(eq(T.agents.c.department_id, departmentId), eq(T.agents.c.type, 'department'), eq(T.agents.c.is_active, true)))
      .run()
    if (!mgr) return
    const [dept] = await T.departments
      .select('name')
      .where(and(eq(T.departments.c.id, departmentId), eq(T.departments.c.app_id, appId)))
      .run()
    if (!dept) return
    // 成员名单（经理本人除外——ai/knowledge_base 类型入册）——一对一 JOIN 表绑定
    const memberRows = await orm.query.from('department_members dm')
      .select('a.name')
      .join('agents a', { 'a.id': { col: 'dm.agent_id' } })
      .where(and(
        { 'dm.department_id': { eq: departmentId }},
        { 'a.type': { in: ['ai', 'knowledge_base'] } },
        { 'a.id': { ne: String(mgr.id) } },
      ))
      .run()
    const names = (memberRows ?? []).map((m) => String((m as Record<string, unknown>).name)).join('、')
    await T.agents
      .update({ system_prompt: buildManagerPrompt(String(dept.name), String(names)) })
      .where(eq(T.agents.c.id, String(mgr.id)))
      .run()
  } catch { /* 刷新失败不阻断成员变更 */ }
}
