/**
 * 创建公司页面
 */

import { signal, computed, Show } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'
import { PageHeader } from '../components/ui'

export function NewCompany(_props: {}, ctx: WfuiContext) {
  const token = ctx.auth?.token?.value ?? ctx.auth?.token

  const name = signal('')
  const submitting = signal(false)
  const error = signal('')
  const hasError = computed(() => error.value !== '')

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (!name.value.trim()) { error.value = '请输入公司名称'; return }
    submitting.value = true
    error.value = ''

    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.value.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { error.value = data.error || '创建失败'; submitting.value = false; return }
      ctx.app.navigate('/companies')
    } catch {
      error.value = '网络错误'
      submitting.value = false
    }
  }

  return (
    <div class="page page-narrow">
      <a href="/companies" class="back-link" onClick={(e: any) => { e.preventDefault(); ctx.app.navigate('/companies') }}>← 返回公司列表</a>
      <PageHeader title="创建公司" sub="公司是部门的顶层组织单位" />

      <Show when={hasError}><div class="alert alert-err">{error}</div></Show>

      <form class="card card-pad" onSubmit={handleSubmit}>
        <div class="field">
          <label class="field-label">公司名称 <span class="req">*</span></label>
          <input class="input" type="text" placeholder="如：某某科技有限公司" value={name}
            onInput={(e: any) => { name.value = e.target.value }} />
        </div>

        <div class="form-foot">
          <button type="button" class="btn btn-ghost" onClick={() => ctx.app.navigate('/companies')}>取消</button>
          <button type="submit" class="btn btn-primary" disabled={submitting}>
            {computed(() => submitting.value ? '创建中...' : '创建公司')}
          </button>
        </div>
      </form>
    </div>
  )
}
