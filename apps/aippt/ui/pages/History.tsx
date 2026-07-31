import { h, type Component } from 'weifuwu/client'
import type { RouteInjected } from 'weifuwu/client'
import { themes } from '../../src/pptx/theme.ts'

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
      const res = await fetch('/api/decks').then((r) => r.json())
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
      const res = await fetch(`/api/decks/${id}`, { method: 'DELETE' }).then((r) => r.json())
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
    h('div', { class: 'deck' },
      h('div', { class: 'deck-top' },
        h('button', { class: 'btn ghost', onClick: () => ctx.app.navigate('/') }, '← 新建'),
        h('h2', { class: 'deck-title' }, '我的演示文稿'),
      ),
      $.loading
        ? h('div', { class: 'loading' }, '加载中…')
        : $.error
          ? h('div', { class: 'error' }, $.error)
          : $.decks.length === 0
            ? h('div', { class: 'empty' },
                h('p', {}, '还没有演示文稿'),
                h('a', { class: 'btn', href: '/', style: { display: 'inline-block', marginTop: 12 } }, '去生成一份 →'),
              )
            : h('div', { class: 'history-grid' },
                $.decks.map((d: any) =>
                  h('div', {
                    class: 'history-card',
                    key: d.id,
                    onClick: () => ctx.app.navigate(d.status === 'ready' ? `/decks/${d.id}` : `/decks/${d.id}/outline`),
                  },
                    h('div', { class: 'history-head' },
                      h('span', { class: `status-badge ${d.status}` }, d.status === 'ready' ? '已完成' : '草稿'),
                      h('span', { class: 'history-theme' }, themes[d.theme]?.name ?? d.theme),
                    ),
                    h('div', { class: 'history-title' }, d.title),
                    h('div', { class: 'history-meta' },
                      h('span', {}, `${d.slides} 页`),
                      h('span', {}, fmt(d.createdAt)),
                    ),
                    h('button', {
                      class: 'btn-ghost-sm danger history-del',
                      onClick: (e: any) => remove(d.id, e),
                    }, '删除'),
                  ),
                ),
              ),
    )
}
