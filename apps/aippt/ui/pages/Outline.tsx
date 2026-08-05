import { h, type Component } from 'weifuwu/client'
import type { RouteInjected } from 'weifuwu/client'
import { Alert, Badge, Button, Input, Loading, ProgressBar } from 'weifuwu/components'

/** 大纲确认页 — 编辑确认后流式生成完整 deck */
export const Outline: Component<{}, RouteInjected> = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.title = ''
  $.theme = ''
  $.items = []
  $.loading = true
  $.error = ''
  $.generating = false
  $.progress = { index: 0, total: 0 }

  const id = (ctx as any).route?.params?.id

  ;(async () => {
    try {
      const res = await fetch(`/api/outlines/${id}`).then((r) => r.json())
      if (res.error) throw new Error(res.error)
      $.title = res.outline.title
      $.theme = res.outline.theme
      $.items = res.outline.slides
    } catch (err: any) {
      $.error = err?.message ?? String(err)
    } finally {
      $.loading = false
    }
  })()

  const parseSSE = (buf: string, handle: (event: string, data: any) => void) => {
    let idx: number
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const event = raw.match(/^event: (.+)$/m)?.[1] ?? 'message'
      const data = raw.match(/^data: (.+)$/m)?.[1]
      if (data) {
        try { handle(event, JSON.parse(data)) } catch { /* 忽略坏数据 */ }
      }
    }
    return buf
  }

  const confirm = async () => {
    if ($.generating) return
    $.generating = true
    $.error = ''
    $.progress = { index: 0, total: $.items.length }
    try {
      const res = await fetch(`/api/decks/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides: $.items }),
      })
      if (!res.body) throw new Error('响应无流')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let done = false
      while (!done) {
        const { done: d, value } = await reader.read()
        if (d) break
        buf = parseSSE(buf + decoder.decode(value, { stream: true }), (event, data) => {
          if (event === 'slide') $.progress = { index: data.index, total: data.total }
          else if (event === 'done') { done = true; ctx.app.navigate(`/decks/${data.id}`) }
          else if (event === 'error') { throw new Error(data.message) }
        })
      }
    } catch (err: any) {
      $.error = err?.message ?? String(err)
    } finally {
      $.generating = false
    }
  }

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= $.items.length) return
    const arr = [...$.items]
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    $.items = arr
  }
  const remove = (i: number) => {
    $.items = $.items.filter((_: any, k: number) => k !== i)
  }
  const add = () => {
    $.items = [...$.items, { layout: 'bullets', title: '新页面', points: ['要点一', '要点二'] }]
  }

  const LAYOUT_NAMES: Record<string, string> = {
    cover: '封面', section: '章节', bullets: '要点', twoColumn: '双栏', data: '数据', thanks: '结束',
  }

  return () =>
    h('div', { class: 'wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto', style: { '--wf-max': '960px' } },
      h('div', { class: 'wf-row wf-gap-md wf-mb-sm' },
        h(Button, { variant: 'ghost', size: 'sm', onClick: () => ctx.app.navigate('/') }, '← 新建'),
        h('input', {
          class: 'wf-input wf-input--borderless wf-text-xl wf-text-bold wf-fill',
          value: $.title,
          onInput: (e: any) => $.title = e.target.value,
        }),
        h(Badge, { variant: 'primary' }, $.theme),
      ),
      $.loading
        ? h(Loading, {})
        : $.error
          ? h(Alert, { variant: 'error' }, $.error)
          : h('div', { class: 'wf-stack wf-gap-md' },
              h('div', { class: 'wf-stack wf-gap-sm' },
                $.items.map((s: any, i: number) =>
                  h('div', { class: 'wf-surface wf-p-md wf-row wf-gap-md wf-top', key: i },
                    h('div', { class: 'wf-pill wf-bg-brand wf-text-brand wf-text-sm wf-text-bold wf-flex-none wf-center', style: 'width: 28px; height: 28px' }, String(i + 1)),
                    h('div', { class: 'wf-fill wf-stack wf-gap-sm' },
                      h('div', { class: 'wf-row wf-gap-sm' },
                        h('select', {
                          class: 'wf-input wf-w-auto', value: s.layout,
                          onChange: (e: any) => { s.layout = e.target.value; ctx.ui.render() },
                        }, Object.entries(LAYOUT_NAMES).map(([v, l]) => h('option', { value: v }, l))),
                        h('input', {
                          class: 'wf-input wf-fill', value: s.title, placeholder: '页面标题',
                          onInput: (e: any) => s.title = e.target.value,
                        }),
                        h(Button, { size: 'sm', variant: 'ghost', disabled: i === 0, onClick: () => move(i, -1) }, '↑'),
                        h(Button, { size: 'sm', variant: 'ghost', disabled: i === $.items.length - 1, onClick: () => move(i, 1) }, '↓'),
                        h(Button, { size: 'sm', variant: 'danger', onClick: () => remove(i) }, '✕'),
                      ),
                      (s.layout === 'bullets' || s.layout === 'twoColumn')
                        ? h('textarea', {
                            class: 'wf-input wf-textarea', rows: 2, placeholder: '每行一条要点摘要',
                            value: (s.points ?? []).join('\n'),
                            onInput: (e: any) => s.points = e.target.value.split('\n').filter((x: string) => x.trim()),
                          })
                        : null,
                    ),
                  ),
                ),
              ),
              h('div', { class: 'wf-split wf-gap-md' },
                h(Button, { variant: 'ghost', onClick: add }, '＋ 加页'),
                $.generating
                  ? h('div', { class: 'wf-fill wf-stack wf-gap-sm', style: 'min-width: 260px' },
                      h('div', { class: 'wf-text-xs wf-text-tertiary' }, `生成中… ${$.progress.index}/${$.progress.total} 页`),
                      h(ProgressBar, { value: $.progress.total ? (100 * $.progress.index / $.progress.total) : 0, showValue: false }),
                    )
                  : h(Button, { variant: 'primary', onClick: confirm }, '确认并生成 PPT →'),
              ),
            ),
    )
}
