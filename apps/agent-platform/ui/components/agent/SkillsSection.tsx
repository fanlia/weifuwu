/**
 * 技能管理区（AgentDetail 拆分子组件——自有状态，工厂 await 取数）
 */
import type { Component } from 'weifuwu/ui-dom'
import { Button, Card, Icon } from 'weifuwu/components'
import type { AvailableSkill, BoundSkill } from '../../lib/types'

export interface SectionProps { agentId: string }

export const SkillsSection: Component<SectionProps> = async (_init, ctx) => {
  let boundSkills: BoundSkill[] = []
  let availableSkills: AvailableSkill[] = []
  let showSkillPicker = false
  const rerender = () => ctx.ui.render()

  // 工厂 await 取数（两阶段契约 §3.3——首帧带数据）
  const [skillRes, availRes] = await Promise.all([
    ctx.api!.get<{ skills: BoundSkill[] }>(`/api/agents/${_init.agentId}/skills`).catch(() => ({ skills: [] })),
    ctx.api!.get<{ skills: AvailableSkill[] }>('/api/skills/available').catch(() => ({ skills: [] })),
  ])
  boundSkills = skillRes.skills ?? []
  availableSkills = availRes.skills ?? []

  async function bindSkill(skill: AvailableSkill) {
    // 后端契约：POST /api/agents/:id/skills 需要 { skill_name, skill_dir }
    const skillName = skill.meta?.name ?? skill.name ?? skill.slug
    const skillDir = skill.dir ?? skill.skill_dir
    if (!skillName || !skillDir) return
    await ctx.api!.post(`/api/agents/${_init.agentId}/skills`, { skill_name: skillName, skill_dir: skillDir })
    const d = await ctx.api!.get<{ skills: BoundSkill[] }>(`/api/agents/${_init.agentId}/skills`)
    boundSkills = d.skills ?? []
    rerender()
  }

  async function unbindSkill(id: string) {
    // 后端契约：DELETE /api/agents/:id/skills/:skillId 需要 agent_skills.id（UUID）
    await ctx.api!.delete(`/api/agents/${_init.agentId}/skills/${id}`)
    const d = await ctx.api!.get<{ skills: BoundSkill[] }>(`/api/agents/${_init.agentId}/skills`)
    boundSkills = d.skills ?? []
    rerender()
  }

  return async () => (
    <Card id="sec-skills">
      <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm"><Icon name="settings" size={14} /> 技能管理</div>
      {boundSkills.length === 0 && <div class="wf-text-sm wf-text-tertiary wf-py-md">暂无绑定技能</div>}
      {boundSkills.map((s: BoundSkill) => (
        <div key={s.slug} class="wf-split wf-py-sm wf-border-b">
          <div class="wf-stack wf-gap-none">
            <span class="wf-text-sm wf-text-medium">{s.name ?? s.skill_name}</span>
            <span class="wf-text-xs wf-text-tertiary">{s.description ?? ''}</span>
          </div>
          <Button size="sm" variant="danger" onClick={() => unbindSkill(s.id)}>解绑</Button>
        </div>
      ))}
      {availableSkills.length > 0 && (
        <Button size="sm" variant="ghost" onClick={() => { showSkillPicker = !showSkillPicker; rerender() }}>
          {showSkillPicker ? '收起' : '+ 绑定技能'}
        </Button>
      )}
      {showSkillPicker && (
        <div class="wf-stack wf-gap-xs wf-mt-sm">
          {availableSkills.filter((as: AvailableSkill) => {
            const name = as.meta?.name ?? as.name ?? as.slug
            return !boundSkills.some((bs: BoundSkill) => bs.skill_name === name)
          }).map((s: AvailableSkill) => (
            <div key={s.dir ?? s.slug ?? s.id} class="wf-split wf-py-xs">
              <span class="wf-text-sm">{s.meta?.name ?? s.name}</span>
              <span class="wf-text-xs wf-text-tertiary">{s.meta?.description ?? s.description ?? ''}</span>
              <Button size="sm" variant="primary" onClick={() => bindSkill(s)}>绑定</Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
