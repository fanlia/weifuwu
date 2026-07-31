import { h } from 'weifuwu/client'
import { SlidePreview } from '../components/SlidePreview'

/** 分享只读预览页（无登录可看，无编辑能力） */
export const Share = (_init: any, ctx: any) => {
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
    h('div', { class: 'deck' },
      h('div', { class: 'deck-top' },
        h('span', { class: 'share-badge' }, '🔗 分享预览'),
        h('h2', { class: 'deck-title' }, $.deck?.title ?? ''),
        $.deck
          ? h('button', { class: 'btn ghost', onClick: () => window.print() }, '导出 PDF')
          : null,
      ),
      $.loading
        ? h('div', { class: 'loading' }, '加载中…')
        : $.error
          ? h('div', { class: 'error' }, $.error)
          : h('div', { class: 'slides' },
              ($.deck?.slides ?? []).map((s: any, i: number) =>
                h('div', { class: 'slide-wrap', key: i },
                  h(SlidePreview, { slide: s, themeId: $.deck.theme, index: i }),
                ),
              ),
            ),
    )
}
