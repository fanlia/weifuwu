import { h } from 'weifuwu/client'
import { SlidePreview } from '../components/SlidePreview'
import { themes } from '../../src/pptx/theme.ts'

/** 预览页 — 生成结果预览 + 编辑（换主题 / AI 重写 / 换版式）+ 下载 */
export const Deck = (_init: any, ctx: any) => {
  const $ = ctx.ui.$()
  $.deck = null
  $.loading = true
  $.error = ''
  $.busy = null // 正在编辑的卡片 index
  $.busyTheme = false
  const id = (ctx as any).route?.params?.id

  ;(async () => {
    try {
      const res = await fetch(`/api/decks/${id}`).then((r) => r.json())
      if (res.error) throw new Error(res.error)
      $.deck = res.deck
    } catch (err: any) {
      $.error = err?.message ?? String(err)
    } finally {
      $.loading = false
    }
  })()

  const changeTheme = async (theme: string) => {
    if ($.busyTheme || theme === $.deck.theme) return
    $.busyTheme = true
    $.error = ''
    try {
      const res = await fetch(`/api/decks/${id}/theme`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      }).then((r) => r.json())
      if (res.error) throw new Error(res.error)
      $.deck = res.deck
    } catch (err: any) {
      $.error = err?.message ?? String(err)
    } finally {
      $.busyTheme = false
    }
  }

  const postEdit = async (n: number, path: string, body: Record<string, string>) => {
    if ($.busy !== null) return
    $.busy = n
    $.error = ''
    try {
      const res = await fetch(`/api/decks/${id}/slides/${n + 1}/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json())
      if (res.error) throw new Error(res.error)
      const slides = [...$.deck.slides]
      slides[n] = res.slide
      $.deck = { ...$.deck, slides }
    } catch (err: any) {
      $.error = err?.message ?? String(err)
    } finally {
      $.busy = null
    }
  }

  const REWRITE_MODES = [
    ['expand', '扩写'],
    ['condense', '精简'],
    ['rephrase', '换说法'],
  ] as const
  const LAYOUT_OPTS = [
    ['bullets', '要点'],
    ['twoColumn', '双栏'],
    ['data', '数据'],
  ] as const

  return () =>
    h('div', { class: 'deck' },
      h('div', { class: 'deck-top' },
        h('button', { class: 'btn ghost', onClick: () => ctx.app.navigate('/') }, '← 新建'),
        h('h2', { class: 'deck-title' }, $.deck?.title ?? ''),
        h('div', { class: 'theme-switcher' },
          Object.entries(themes).map(([tid, t]) =>
            h('button', {
              class: `theme-dot${$.deck?.theme === tid ? ' active' : ''}`,
              title: t.name,
              style: { background: t.colors.primary },
              onClick: () => changeTheme(tid),
            }, tid === $.deck?.theme ? '✓' : ''),
          ),
        ),
        h('a', {
          class: 'btn',
          href: `/api/decks/${id}/export`,
          download: `${($.deck?.title ?? 'deck').replace(/\s+/g, '-')}.pptx`,
        }, '下载 .pptx'),
        h('button', { class: 'btn ghost', onClick: () => window.print() }, '导出 PDF'),
      ),
      $.loading
        ? h('div', { class: 'loading' }, '加载中…')
        : $.error
          ? h('div', { class: 'error' }, $.error)
          : h('div', { class: 'slides' },
              ($.deck?.slides ?? []).map((s: any, i: number) =>
                h('div', { class: 'slide-wrap', key: i },
                  h(SlidePreview, { slide: s, themeId: $.deck.theme, index: i }),
                  h('div', { class: 'slide-ops' },
                    h('select', {
                      class: 'ops-select',
                      value: '',
                      onChange: (e: any) => { if (e.target.value) { postEdit(i, 'rewrite', { mode: e.target.value }); e.target.value = '' } },
                    },
                      h('option', { value: '', disabled: true }, '✎ AI 重写'),
                      REWRITE_MODES.map(([v, l]) => h('option', { value: v }, l)),
                    ),
                    h('select', {
                      class: 'ops-select',
                      value: '',
                      onChange: (e: any) => { if (e.target.value) { postEdit(i, 'relayout', { layout: e.target.value }); e.target.value = '' } },
                    },
                      h('option', { value: '', disabled: true }, '▣ 换版式'),
                      LAYOUT_OPTS.filter(([v]) => v !== s.layout).map(([v, l]) => h('option', { value: v }, l)),
                    ),
                    $.busy === i ? h('span', { class: 'ops-busy' }, '处理中…') : null,
                  ),
                ),
              ),
            ),
    )
}
