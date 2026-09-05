/**
 * 一键演示空间（BUSINESS-SCENARIO-PLAN W1——G-A 冷启动）
 *
 * 新租户 3 步见到 AI：部门 + 客服 AI + 知识库 + 经理——零 LLM 依赖。
 * FAQ 文档种子判负：内容因企业而异——空 KB 引导用户贴自己的文档更诚实。
 */
import type { Router } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'
import { tables } from '../db/orm.ts'

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
    const { orm, appId } = ctx

    // W2 事务收口（试点 2）：演示空间 7 写原子化（部门+经理+客服 AI+知识库+3 成员）
    // ——任一写失败整链回滚（不残留半成品演示空间——一键演示是 UX 承诺：要么完整要么没有）
    const { dept, mgr, ai, kb } = await orm.transaction(async (tx) => {
      const T = tables(tx)
      // 1) 部门
      const [dept2] = await T.departments.insert({ app_id: String(appId), name: '演示项目' }).returning('id').run()
      // 2) 经理（与 departments 自动创建对齐——org-manager 提示词单源）
      const [mgr2] = await T.agents
        .insert({ app_id: String(appId), type: 'department', name: '演示项目经理', description: '部门经理——代表「演示项目」对外协作',
          model: 'deepseek-v4-flash', department_id: String(dept2.id), is_active: true, tools: [], allow_file_tools: true })
        .returning('id')
        .run()
      await T.department_members
        .insert({ department_id: String(dept2.id), agent_id: String(mgr2.id), role: 'manager' })
        .run()
      // 3) 客服 AI + 知识库
      const [ai2] = await T.agents
        .insert({ app_id: String(appId), type: 'ai', name: '客服小知', description: '演示客服助手',
          system_prompt: '你是「演示项目」的客服助手，礼貌、简洁地回应用户问题；不确定时说明并建议补充资料。',
          model: 'deepseek-chat', department_id: String(dept2.id), is_active: true, tools: [] })
        .returning('id')
        .run()
      const [kb2] = await T.agents
        .insert({ app_id: String(appId), type: 'knowledge_base', name: '产品知识库', department_id: String(dept2.id), is_active: true, tools: [] })
        .returning('id')
        .run()
      // 4) 成员
      await T.department_members
        .insert([{ department_id: String(dept2.id), agent_id: String(ai2.id), role: 'member' }, { department_id: String(dept2.id), agent_id: String(kb2.id), role: 'member' }])
        .run()
      return { dept: dept2, mgr: mgr2, ai: ai2, kb: kb2 }
    })
    // 5) 经理提示词刷新（事务外——best-effort：刷新失败不阻断创建）
    try {
      const { refreshManagerPrompt } = await import('../services/org-manager.ts')
      await refreshManagerPrompt(ctx.orm, String(appId), String(dept.id))
    } catch { /* 刷新失败不阻断 */ }

    return Response.json({
      success: true,
      department: { id: dept.id, name: '演示项目' },
      manager: mgr.id,
      agents: [ai.id, kb.id],
    }, { status: 201 })
  })
}
