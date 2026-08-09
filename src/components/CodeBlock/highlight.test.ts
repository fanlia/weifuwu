/**
 * CodeBlock 语法高亮 tokenizer 测试
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokenize } from '../../components/CodeBlock/highlight.ts'

test('ts 代码：关键字/字符串/注释/数字/函数调用', () => {
  const toks = tokenize(`// 注释
const count = 42
const msg = 'hello'
function add(a, b) { return a + b }`, 'ts')
  const types = toks.map((t) => t.type)
  assert.ok(types.includes('comment'), '行注释')
  assert.ok(types.includes('keyword'), 'const/function/return')
  assert.ok(types.includes('string'), "字符串 'hello'")
  assert.ok(types.includes('number'), '数字 42')
  assert.ok(types.includes('function'), '函数调用 add(')
  // 注释内容完整
  const comment = toks.find((t) => t.type === 'comment')
  assert.equal(comment?.text, '// 注释')
})

test('tsx 代码：JSX 标签识别', () => {
  const toks = tokenize(`const App = () => <div className="x">Hello</div>`, 'tsx')
  const jsx = toks.filter((t) => t.type === 'jsx-tag')
  assert.ok(jsx.length >= 2, 'JSX 开闭标签（实际: ' + jsx.map((t) => t.text).join(',') + '）')
})

test('bash：注释 # + 关键字', () => {
  const toks = tokenize('# install\nnpm install -g weifuwu', 'bash')
  const types = toks.map((t) => t.type)
  assert.ok(types.includes('comment'), '# 注释')
  assert.ok(types.includes('keyword'), 'npm 关键字')
})

test('html：标签 + 字符串属性', () => {
  const toks = tokenize('<div class="a">text</div>', 'html')
  const jsx = toks.filter((t) => t.type === 'jsx-tag')
  const str = toks.find((t) => t.type === 'string')
  assert.ok(jsx.length >= 2, 'HTML 标签')
  assert.equal(str?.text, '"a"', '属性字符串')
})

test('多行注释 + 模板字符串完整捕获', () => {
  const toks = tokenize('const s = `multi\nline`\n/* block */\nlet x = 1', 'ts')
  const str = toks.find((t) => t.type === 'string')
  assert.ok(str?.text.includes('multi'), '模板字符串含换行完整捕获')
  const block = toks.find((t) => t.type === 'comment' && t.text.includes('block'))
  assert.ok(block, '块注释')
})

test('文本 + token 拼接无损（code 完整重建）', () => {
  const code = 'const a = 1 // 数字\nfn("x") { return a + b[0] }'
  const toks = tokenize(code, 'ts')
  assert.equal(toks.map((t) => t.text).join(''), code, 'token 拼接 = 原代码')
})
