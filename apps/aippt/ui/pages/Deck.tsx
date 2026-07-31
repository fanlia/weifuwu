import { h } from 'weifuwu/client'
import { SlidePreview } from '../components/SlidePreview'
import { buildCustomTheme } from '../../src/pptx/theme.ts'

/** 预览页 — 生成结果预览 + 编辑（换主题/自定义品牌/AI 重写/换版式）+ 下载 */
export const Deck = (_init: any, ctx: any) => {
  const $ = ctx.ui.$()
  $.deck = null
  $.themes = [] // 预设 + 自定义
  $.loading = true
  $.error = ''
  $.busy = null
  $.busyTheme = false
  $.showCustom = false // 自定义主题面板
  $.customName = ''
  $.customColors = { primary: '#2563EB', bg: '#FFFFFF', text: '#111827', textSecondary: '#4B5563' }
  $.customLogo = ''
  const id = (ctx as any).route?.params?.id

  // 加载 deck + 主题列表
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

  /** 当前主题（自定义则构建 Theme 对象供预览/导出） */
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
      $.busyTheme = false // 释放锁，让 changeTheme 可执行
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

  return () =>
    h('div', { class: 'deck' },
      h('div', { class: 'deck-top' },
        h('button', { class: 'btn ghost', onClick: () => ctx.app.navigate('/') }, '← 新建'),
        h('h2', { class: 'deck-title' }, $.deck?.title ?? ''),
        h('div', { class: 'theme-switcher' },
          ($.themes as any[]).map((t) =>
            h('button', {
              class: `theme-dot${$.deck?.theme === t.id ? ' active' : ''}`,
              title: t.name,
              style: { background: t.colors?.primary ?? '#6366f1' },
              onClick: () => changeTheme(t.id),
            }, $.deck?.theme === t.id ? '✓' : ''),
          ),
          h('button', { class: 'theme-add', title: '自定义品牌主题', onClick: () => { $.showCustom = true; $.error = '' } }, '＋'),
        ),
        h('a', {
          class: 'btn',
          href: `/api/decks/${id}/export`,
          download: `${($.deck?.title ?? 'deck').replace(/\s+/g, '-')}.pptx`,
        }, '下载 .pptx'),
        h('button', { class: 'btn ghost', onClick: () => window.print() }, '导出 PDF'),
        h('button', { class: 'btn ghost', onClick: shareDeck }, '分享'),
      ),
      $.loading
        ? h('div', { class: 'loading' }, '加载中…')
        : $.error
          ? h('div', { class: 'error' }, $.error)
          : h('div', { class: 'slides' },
              ($.deck?.slides ?? []).map((s: any, i: number) =>
                h('div', { class: 'slide-wrap', key: i },
                  h(SlidePreview, { slide: s, themeId: $.deck.theme, index: i, customTheme: custom }),
                  h('div', { class: 'slide-ops' },
                    h('select', {
                      class: 'ops-select', value: '',
                      onChange: (e: any) => { if (e.target.value) { postEdit(i, 'rewrite', { mode: e.target.value }); e.target.value = '' } },
                    },
                      h('option', { value: '', disabled: true }, '✎ AI 重写'),
                      REWRITE_MODES.map(([v, l]) => h('option', { value: v }, l)),
                    ),
                    h('select', {
                      class: 'ops-select', value: '',
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
      $.showCustom
        ? h('div', { class: 'overlay', onClick: () => $.showCustom = false },
            h('div', { class: 'custom-panel', onClick: (e: any) => e.stopPropagation() },
              h('h3', {}, '自定义品牌主题'),
              h('label', { class: 'lbl' }, '品牌名称'),
              h('input', { class: 'input', value: $.customName, placeholder: '例如：Acme 品牌', onInput: (e: any) => $.customName = e.target.value }),
              h('div', { class: 'color-grid' },
                Object.entries($.customColors).map(([k, v]) =>
                  h('div', { class: 'color-field', key: k },
                    h('label', { class: 'lbl' }, k),
                    h('input', { type: 'color', value: v, onInput: (e: any) => { $.customColors[k] = e.target.value; ctx.ui.render() } }),
                  ),
                ),
              ),
              h('label', { class: 'lbl' }, 'Logo（PNG，出现在每页右上角）'),
              h('input', { type: 'file', accept: 'image/png,image/jpeg', onChange: onLogoFile }),
              $.customLogo ? h('img', { class: 'logo-preview', src: $.customLogo }) : null,
              h('div', { class: 'custom-actions' },
                h('button', { class: 'btn ghost', onClick: () => $.showCustom = false }, '取消'),
                h('button', { class: 'btn', disabled: $.busyTheme, onClick: saveCustomTheme }, $.busyTheme ? '保存中…' : '保存并应用'),
              ),
            ),
          )
        : null,
    )
}
