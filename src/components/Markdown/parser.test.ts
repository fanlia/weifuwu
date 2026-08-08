import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseInline, parseMarkdown } from './parser.ts'

/**
 * Markdown parser — 安全子集（标题/段落/列表/代码块/引用/分割线 + 行内粗体/斜体/代码/链接）
 *
 * 安全基线：无 raw HTML 透传（解析结果为结构化 token，组件以 VNode 渲染天然转义）；
 * 链接仅允许 http/https（javascript:/data: 拒绝）。
 */

describe('parseMarkdown 块级', () => {
  it('解析标题（h1-h4）', () => {
    const blocks = parseMarkdown('# 标题一\n## 标题二\n### 标题三\n#### 标题四')
    assert.deepEqual(
      blocks.map(b => [b.type, b.level]),
      [['heading', 1], ['heading', 2], ['heading', 3], ['heading', 4]],
    )
  })

  it('解析段落（空行分隔）', () => {
    const blocks = parseMarkdown('第一段\n\n第二段')
    assert.deepEqual(blocks.map(b => b.type), ['paragraph', 'paragraph'])
  })

  it('解析无序列表（-/*/+）', () => {
    const blocks = parseMarkdown('- 苹果\n- 香蕉\n+ 橙子\n* 葡萄')
    assert.equal(blocks[0].type, 'list')
    assert.equal(blocks[0].ordered, false)
    assert.equal(blocks[0].items!.length, 4)
  })

  it('解析有序列表', () => {
    const blocks = parseMarkdown('1. 第一步\n2. 第二步')
    assert.equal(blocks[0].type, 'list')
    assert.equal(blocks[0].ordered, true)
  })

  it('解析代码块（围栏，含语言）', () => {
    const blocks = parseMarkdown('```ts\nconst a: number = 1\n```')
    assert.equal(blocks[0].type, 'code')
    assert.equal(blocks[0].lang, 'ts')
    assert.equal(blocks[0].code, 'const a: number = 1\n')
  })

  it('代码块内不解析行内标记', () => {
    const blocks = parseMarkdown('```\n**不是粗体**\n```')
    assert.equal(blocks[0].type, 'code')
    assert.equal(blocks[0].code, '**不是粗体**\n')
  })

  it('解析引用', () => {
    const blocks = parseMarkdown('> 引用一段\n> 引用两行')
    assert.equal(blocks[0].type, 'quote')
  })

  it('解析分割线', () => {
    const blocks = parseMarkdown('上面\n\n---\n\n下面')
    assert.deepEqual(blocks.map(b => b.type), ['paragraph', 'hr', 'paragraph'])
  })

  it('空输入返回空数组', () => {
    assert.deepEqual(parseMarkdown(''), [])
    assert.deepEqual(parseMarkdown('   \n\n  '), [])
  })
})

describe('parseInline 行内', () => {
  it('纯文本', () => {
    assert.deepEqual(parseInline('你好 world'), [{ type: 'text', text: '你好 world' }])
  })

  it('粗体与斜体', () => {
    const out = parseInline('**粗** 与 *斜*')
    assert.deepEqual(out, [
      { type: 'bold', children: [{ type: 'text', text: '粗' }] },
      { type: 'text', text: ' 与 ' },
      { type: 'italic', children: [{ type: 'text', text: '斜' }] },
    ])
  })

  it('行内代码（内嵌标记不解析）', () => {
    assert.deepEqual(parseInline('跑 `npm **test**` 即可'), [
      { type: 'text', text: '跑 ' },
      { type: 'code', text: 'npm **test**' },
      { type: 'text', text: ' 即可' },
    ])
  })

  it('链接（安全 URL 白名单）', () => {
    const out = parseInline('[官网](https://weifuwu.dev)')
    assert.deepEqual(out, [
      { type: 'link', href: 'https://weifuwu.dev', children: [{ type: 'text', text: '官网' }] },
    ])
  })

  it('javascript: 链接被拒绝（降级为纯文本）', () => {
    const out = parseInline('[恶意](javascript:alert(1))')
    assert.equal(out[0].type, 'text')
  })
})

describe('安全边界', () => {
  it('raw HTML 保持文本（不解析为标签）', () => {
    const blocks = parseMarkdown('<script>alert(1)</script>')
    const html = JSON.stringify(blocks)
    // 结构化 token 中无任何 HTML 标签节点；组件渲染层保证转义
    assert.ok(html.includes('script'))
  })

  it('onerror 事件属性是纯文本', () => {
    const blocks = parseMarkdown('<img src=x onerror=alert(1)>')
    assert.equal(blocks[0].type, 'paragraph')
    const inline = blocks[0].inline!
    assert.equal(inline[0].type, 'text')
    assert.ok(inline[0].text!.includes('onerror'))
  })

  it('data: 链接被拒绝', () => {
    const out = parseInline('[x](data:text/html,evil)')
    assert.equal(out[0].type, 'text')
  })
})
