import { h, type Component } from 'weifuwu/client'
import type { RouteInjected } from 'weifuwu/client'
import { themes } from '../../src/pptx/theme.ts'
import { Badge, Button, Card, EmptyState, Loading } from 'weifuwu/components'

/** 历史列表 — 我的演示文稿 */
export const History: Component<{}, RouteInjected> = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.decks = []
  $.loading = true
  $.error = ''

  const load = async () => {
    $.loading = true
    $.error = ''
    try {
      const res = await ctx.api!.get('/api/decks')
      if (res.error) throw new Error(res.error)
      $.decks = res.decks
    } catch (err: any) {
      $.error = err?.message ?? String(err)
    } finally {
      $.loading = false
    }
  }
  ;(load)()

  const remove = async (id: string, e: any) => {
    e.stopPropagation()
    if (!confirm('确定删除这份演示文稿？')) return
    try {
      const res = await ctx.api!.delete(`/api/decks/${id}`)
      if (res.error) throw new Error(res.error)
      $.decks = $.decks.filter((d: any) => d.id !== id)
    } catch (err: any) {
      alert(err?.message ?? String(err))
    }
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return () =>
    h('div', { class: 'wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto', style: { '--wf-max': '1000px' } },
      h('div', { class: 'wf-row wf-gap-md wf-mb-sm' },
        h(Button, { variant: 'ghost', size: 'sm', onClick: () => ctx.app.navigate('/') }, '← 新建'),
        h('h2', { class: 'wf-text-2xl wf-m-0 wf-fill' }, '我的演示文稿'),
      ),
      $.loading
        ? h(Loading, {})
        : $.error
          ? h('div', { class: 'wf-bg-error wf-text-error wf-p-md wf-rounded wf-text-sm' }, $.error)
          : $.decks.length === 0
            ? h(EmptyState, { icon: '📊', text: '还没有演示文稿' },
                h(Button, { variant: 'primary', onClick: () => ctx.app.navigate('/') }, '去生成一份 →'),
              )
            : h('div', { class: 'wf-grid' },
                $.decks.map((d: any) =>
                  h(Card, {
                    hover: true,
                    clickable: true,
                    key: d.id,
                    onClick: () => ctx.app.navigate(d.status === 'ready' ? `/decks/${d.id}` : `/decks/${d.id}/outline`),
                  },
                    h('div', { class: 'wf-split wf-mb-sm' },
                      h(Badge, { variant: d.status === 'ready' ? 'success' : 'warning' }, d.status === 'ready' ? '已完成' : '草稿'),
                      h('span', { class: 'wf-text-xs wf-text-tertiary' }, themes[d.theme]?.name ?? d.theme),
                    ),
                    h('div', { class: 'wf-text-base wf-text-bold wf-mb-sm' }, d.title),
                    h('div', { class: 'wf-row wf-gap-md wf-text-xs wf-text-tertiary' },
                      h('span', {}, `${d.slides} 页`),
                      h('span', {}, fmt(d.createdAt)),
                    ),
                    h('div', { class: 'wf-text-right wf-mt-sm' },
                      h(Button, { size: 'sm', variant: 'danger', onClick: (e: any) => remove(d.id, e) }, '删除'),
                    ),
                  ),
                ),
              ),
    )
}
