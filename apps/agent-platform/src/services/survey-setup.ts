/**
 * 问卷角色池一键创建（BUSINESS-SCENARIO W2——G-G 开箱——替代手工 seed-survey-agents.mjs）
 *
 * 每角色：独立部门（架构不变量：沙盒 exec 并发——同一部门串行队列）+ ai agent
 * （人设 + 答题契约：agent-browser 打开→读题→作答→锁定态→落盘 survey-result.json）
 * 完成后直接 createCampaign（name LIKE '问卷-%' 匹配——createCampaign 单源筛选）。
 */
import type { AppCtx } from '../middleware/ctx.ts'
import { createCampaign } from './survey-campaign.ts'

export interface SurveyPersonaSpec {
  name: string
  roleLabel: string
  expertise: string
  prompt: string
}

/** 答题契约（与 seed 一致的硬性纪律——禁止编造执行） */
export function surveyContract(url: string, name: string): string {
  return `${url}

【问卷填写任务——硬性契约】收到问卷任务时——必须真实执行以下操作链——禁止仅描述/脑补输出：
1. bash 工具执行：agent-browser open "${url}"（你的沙盒 allow_network 已开启——容器内 localhost 是容器自身——用宿主地址）
2. bash 工具执行：agent-browser snapshot——真实读取题目与控件 ref（没有工具返回 = 没有执行）
3. 逐题作答：click @ref 单选/下拉 + type 文本——每题后 snapshot 确认已选中
4. bash 工具执行：点击提交按钮
5. bash 工具执行：agent-browser 验证——页面显示「✅ 已提交——不可修改」锁定态（完成判定唯一真实信号）
6. write 工具写 survey-result.json（覆盖）：{"name":"${name}","submitted":true,"answers":{...},"verified":true}——然后 agent-browser close
7. 回复消息：报告真实提交编号与锁定态——未看到锁定态前不得报告完成
工具失败（连接失败/控件缺失）要如实报告并重试——编造 = 任务失败。`
}

export async function setupSurveyRoster(
  ctx: Pick<AppCtx, 'sql' | 'appId'>,
  opts: { url: string; personas: SurveyPersonaSpec[]; total?: number; concurrency?: number; retry?: number },
): Promise<{ campaignId: string; created: Array<{ name: string; deptId: string; agentId: string }> }> {
  const { sql, appId } = ctx
  const created: Array<{ name: string; deptId: string; agentId: string }> = []
  for (const p of opts.personas) {
    // 1) 独立部门（自己沙盒——并发填写）
    const [dept] = await sql`
      INSERT INTO departments (app_id, name, is_dm) VALUES (${appId}, ${p.name}, false)
      RETURNING id
    `
    // 2) 角色 agent（name 前缀 问卷-——createCampaign 筛选协议）
    const [agent] = await sql`
      INSERT INTO agents (app_id, type, name, description, role_label, expertise, system_prompt,
        model, department_id, is_active, tools, allow_file_tools, allow_command_exec, allow_network)
      VALUES (${appId}, 'ai', ${'问卷-' + p.name}, ${p.roleLabel + '——' + p.expertise},
        ${p.roleLabel}, ${p.expertise}, ${surveyContract(opts.url, p.name)},
        'deepseek-chat', ${dept.id}, true, '[]', true, true, true)
      RETURNING id
    `
    await sql`
      INSERT INTO department_members (department_id, agent_id, role)
      VALUES (${dept.id}, ${agent.id}, 'member')
    `
    created.push({ name: p.name, deptId: String(dept.id), agentId: String(agent.id) })
  }
  // 3) 直接建活动（createCampaign 单源——角色名匹配 问卷- 前缀）
  const out = await createCampaign(ctx as AppCtx, {
    total: opts.total ?? opts.personas.length,
    concurrency: opts.concurrency,
    url: opts.url,
    retry: opts.retry,
    rolePrefix: '问卷-',
  })
  return { campaignId: String((out.campaign as any).id), created }
}
