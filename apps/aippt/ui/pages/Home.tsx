import { h, type Component } from 'weifuwu/client'
import type { ApiInjected } from 'weifuwu/client'
import type { RouteInjected } from 'weifuwu/client'
import { Alert, Button, Card, Field, SegmentedControl, Select, Textarea } from 'weifuwu/components'

/** 创建页 — 一句话 / 从文档生成 PPT */
export const Home: Component<{}, ApiInjected & RouteInjected> = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.mode = 'topic'
  $.topic = ''
  $.doc = ''
  $.pages = 8
  $.style = 'corporate'
  $.audience = ''
  $.template = ''
  $.templates = []
  $.loading = false
  $.error = ''

  // 加载模板列表
  ;(async () => {
    try {
      const res = await ctx.api!.get('/api/templates')
      $.templates = res.templates ?? []
    } catch { /* 模板加载失败不阻塞 */ }
  })()

  const pickTemplate = (t: any) => {
    $.template = $.template === t.id ? '' : t.id
    if (t.defaultStyle) $.style = t.defaultStyle
    if (t.defaultPages) $.pages = t.defaultPages
    $.error = ''
  }

  const submit = async () => {
    if ($.loading) return
    if ($.mode === 'topic' && !$.topic.trim()) { $.error = '请输入主题'; return }
    if ($.mode === 'doc' && $.doc.trim().length < 50) { $.error = '文档内容至少 50 字'; return }
    $.loading = true
    $.error = ''
    try {
      const body = $.mode === 'topic'
        ? { topic: $.topic.trim(), pages: $.pages, style: $.style, audience: $.audience.trim() || undefined, template: $.template || undefined }
        : { content: $.doc.trim(), pages: $.pages, style: $.style, audience: $.audience.trim() || undefined }
      const res = await ctx.api.post($.mode === 'topic' ? '/api/decks/outline' : '/api/decks/outline-from-doc', body)
      ctx.app.navigate(`/decks/${res.id}/outline`)
    } catch (err: any) {
      $.error = err?.message ?? String(err)
    } finally {
      $.loading = false
    }
  }

  const styles = [
    ['corporate', '商务'],
    ['minimal', '极简'],
    ['tech', '科技'],
    ['academic', '学术'],
    ['vibrant', '活力'],
  ]

  return () =>
    h('div', { class: 'wf-container wf-stack wf-gap-xl wf-p-xl wf-mx-auto', style: { '--wf-max': '560px' } },
      h('div', { class: 'wf-stack wf-gap-xs wf-text-center' },
        h('div', { class: 'wf-text-5xl' }, '⛰'),
        h('h1', { class: 'wf-text-3xl wf-m-0' }, 'aippt'),
        h('p', { class: 'wf-text-base wf-text-secondary wf-m-0' }, 'AI PPT 生成引擎 — 一句话或一份文档，生成专业演示文稿'),
        h('a', { class: 'wf-text-brand wf-text-sm', href: '/history' }, '我的演示文稿 →'),
      ),
      h(Card, { padding: 'lg' },
        h('div', { class: 'wf-stack wf-gap-md' },
          h(SegmentedControl, {
            value: $.mode,
            onChange: (v: string) => { $.mode = v; $.error = '' },
            options: [
              { value: 'topic', label: '一句话生成' },
              { value: 'doc', label: '从文档生成' },
            ],
          }),
          $.mode === 'topic'
            ? h(Textarea, {
                rows: 3,
                placeholder: '例如：2025 年 AI 技术趋势，面向技术团队的路演',
                value: $.topic,
                onInput: (e: any) => $.topic = e.target.value,
              })
            : h('div', { class: 'wf-stack wf-gap-xs' },
                h(Textarea, {
                  rows: 8,
                  placeholder: '粘贴你的材料（报告 / 方案 / 讲义 / 纪要，50-4000 字）…',
                  value: $.doc,
                  onInput: (e: any) => $.doc = e.target.value,
                }),
                h('div', { class: 'wf-text-xs wf-text-tertiary wf-text-right' }, `${$.doc.length} 字${$.doc.length > 4000 ? '（已超出，将截断处理）' : ''}`),
              ),
          h('div', { class: 'wf-row wf-gap-md' },
            h('div', { class: 'wf-fill' },
              h(Select, {
                label: '页数',
                value: String($.pages),
                onChange: (v: string) => $.pages = Number(v),
                options: [5, 8, 10, 12, 15].map((n) => ({ value: String(n), label: `${n} 页` })),
              }),
            ),
            h('div', { class: 'wf-fill' },
              h(Select, {
                label: '风格',
                value: $.style,
                onChange: (v: string) => $.style = v,
                options: styles.map(([v, l]) => ({ value: v, label: l })),
              }),
            ),
          ),
          $.templates.length > 0
            ? h('div', { class: 'wf-stack wf-gap-xs' },
                h('label', { class: 'wf-text-sm wf-text-medium' }, '模板（可选，决定大纲结构）'),
                h('div', { class: 'wf-row wf-gap-xs wf-cluster' },
                  $.templates.map((t: any) =>
                    h('button', {
                      class: `wf-pill wf-px-md wf-py-xs wf-text-sm${$.template === t.id ? ' wf-bg-brand wf-text-brand' : ' wf-bg-tertiary wf-text-secondary'}`,
                      type: 'button',
                      key: t.id,
                      onClick: () => pickTemplate(t),
                      title: t.description,
                      style: 'cursor: pointer; border: none; font-family: inherit',
                    }, `${t.icon} ${t.name}`),
                  ),
                ),
              )
            : null,
          h(Field, { label: '受众（可选）' },
            h('input', {
              class: 'wf-input',
              placeholder: '例如：投资人 / 学生 / 内部团队',
              value: $.audience,
              onInput: (e: any) => $.audience = e.target.value,
            }),
          ),
          $.error ? h(Alert, { variant: 'error' }, $.error) : null,
          h(Button, { variant: 'primary', block: true, disabled: $.loading, onClick: submit }, $.loading ? '生成中…' : '生成大纲 →'),
          h('div', { class: 'wf-text-xs wf-text-tertiary wf-text-center' }, '第一步生成大纲（约 10 秒），确认后可逐页生成完整内容'),
        ),
      ),
    )
}
