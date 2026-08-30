/**
 * 模板市场页 — 浏览角色模板 → 一键创建 Agent
 *
 * Wave 6 产品优化（MULTI-ROLE-PLAN §3 产品经理视角）：
 * 复用 GET /api/role-templates（分类 + 热门）+ POST /api/agents/from-template。
 * 数据在工厂层 await（§3.3 异步工厂——首次渲染即带数据；导航往返工厂重跑重拉）。
 */

import type { UIContext, Component } from 'weifuwu/vdom'
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

export const Templates: Component = (_props, ctx) => {
  // **useAsyncData 迁移（W1.4——VDOM-STREAM-FIX-PLAN）**：原手写
  // `loadTemplates + ctx.render()` 是 pre-useAsyncData 时代代码——工厂期异步
  // 启动 + finally(rerender)——在 v2 段复用语义下工厂不重跑 → 数据永不刷新
  // （导航返回/同一会话都停旧）。useAsyncData 语义：同 key 并发合并、竞态
  // 取消、缓存保留（重挂载零请求——导航返回瞬时）、reload 显式刷新——
  // get() 返回 null = loading/error（区块降级）——错误文案进本地 error 态。
  let loadError = ''
  const [getTemplates, reloadTemplates] = ctx.ui.useAsyncData(
    async () => {
      loadError = ''
      try {
        const res = await ctx.api!.get<{ templates: RoleTemplate[] }>('/api/role-templates')
        return res.templates ?? []
      } catch {
        loadError = '加载模板失败'
        return null
      }
    },
    'templates-list',
  )
  // 分类由路由 query 驱动（/templates?cat=x）——renderFn 每次渲染读最新
  let creating: string | null = null
  let createError = ''

  async function createFromTemplate(t: RoleTemplate) {
    creating = t.slug; createError = ''; ctx.render()
    const ok = await ctx.api!.post<{ agent: { id: string } }>('/api/agents/from-template', {
      template_slug: t.slug,
      name: t.name,
    }).catch((e: unknown) => {
      createError = (e as { message?: string })?.message ?? '创建失败'
      ctx.render()
      return null
    })
    if (ok?.agent?.id) {
      ctx.toast?.(`已用模板「${t.name}」创建 Agent`, 'success')
      ctx.app?.navigate(`/agents/${ok.agent.id}`)
    }
    creating = null
  }

  return (props: {}) => {
    // 分类由路由 query 驱动（/templates?cat=x）——renderFn 每次渲染读最新
    // （框架 query 变化 bump ctx 版本 → renderFn 重跑——真实调试验证）
    let category = ''
    try {
      const q = (ctx.route?.query as Record<string, string>)?.cat
      if (q) category = q
    } catch { /* 忽略 */ }
    const templates = getTemplates() ?? []
    const error = loadError
    const cats = ['', ...new Set(templates.map((t) => t.category))]
    const visible = category ? templates.filter((t) => t.category === category) : templates
    return (
    <div class="wf-stack wf-gap-lg">
      <div class="wf-row wf-justify-between wf-gap-sm wf-items-center">
        <div>
          <h1 class="wf-font-2xl wf-margin-none">模板市场</h1>
          <p class="wf-font-sm wf-text-secondary wf-margin-top-xs">选择一个角色模板，一键创建你的 AI Agent</p>
        </div>
        <div class="wf-row wf-gap-xs">
          <Button variant="ghost" onClick={() => reloadTemplates()}><Icon name="refresh" size={14} /> 刷新</Button>
          <Button variant="ghost" onClick={() => ctx.app?.navigate('/agents/new')}><Icon name="plus" size={14} /> 自定义创建</Button>
        </div>
      </div>

      <div class="wf-row wf-gap-sm wf-items-center">
        <div class="wf-fill wf-row wf-gap-xs" style="flex-wrap: wrap">
          {cats.map((c) => (
            <button key={c || 'all'} type="button"
              class={`wf-btn wf-btn--sm ${category === c ? 'wf-btn--primary' : 'wf-btn--ghost'}`}
              onClick={() => ctx.app?.navigate(c ? `/templates?cat=${encodeURIComponent(c)}` : '/templates')}>
              {c ? CATEGORY_LABELS[c] ?? c : '全部'}
            </button>
          ))}
        </div>
      </div>

      {error && <div class="wf-text-error wf-font-sm">{error}</div>}
      {createError && <div class="wf-text-error wf-font-sm">{createError}</div>}

      {visible.length === 0 ? (
        <EmptyState icon={<Icon name="search" />} text={error ? error : '该分类暂无模板'} hint="试试其他分类" />
      ) : (
        <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(min(100%, 280px), 1fr))">
          {visible.map((t) => (
            <Card key={t.slug} className="wf-stack wf-gap-sm">
              <div class="wf-row wf-gap-sm wf-items-center">
                <span class="wf-font-2xl">{t.icon}</span>
                <div class="wf-fill">
                  <div class="wf-font-base wf-semibold">{t.name}</div>
                  <div class="wf-row wf-gap-xs wf-margin-top-xs">
                    <Tag variant="default">{CATEGORY_LABELS[t.category] ?? t.category}</Tag>
                    {t.usage_count ? <Tag variant="success">热门 {t.usage_count}</Tag> : null}
                    {t.default_allow_file_tools && <Tag variant="default">文件工具</Tag>}
                  </div>
                </div>
              </div>
              <p class="wf-font-sm wf-text-secondary wf-margin-none">{t.description}</p>
              {t.default_workspace_hint && (
                <div class="wf-font-xs wf-text-tertiary">工作区：{t.default_workspace_hint}</div>
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
}
