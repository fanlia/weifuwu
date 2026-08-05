import { h, type Component } from 'weifuwu/client'
import type { RouteInjected } from 'weifuwu/client'
import { SlidePreview } from '../components/SlidePreview'
import { buildCustomTheme } from '../../src/pptx/theme.ts'
import { Alert, Button, Input, Loading, Modal } from 'weifuwu/components'

/** 预览页 — 生成结果预览 + 编辑（换主题/自定义品牌/AI 重写/换版式）+ 下载 */
export const Deck: Component<{}, RouteInjected> = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.deck = null
  $.themes = []
  $.loading = true
  $.error = ''
  $.busy = null
  $.busyTheme = false
  $.showCustom = false
  $.customName = ''
  $.customColors = { primary: '#2563EB', bg: '#FFFFFF', text: '#111827', textSecondary: '#4B5563' }
  $.customLogo = ''
  const id = (ctx as any).route?.params?.id

  ;(async () => {
    try {
      const [deckRes, themesRes] = await Promise.all([
        fetch(`/api/decks/${id}`).then((r) => r.json()),
        fetch('/api/themes').then((r) => r.json()),
      ])
      if (deckRes.error) throw new Error(deckRes.error)
      $.deck = deckRes.deck
      $.themes = themesRes.themes ?? []
    } catch (err: any) {
      $.error = err?.message ?? String(err)
    } finally {
      $.loading = false
    }
  })()

  const currentTheme = () => {
    const t = $.themes.find((x: any) => x.id === $.deck?.theme)
    if (t && !t.preset) return buildCustomTheme(t.id, t.name, t.colors, t.logo)
    return undefined
  }

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

  const saveCustomTheme = async () => {
    if (!$.customName.trim()) { $.error = '请输入品牌名称'; return }
    $.busyTheme = true
    $.error = ''
    try {
      const res = await fetch('/api/themes/custom', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: $.customName.trim(), colors: $.customColors, logo: $.customLogo || undefined }),
      }).then((r) => r.json())
      if (res.error) throw new Error(res.error)
      $.themes = [...$.themes.filter((x: any) => x.preset), res.theme]
      $.showCustom = false
      $.busyTheme = false
      await changeTheme(res.theme.id)
    } catch (err: any) {
      $.error = err?.message ?? String(err)
    } finally {
      $.busyTheme = false
    }
  }

  const onLogoFile = (e: any) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { $.customLogo = String(reader.result) }
    reader.readAsDataURL(file)
  }

  const shareDeck = async () => {
    $.error = ''
    try {
      const res = await fetch(`/api/decks/${id}/share`, { method: 'POST' }).then((r) => r.json())
      if (res.error) throw new Error(res.error)
      const url = `${location.origin}${res.url}`
      await navigator.clipboard.writeText(url)
      $.error = ''
      alert('分享链接已复制：' + url)
    } catch (err: any) {
      $.error = err?.message ?? String(err)
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

  const REWRITE_MODES = [['expand', '扩写'], ['condense', '精简'], ['rephrase', '换说法']] as const
  const LAYOUT_OPTS = [['bullets', '要点'], ['twoColumn', '双栏'], ['data', '数据']] as const
  const custom = currentTheme()

  const selectOps = (path: string, opts: readonly (readonly [string, string])[], placeholder: string, i: number) =>
    h('select', {
      class: 'wf-input wf-w-auto wf-text-sm', value: '',
      onChange: (e: any) => { if (e.target.value) { postEdit(i, path, e.target.value === 'rewrite' ? { mode: e.target.value } : { layout: e.target.value }); e.target.value = '' } },
    },
      h('option', { value: '', disabled: true }, placeholder),
      ...opts.map(([v, l]) => h('option', { value: v }, l)),
    )

  return () =>
    h('div', { class: 'wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto', style: { '--wf-max': '1200px' } },
      h('div', { class: 'wf-row wf-gap-md wf-p-sm wf-print-hidden', style: { position: 'sticky', top: 0, background: 'var(--wf-color-bg)', zIndex: 10, marginBottom: 8 } },
        h(Button, { variant: 'ghost', size: 'sm', onClick: () => ctx.app.navigate('/') }, '← 新建'),
        h('h2', { class: 'wf-text-2xl wf-m-0 wf-fill wf-truncate' }, $.deck?.title ?? ''),
        h('div', { class: 'wf-row wf-gap-xs wf-print-hidden' },
          ($.themes as any[]).map((t) =>
            h('button', {
              class: 'wf-pill wf-flex-none wf-center',
              type: 'button',
              title: t.name,
              style: { background: t.colors?.primary ?? '#6366f1', width: '22px', height: '22px', border: $.deck?.theme === t.id ? '2px solid var(--wf-color-primary)' : '2px solid var(--wf-color-bg)', cursor: 'pointer', fontSize: '10px', color: '#fff', boxShadow: '0 0 0 1px var(--wf-color-border)' },
              onClick: () => changeTheme(t.id),
            }, $.deck?.theme === t.id ? '✓' : ''),
          ),
          h(Button, { size: 'sm', variant: 'ghost', title: '自定义品牌主题', onClick: () => { $.showCustom = true; $.error = '' } }, '＋'),
        ),
        h('a', {
          class: 'wf-btn wf-btn--primary wf-btn--sm wf-text-center',
          href: `/api/decks/${id}/export`,
          download: `${($.deck?.title ?? 'deck').replace(/\s+/g, '-')}.pptx`,
        }, '下载 .pptx'),
        h(Button, { size: 'sm', variant: 'ghost', onClick: () => window.print() }, '导出 PDF'),
        h(Button, { size: 'sm', variant: 'ghost', onClick: shareDeck }, '分享'),
      ),
      $.loading
        ? h(Loading, {})
        : $.error
          ? h(Alert, { variant: 'error' }, $.error)
          : h('div', { class: 'wf-grid', style: { '--wf-cols': 'repeat(auto-fill, minmax(320px, 1fr))' } },
              ($.deck?.slides ?? []).map((s: any, i: number) =>
                h('div', { class: 'wf-stack wf-gap-xs', key: i },
                  h(SlidePreview, { slide: s, themeId: $.deck.theme, index: i, customTheme: custom }),
                  h('div', { class: 'wf-row wf-gap-xs wf-print-hidden' },
                    selectOps('rewrite', REWRITE_MODES, '✎ AI 重写', i),
                    selectOps('relayout', LAYOUT_OPTS.filter(([v]) => v !== s.layout), '▣ 换版式', i),
                    $.busy === i ? h('span', { class: 'wf-text-xs wf-text-tertiary' }, '处理中…') : null,
                  ),
                ),
              ),
            ),
      h(Modal, {
        open: $.showCustom,
        title: '自定义品牌主题',
        onClose: () => $.showCustom = false,
        width: '460px',
        footer: [
          h(Button, { variant: 'ghost', onClick: () => $.showCustom = false }, '取消'),
          h(Button, { variant: 'primary', disabled: $.busyTheme, onClick: saveCustomTheme }, $.busyTheme ? '保存中…' : '保存并应用'),
        ],
      },
        h('div', { class: 'wf-stack wf-gap-md' },
          h(Input, { label: '品牌名称', value: $.customName, placeholder: '例如：Acme 品牌', onInput: (e: any) => $.customName = e.target.value }),
          h('div', { class: 'wf-grid', style: { '--wf-cols': 'repeat(2, 1fr)' } },
            Object.entries($.customColors).map(([k, v]) =>
              h('div', { class: 'wf-row wf-gap-sm wf-split', key: k },
                h('span', { class: 'wf-text-sm wf-text-medium wf-capitalize' }, k),
                h('input', { type: 'color', value: v, onInput: (e: any) => { $.customColors[k] = e.target.value; ctx.ui.render() } }),
              ),
            ),
          ),
          h(Input, { label: 'Logo（PNG，出现在每页右上角）', type: 'text', placeholder: '上传 PNG 后自动填入' }),
          h('input', { type: 'file', accept: 'image/png,image/jpeg', onChange: onLogoFile }),
          $.customLogo ? h('img', { class: 'wf-surface wf-p-xs', src: $.customLogo, style: 'width: 64px; height: 64px; object-fit: contain' }) : null,
        ),
      ),
    )
}
