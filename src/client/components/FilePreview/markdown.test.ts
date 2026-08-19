/**
 * FilePreview 测试——md 编辑桥转换 + 组件渲染
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../vdom/setup.ts'
import { markdownToHtml, serializeMarkdown } from './markdown.ts'
import { parseHtml } from '../Editor/model/html.ts'
import { applyEdit } from '../Editor/model/apply.ts'

before(setupJsdom)

// ── markdownToHtml（编辑入口） ─────────────────────────────────────────

test('markdownToHtml：块级 → HTML', () => {
  const html = markdownToHtml('# 标题\n\n正文\n\n> 引用\n\n- 甲\n- 乙\n\n1. 一')
  assert.ok(html.includes('<h1>标题</h1>'), '标题')
  assert.ok(html.includes('<p>正文</p>'), '段落')
  assert.ok(html.includes('<blockquote>引用</blockquote>'), '引用')
  assert.ok(html.includes('<ul><li>甲</li><li>乙</li></ul>'), '无序列表')
  assert.ok(html.includes('<ol><li>一</li></ol>'), '有序列表')
})

test('markdownToHtml：行内 → HTML（安全转义 + URL 白名单）', () => {
  const html = markdownToHtml('**粗体** 和 *斜体* 和 `code` 和 [链](https://w.com)')
  assert.ok(html.includes('<strong>粗体</strong>'), '粗体')
  assert.ok(html.includes('<em>斜体</em>'), '斜体')
  assert.ok(html.includes('<code>code</code>'), '行内代码')
  assert.ok(html.includes('<a href="https://w.com">链</a>'), '链接')
})

test('markdownToHtml：代码块 → pre（原样转义）', () => {
  const html = markdownToHtml('```js\nconst a = <b>\n```')
  assert.ok(html.includes('<pre><code>'), '代码块 pre 包裹')
  assert.ok(html.includes('const a = &lt;b&gt;'), '代码内容转义')
})

test('markdownToHtml：表格 → <table>（embed 快照——编辑闭环格式保留）', () => {
  const html = markdownToHtml('| a | b |\n|---|---|\n| 1 | 2 |')
  assert.ok(html.includes('<table><tbody>'), '表格输出')
  assert.ok(html.includes('<td>a</td>'), '表头单元格')
  assert.ok(html.includes('<td>1</td>'), '数据单元格')
})

test('表格编辑闭环：md 表格 → embed 快照 → 保存还原表格语法', () => {
  const doc = parseHtml(markdownToHtml('| 名称 | 值 |\n|---|---|\n| 甲 | 1 |'))
  const out = serializeMarkdown(doc)
  assert.ok(out.includes('| 名称 | 值 |'), '表头还原')
  assert.ok(out.includes('| 甲 | 1 |'), '数据行还原')
})

// ── serializeMarkdown（保存回写） ──────────────────────────────────────

test('编辑闭环：md → HTML → DocState（Editor 模型）→ serializeMarkdown 语义等价', () => {
  const md = '# 标题\n\n这是**粗体**和*斜体*段落\n\n> 引用\n\n- 项'
  // md → HTML（编辑入口）→ Editor 模型 DocState
  const doc = parseHtml(markdownToHtml(md))
  // 编辑（AI 替换——事件流模型）
  const edited = applyEdit(doc, {
    type: 'ai-apply', start: 5, end: 7, original: '粗体', revised: '加粗',
    removedEmbeds: [], removedBlocks: [],
  })
  const out = serializeMarkdown(edited)
  // AI 替换删除区间内 mark（粗体格式随原文删除——语义正确）；区间外斜体保留
  assert.equal(out, '# 标题\n\n这是加粗和*斜体*段落\n\n> 引用\n\n- 项')
})

test('serializeMarkdown：图片/分隔线/代码块全还原（pre embed——编辑闭环格式保留）', () => {
  const doc = parseHtml(markdownToHtml('前![图](https://x/a.png)后\n\n---\n\n```\ncode\n```'))
  const out = serializeMarkdown(doc)
  assert.ok(out.includes('![图](https://x/a.png)'), '图片还原')
  assert.ok(out.includes('---'), '分隔线还原')
  assert.ok(out.includes('```\ncode\n```'), '代码块 ``` 保留（pre embed）')
})

test('serializeMarkdown：纯文本（text 文件保存）', () => {
  const doc = parseHtml('<p>hello world</p>')
  assert.equal(serializeMarkdown(doc), 'hello world')
})
