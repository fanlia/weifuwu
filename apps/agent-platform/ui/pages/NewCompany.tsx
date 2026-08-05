import type { WfuiContext, Component } from 'weifuwu/client'
import { PageHeader } from '../components/ui'
import { Alert, Button, Card, Field, Input } from 'weifuwu/components'

export const NewCompany: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  const token = ctx.auth?.token

$.name = ''; $.error = ''; $.submitting = false

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (!$.name.trim()) { $.error = '请输入公司名称'; return }
    $.submitting = true; $.error = ''
    try {
      const res = await fetch('/api/companies', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: $.name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { $.error = data.error || '创建失败'; $.submitting = false; return }
      ctx.app?.navigate('/companies')
    } catch { $.error = '网络错误'; $.submitting = false }
  }
  return (props) => (
    <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px">
      <a class="wf-text-sm wf-text-brand" onClick={() => ctx.app?.navigate('/companies')}>← 返回公司列表</a>
      <PageHeader title="创建公司" sub="公司是部门的顶层组织单位" />

      <div class="wf-mb-md">{$.error && <Alert variant="error">{$.error}</Alert>}</div>

      <Card>
        <form class="wf-stack wf-gap-md" onSubmit={handleSubmit}>
          <Field label="公司名称" required>
            <Input type="text" placeholder="如：某某科技有限公司" value={$.name}
              onInput={(e: any) => { $.name = e.target.value }} />
          </Field>
          <div class="wf-right wf-gap-sm">
            <Button type="button" variant="ghost" onClick={() => ctx.app?.navigate('/companies')}>取消</Button>
            <Button type="submit" variant="primary" disabled={$.submitting}>
              {$.submitting ? '创建中...' : '创建公司'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
