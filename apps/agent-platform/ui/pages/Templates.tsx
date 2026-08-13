/**
 * 模板市场页 — 浏览角色模板 → 一键创建 Agent
 *
 * Wave 6 产品优化（MULTI-ROLE-PLAN §3 产品经理视角）：
 * 复用 GET /api/role-templates（分类 + 热门）+ POST /api/agents/from-template。
 * 数据在工厂层 await（§3.3 异步工厂——首次渲染即带数据；导航往返工厂重跑重拉）。
 */

import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { Button, Card, EmptyState, Icon, Tag } from 'weifuwu/components'

interface RoleTemplate {
  slug: string
  name: string
  icon: string
  category: string
  description: string
  default_allow_file_tools: boolean
  default_allow_command_exec: boolean
  default_workspace_hint: string | null
  usage_count?: number
}

const CATEGORY_LABELS: Record<string, string> = {
  engineering: '开发',
  support: '客服',
  product: '产品',
  data: '数据',
  operations: '运营',
  business: '商务',
  management: '管理',
  general: '通用',
}

export const Templates: Component = async (_props, ctx) => {
  // ── 工厂层 await 数据（首次渲染即带——避免路由页 rerender 不落地的框架坑）──
  let templates: RoleTemplate[] = []
  let error = ''
  try {
    const res = await ctx.api!.get<{ templates: RoleTemplate[] }>('/api/role-templates')
    templates = res.templates ?? []
  } catch {
    error = '加载模板失败'
  }
  // 交互状态（内部 let + ctx.ui.render——交互是用户操作触发，非 mount 异步）
  let category = ''
  let creating: string | null = null
  let createError = ''

  async function createFromTemplate(t: RoleTemplate) {
    creating = t.slug; createError = ''; ctx.ui.render()
    const ok = await ctx.api!.post<{ agent: { id: string } }>('/api/agents/from-template', {
      template_slug: t.slug,
      name: t.name,
    }).catch((e: unknown) => {
      createError = (e as { message?: string })?.message ?? '创建失败'
      ctx.ui.render()
      return null
    })
    if (ok?.agent?.id) {
      ctx.toast?.(`已用模板「${t.name}」创建 Agent`, 'success')
      ctx.app?.navigate(`/agents/${ok.agent.id}`)
    }
    creating = null
  }

  const cats = ['', ...new Set(templates.map((t) => t.category))]
  const visible = category ? templates.filter((t) => t.category === category) : templates

  return async (props: {}) => (
    <div class="wf-stack wf-gap-lg">
      <div class="wf-row wf-between wf-gap-sm wf-items-center">
        <div>
          <h1 class="wf-text-2xl wf-m-0">模板市场</h1>
          <p class="wf-text-sm wf-text-secondary wf-mt-xs">选择一个角色模板，一键创建你的 AI Agent</p>
        </div>
        <Button variant="ghost" onClick={() => ctx.app?.navigate('/agents/new')}><Icon name="plus" size={14} /> 自定义创建</Button>
      </div>

      <div class="wf-row wf-gap-sm wf-items-center">
        <div class="wf-fill wf-row wf-gap-xs" style="flex-wrap: wrap">
          {cats.map((c) => (
            <button key={c || 'all'} type="button"
              class={`wf-btn wf-btn--sm ${category === c ? 'wf-btn--primary' : 'wf-btn--ghost'}`}
              onClick={() => { category = c; ctx.ui.render() }}>
              {c ? CATEGORY_LABELS[c] ?? c : '全部'}
            </button>
          ))}
        </div>
      </div>

      {error && <div class="wf-text-error wf-text-sm">{error}</div>}
      {createError && <div class="wf-text-error wf-text-sm">{createError}</div>}

      {visible.length === 0 ? (
        <EmptyState icon={<Icon name="search" />} text={error ? error : '该分类暂无模板'} hint="试试其他分类" />
      ) : (
        <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(min(100%, 280px), 1fr))">
          {visible.map((t) => (
            <Card key={t.slug} className="wf-stack wf-gap-sm">
              <div class="wf-row wf-gap-sm wf-items-center">
                <span class="wf-text-2xl">{t.icon}</span>
                <div class="wf-fill">
                  <div class="wf-text-base wf-text-semibold">{t.name}</div>
                  <div class="wf-row wf-gap-xs wf-mt-xs">
                    <Tag variant="default">{CATEGORY_LABELS[t.category] ?? t.category}</Tag>
                    {t.usage_count ? <Tag variant="success">热门 {t.usage_count}</Tag> : null}
                    {t.default_allow_file_tools && <Tag variant="default">文件工具</Tag>}
                  </div>
                </div>
              </div>
              <p class="wf-text-sm wf-text-secondary wf-m-0">{t.description}</p>
              {t.default_workspace_hint && (
                <div class="wf-text-xs wf-text-tertiary">工作区：{t.default_workspace_hint}</div>
              )}
              <Button size="sm" variant={creating === t.slug ? 'secondary' : 'primary'}
                disabled={creating !== null}
                onClick={() => createFromTemplate(t)}>
                {creating === t.slug ? '创建中...' : '使用此模板'}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
