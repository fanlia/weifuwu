import { h, type Component } from 'weifuwu/client'
import { SlidePreview } from '../components/SlidePreview'
import { Alert, Badge, Button, Loading } from 'weifuwu/components'

/** 分享只读预览页（无登录可看，无编辑能力） */
export const Share: Component = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.deck = null
  $.loading = true
  $.error = ''
  const token = (ctx as any).route?.params?.token

  ;(async () => {
    try {
      const res = await fetch(`/api/share/${token}`).then((r) => r.json())
      if (res.error) throw new Error(res.error)
      $.deck = res.deck
    } catch (err: any) {
      $.error = err?.message ?? String(err)
    } finally {
      $.loading = false
    }
  })()

  return () =>
    h('div', { class: 'wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto', style: { '--wf-max': '1200px' } },
      h('div', { class: 'wf-row wf-gap-md wf-p-sm wf-print-hidden', style: { position: 'sticky', top: 0, background: 'var(--wf-color-bg)', zIndex: 10, marginBottom: 8 } },
        h(Badge, { variant: 'success' }, '🔗 分享预览'),
        h('h2', { class: 'wf-text-2xl wf-m-0 wf-fill wf-truncate' }, $.deck?.title ?? ''),
        $.deck
          ? h(Button, { size: 'sm', variant: 'ghost', onClick: () => window.print() }, '导出 PDF')
          : null,
      ),
      $.loading
        ? h(Loading, {})
        : $.error
          ? h(Alert, { variant: 'error' }, $.error)
          : h('div', { class: 'wf-grid', style: { '--wf-cols': 'repeat(auto-fill, minmax(320px, 1fr))' } },
              ($.deck?.slides ?? []).map((s: any, i: number) =>
                h('div', { class: 'wf-stack wf-gap-xs', key: i },
                  h(SlidePreview, { slide: s, themeId: $.deck.theme, index: i }),
                ),
              ),
            ),
    )
}
