import { h } from 'weifuwu/client'
import { SlidePreview } from '../components/SlidePreview'

/** 预览页 — 生成结果预览 + 下载 */
export const Deck = (_init: any, ctx: any) => {
  const $ = ctx.ui.$()
  $.deck = null
  $.loading = true
  $.error = ''
  const id = (ctx as any).route?.params?.id
  console.log('[aippt] Deck mount, route=', JSON.stringify((ctx as any).route), 'id=', id)

  ;(async () => {
    try {
      const res = await fetch(`/api/decks/${id}`).then((r) => r.json())
      if (res.error) throw new Error(res.error)
      $.deck = res.deck
      console.log('[aippt] deck loaded:', res.deck?.title, res.deck?.slides?.length, 'slides')
    } catch (err: any) {
      $.error = err?.message ?? String(err)
      console.error('[aippt] load error:', err)
    } finally {
      $.loading = false
    }
  })()

  return () =>
    h('div', { class: 'deck' },
      h('div', { class: 'deck-top' },
        h('button', { class: 'btn ghost', onClick: () => ctx.app.navigate('/') }, '← 新建'),
        h('h2', { class: 'deck-title' }, $.deck?.title ?? ''),
        h('a', {
          class: 'btn',
          href: `/api/decks/${id}/export`,
          download: `${($.deck?.title ?? 'deck').replace(/\s+/g, '-')}.pptx`,
        }, '下载 .pptx'),
      ),
      $.loading
        ? h('div', { class: 'loading' }, '加载中…')
        : $.error
          ? h('div', { class: 'error' }, $.error)
          : h('div', { class: 'slides' },
              ($.deck?.slides ?? []).map((s: any, i: number) =>
                h(SlidePreview, { slide: s, themeId: $.deck.theme, index: i }),
              ),
            ),
    )
}
