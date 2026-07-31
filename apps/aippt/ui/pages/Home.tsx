import { h } from 'weifuwu/client'

/** 创建页 — 一句话 / 从文档生成 PPT */
export const Home = (_init: any, ctx: any) => {
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
      const res = await fetch('/api/templates').then((r) => r.json())
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
    h('div', { class: 'home' },
      h('div', { class: 'home-hero' },
        h('div', { class: 'logo' }, '⛰'),
        h('h1', {}, 'aippt'),
        h('p', {}, 'AI PPT 生成引擎 — 一句话或一份文档，生成专业演示文稿'),
        h('a', { class: 'history-link', href: '/history' }, '我的演示文稿 →'),
      ),
      h('div', { class: 'home-card' },
        h('div', { class: 'mode-tabs' },
          h('button', { class: `mode-tab${$.mode === 'topic' ? ' active' : ''}`, onClick: () => { $.mode = 'topic'; $.error = '' } }, '一句话生成'),
          h('button', { class: `mode-tab${$.mode === 'doc' ? ' active' : ''}`, onClick: () => { $.mode = 'doc'; $.error = '' } }, '从文档生成'),
        ),
        $.mode === 'topic'
          ? h('textarea', {
              class: 'input', rows: 3,
              placeholder: '例如：2025 年 AI 技术趋势，面向技术团队的路演',
              value: $.topic,
              onInput: (e: any) => $.topic = e.target.value,
            })
          : h('div', { class: 'doc-input' },
              h('textarea', {
                class: 'input doc-area', rows: 8,
                placeholder: '粘贴你的材料（报告 / 方案 / 讲义 / 纪要，50-4000 字）…',
                value: $.doc,
                onInput: (e: any) => $.doc = e.target.value,
              }),
              h('div', { class: 'doc-count' }, `${$.doc.length} 字${$.doc.length > 4000 ? '（已超出，将截断处理）' : ''}`),
            ),
        h('div', { class: 'row' },
          h('div', { class: 'field' },
            h('label', { class: 'lbl' }, '页数'),
            h('select', { class: 'input', value: String($.pages), onChange: (e: any) => $.pages = Number(e.target.value) },
              [5, 8, 10, 12, 15].map((n) => h('option', { value: String(n) }, `${n} 页`)),
            ),
          ),
          h('div', { class: 'field' },
            h('label', { class: 'lbl' }, '风格'),
            h('select', { class: 'input', value: $.style, onChange: (e: any) => $.style = e.target.value },
              styles.map(([v, l]) => h('option', { value: v }, l)),
            ),
          ),
        ),
        $.templates.length > 0
          ? h('div', { class: 'template-row' },
              h('label', { class: 'lbl' }, '模板（可选，决定大纲结构）'),
              h('div', { class: 'template-list' },
                $.templates.map((t: any) =>
                  h('button', {
                    class: `template-chip${$.template === t.id ? ' active' : ''}`,
                    key: t.id,
                    onClick: () => pickTemplate(t),
                    title: t.description,
                  }, `${t.icon} ${t.name}`),
                ),
              ),
            )
          : null,
        h('label', { class: 'lbl' }, '受众（可选）'),
        h('input', {
          class: 'input',
          placeholder: '例如：投资人 / 学生 / 内部团队',
          value: $.audience,
          onInput: (e: any) => $.audience = e.target.value,
        }),
        $.error ? h('div', { class: 'error' }, $.error) : null,
        h('button', { class: 'btn', disabled: $.loading, onClick: submit }, $.loading ? '生成中…' : '生成大纲 →'),
        h('div', { class: 'hint' }, '第一步生成大纲（约 10 秒），确认后可逐页生成完整内容'),
      ),
    )
}
