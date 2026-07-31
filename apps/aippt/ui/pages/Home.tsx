import { h } from 'weifuwu/client'

/** 创建页 — 一句话生成 PPT */
export const Home = (_init: any, ctx: any) => {
  const $ = ctx.ui.$()
  $.topic = ''
  $.pages = 8
  $.style = 'corporate'
  $.audience = ''
  $.loading = false
  $.error = ''

  const submit = async () => {
    if (!$.topic.trim() || $.loading) return
    $.loading = true
    $.error = ''
    try {
      const res = await ctx.api.post('/api/decks/outline', {
        topic: $.topic.trim(),
        pages: $.pages,
        style: $.style,
        audience: $.audience.trim() || undefined,
      })
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
        h('p', {}, 'AI PPT 生成引擎 — 一句话生成专业演示文稿'),
      ),
      h('div', { class: 'home-card' },
        h('label', { class: 'lbl' }, '主题 *'),
        h('textarea', {
          class: 'input',
          rows: 3,
          placeholder: '例如：2025 年 AI 技术趋势，面向技术团队的路演',
          value: $.topic,
          onInput: (e: any) => $.topic = e.target.value,
        }),
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
        h('label', { class: 'lbl' }, '受众（可选）'),
        h('input', {
          class: 'input',
          placeholder: '例如：投资人 / 学生 / 内部团队',
          value: $.audience,
          onInput: (e: any) => $.audience = e.target.value,
        }),
        $.error ? h('div', { class: 'error' }, $.error) : null,
        h('button', { class: 'btn', disabled: $.loading, onClick: submit }, $.loading ? '生成中…' : '生成 PPT'),
        h('div', { class: 'hint' }, '第一步生成大纲（约 10 秒），确认后可逐页生成完整内容'),
      ),
    )
}
