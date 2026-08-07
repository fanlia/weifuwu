import type { WfuiContext, Component } from 'weifuwu/client'
import { PageHeader, EmptyState, Loading } from '../components/ui'
import { Avatar, Button, Card } from 'weifuwu/components'

export const Companies: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  const token = ctx.auth?.token

   $.companies = []; $.loading = true
    fetch('/api/companies', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { $.companies = d.companies ?? []; $.loading = false })
      .catch(() => { $.loading = false })

  async function remove(e: Event, id: string) {
    e.stopPropagation()
    const ok = await (ctx as any).confirm('确定删除这家公司吗？所有部门将一并删除。')
    if (!ok) return
    const res = await fetch(`/api/companies/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (res.ok || res.status === 204) {
      $.loading = true
      fetch('/api/companies', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => { $.companies = d.companies ?? []; $.loading = false })
        .catch(() => { $.loading = false })
      ;(ctx as any).toast?.('公司已删除', 'success')
    }
  }
  return (props) => (
    <div class="wf-stack wf-gap-lg">
      <PageHeader title="公司" sub="管理公司及其下属部门">
        <Button variant="primary" onClick={() => ctx.app?.navigate('/companies/new')}>＋ 创建公司</Button>
      </PageHeader>

      {$.loading && <Loading />}

      {!$.loading && $.companies.length === 0 && (
        <EmptyState icon="🏢" text="还没有公司" hint="创建公司来组织部门与 Agent">
          <Button variant="primary" onClick={() => ctx.app?.navigate('/companies/new')}>＋ 创建公司</Button>
        </EmptyState>
      )}

      {!$.loading && $.companies.length > 0 && (
        <div class="wf-grid">
          {$.companies.map((c: any) => (
            <Card key={c.id}>
              <div class="wf-row wf-gap-sm">
                <Avatar name={(c.name ?? 'C')[0]} color="#8b5cf6" />
                <div class="wf-fill wf-text-base wf-text-semibold wf-truncate">{c.name}</div>
              </div>
              <div class="wf-text-sm wf-text-secondary wf-mt-sm">
                创建于 {new Date(c.created_at).toLocaleDateString('zh-CN')}
              </div>
              <div class="wf-split wf-mt-md">
                <span class="wf-text-xs wf-text-tertiary">ID: {c.id?.slice(0, 8)}...</span>
                <Button size="sm" variant="danger" onClick={(e: any) => remove(e, c.id)}>删除</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
