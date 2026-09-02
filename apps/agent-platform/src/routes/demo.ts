/**
 * 一键演示空间（BUSINESS-SCENARIO-PLAN W1——G-A 冷启动）
 *
 * 新租户 3 步见到 AI：部门 + 客服 AI + 知识库 + 经理——零 LLM 依赖。
 * FAQ 文档种子判负：内容因企业而异——空 KB 引导用户贴自己的文档更诚实。
 */
import type { Router } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'

export function registerDemoRoutes(app: Router<any>): void {
  app.post('/api/demo/space', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    // 权限：与建部门一致（owner 专属）
    try {
      const { requireWriter, appRoleOf } = await import('../services/permissions.ts')
      await requireWriter(ctx)
      if (await appRoleOf(ctx) !== 'owner') throw new Error('只有租户所有者可以创建演示空间')
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '无权操作' }, { status: e?.status ?? 403 })
    }
    const { sql, appId } = ctx

    // 1) 部门
    const [dept] = await sql`
      INSERT INTO departments (app_id, name) VALUES (${appId}, '演示项目')
      RETURNING id
    `
    // 2) 经理（与 departments 自动创建对齐——org-manager 提示词单源）
    const [mgr] = await sql`
      INSERT INTO agents (app_id, type, name, description, model, department_id, is_active, tools, allow_file_tools)
      VALUES (${appId}, 'department', '演示项目经理', '部门经理——代表「演示项目」对外协作',
        'deepseek-v4-flash', ${dept.id}, true, '[]', true)
      RETURNING id
    `
    await sql`
      INSERT INTO department_members (department_id, agent_id, role)
      VALUES (${dept.id}, ${mgr.id}, 'manager')
    `
    // 3) 客服 AI + 知识库
    const [ai] = await sql`
      INSERT INTO agents (app_id, type, name, description, system_prompt, model, department_id, is_active, tools)
      VALUES (${appId}, 'ai', '客服小知', '演示客服助手',
        '你是「演示项目」的客服助手，礼貌、简洁地回应用户问题；不确定时说明并建议补充资料。',
        'deepseek-chat', ${dept.id}, true, '[]')
      RETURNING id
    `
    const [kb] = await sql`
      INSERT INTO agents (app_id, type, name, department_id, is_active, tools)
      VALUES (${appId}, 'knowledge_base', '产品知识库', ${dept.id}, true, '[]')
      RETURNING id
    `
    // 4) 成员
    await sql`
      INSERT INTO department_members (department_id, agent_id, role)
      VALUES (${dept.id}, ${ai.id}, 'member'), (${dept.id}, ${kb.id}, 'member')
    `
    // 5) 经理提示词刷新（成员名单实时化——org-manager 单源）
    try {
      const { refreshManagerPrompt } = await import('../services/org-manager.ts')
      await refreshManagerPrompt(sql, String(appId), String(dept.id))
    } catch { /* 刷新失败不阻断 */ }

    return Response.json({
      success: true,
      department: { id: dept.id, name: '演示项目' },
      manager: mgr.id,
      agents: [ai.id, kb.id],
    }, { status: 201 })
  })
}
