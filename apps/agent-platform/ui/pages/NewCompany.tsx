import type { WfuiContext, Component } from 'weifuwu/client'
import { PageHeader } from '../components/ui'

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
    <div class="page page-narrow">
      <a class="back-link" onClick={() => ctx.app?.navigate('/companies')}>← 返回公司列表</a>
      <PageHeader title="创建公司" sub="公司是部门的顶层组织单位" />

      {$.error && <div class="alert alert-err">{$.error}</div>}

      <form class="card card-pad" onSubmit={handleSubmit}>
        <div class="field">
          <label class="field-label">公司名称 <span class="req">*</span></label>
          <input class="input" type="text" placeholder="如：某某科技有限公司" value={$.name}
            onInput={(e: any) => { $.name = e.target.value }} />
        </div>

        <div class="form-foot">
          <button type="button" class="btn btn-ghost" onClick={() => ctx.app?.navigate('/companies')}>取消</button>
          <button type="submit" class="btn btn-primary" disabled={$.submitting}>
            {$.submitting ? '创建中...' : '创建公司'}
          </button>
        </div>
      </form>
    </div>
  )
}
