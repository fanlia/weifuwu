/**
 * 技能管理区（AgentDetail 拆分子组件——自有状态，工厂 await 取数）
 */
import type { Component } from 'weifuwu/vdom'
import { Button, Card, Icon, Input } from 'weifuwu/components'
import type { AvailableSkill, BoundSkill } from '../../lib/types'

export interface SectionProps { agentId: string }

export const SkillsSection: Component<SectionProps> = async (_init, ctx) => {
  let boundSkills: BoundSkill[] = []
  let availableSkills: AvailableSkill[] = []
  let showSkillPicker = false
  let skillSearch = ''
  const rerender = () => ctx.render()

  // C6 技能市场：评分（每租户每技能一次，可改评）
  async function rateSkill(skill: AvailableSkill, liked: boolean) {
    const skillDir = skill.dir ?? skill.skill_dir
    if (!skillDir) return
    try {
      await ctx.api!.post('/api/skills/rate', { skill_dir: skillDir, liked })
      const d = await ctx.api!.get<{ skills: AvailableSkill[] }>('/api/skills/available').catch(() => ({ skills: [] }))
      availableSkills = d.skills ?? []
      rerender()
    } catch (e) { ctx.toast!('评分失败', 'error') }
  }

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
      <div class="wf-font-sm wf-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-margin-bottom-sm"><Icon name="settings" size={14} /> 技能管理</div>
      {boundSkills.length === 0 && <div class="wf-font-sm wf-text-tertiary wf-padding-y-md">暂无绑定技能</div>}
      {boundSkills.map((s: BoundSkill) => (
        <div key={s.slug} class="wf-split wf-padding-y-sm wf-border-bottom">
          <div class="wf-stack wf-gap-none">
            <span class="wf-font-sm wf-medium">{s.name ?? s.skill_name}</span>
            <span class="wf-font-xs wf-text-tertiary">{s.description ?? ''}</span>
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
        <div class="wf-stack wf-gap-xs wf-margin-top-sm">
          <div class="wf-row wf-gap-xs">
            <div class="wf-fill">
              <Input type="text" placeholder="搜索技能（名称/描述）..." value={skillSearch}
                onInput={(e: Event) => { skillSearch = (e.target as HTMLInputElement).value; rerender() }} />
            </div>
            <span class="wf-font-xs wf-text-tertiary wf-self-center wf-nums">{availableSkills.filter((as: AvailableSkill) => {
              const name = as.meta?.name ?? as.name ?? as.slug
              const desc = as.meta?.description ?? as.description ?? ''
              const q = skillSearch.trim().toLowerCase()
              return !boundSkills.some((bs: BoundSkill) => bs.skill_name === name) &&
                (!q || String(name).toLowerCase().includes(q) || String(desc).toLowerCase().includes(q))
            }).length} 个</span>
          </div>
          {availableSkills.filter((as: AvailableSkill) => {
            const name = as.meta?.name ?? as.name ?? as.slug
            const desc = as.meta?.description ?? as.description ?? ''
            const q = skillSearch.trim().toLowerCase()
            return !boundSkills.some((bs: BoundSkill) => bs.skill_name === name) &&
              (!q || String(name).toLowerCase().includes(q) || String(desc).toLowerCase().includes(q))
          }).map((s: AvailableSkill) => {
            const rating = (s as any).rating ?? { likes: 0, dislikes: 0 }
            const rated = (rating.likes ?? 0) + (rating.dislikes ?? 0)
            const goodRate = rated > 0 ? Math.round((rating.likes ?? 0) / rated * 100) : null
            return (
              <div key={s.dir ?? s.slug ?? s.id} class="wf-row wf-gap-xs wf-padding-y-xs">
                <div class="wf-fill wf-stack wf-gap-none">
                  <span class="wf-font-sm">{s.meta?.name ?? s.name}</span>
                  <span class="wf-font-xs wf-text-tertiary">{s.meta?.description ?? s.description ?? ''}</span>
                  <span class="wf-font-xs wf-text-secondary wf-nums">
                    {goodRate === null ? '暂无评分' : `⭐ 好评率 ${goodRate}%（👍${rating.likes ?? 0} · 👎${rating.dislikes ?? 0}）`}
                  </span>
                </div>
                <div class="wf-row wf-gap-xs">
                  <Button size="sm" variant="ghost" title="好评（技能有用）" onClick={() => rateSkill(s, true)}>👍</Button>
                  <Button size="sm" variant="ghost" title="差评（技能不好用）" onClick={() => rateSkill(s, false)}>👎</Button>
                  <Button size="sm" variant="primary" onClick={() => bindSkill(s)}>绑定</Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
