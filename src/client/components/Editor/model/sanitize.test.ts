/**
 * Editor/model — 净化纯函数测试（safeUrl——node 直跑零 DOM）
 *
 * 锁定（2026-12 XSS 面封闭专项）：
 * - 协议白名单：http(s)/mailto/相对/锚 放行；javascript:/vbscript:/data: 阻断
 * - 绕过面：空白/控制字符嵌 scheme（java\tscript:）
 * - data:image/* 仅 src 场景（allowDataImage——粘贴截图）
 * - 防线位置：parse 入口（embed 快照/href）+ serialize 单一出口（mark 三来源兜底）
 *
 * 运行：node --env-file=.env --test src/client/components/Editor/model/sanitize.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeUrl } from './html.ts'

test('放行：http/https/mailto/相对/锚/query', () => {
  assert.equal(safeUrl('https://example.com/a'), 'https://example.com/a')
  assert.equal(safeUrl('http://example.com'), 'http://example.com')
  assert.equal(safeUrl('mailto:a@b.c'), 'mailto:a@b.c')
  assert.equal(safeUrl('/docs/page'), '/docs/page')
  assert.equal(safeUrl('#section-1'), '#section-1')
  assert.equal(safeUrl('?q=x'), '?q=x')
  assert.equal(safeUrl('relative/path.html'), 'relative/path.html')
})

test('阻断：javascript:/vbscript:/data:（含大小写混淆）', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null)
  assert.equal(safeUrl('JaVaScRiPt:alert(1)'), null)
  assert.equal(safeUrl('vbscript:msgbox'), null)
  assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), null)
  // 引号包裹/URL 编码形态（escapeAttr 转义外的实体绕过面——parse 属性值已解码）
  assert.equal(safeUrl('java\u0000script:alert(1)'), null, '控制字符嵌 scheme')
})

test('绕过面：空白/控制字符嵌 scheme（java\\tscript:）', () => {
  assert.equal(safeUrl('java\tscript:alert(1)'), null)
  assert.equal(safeUrl('java\nscript:alert(1)'), null)
  assert.equal(safeUrl(' javascript:alert(1)'), null)
  assert.equal(safeUrl('\x01javascript:alert(1)'), null)
})

test('data:image 仅 src 场景放行（粘贴截图）', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo='
  assert.equal(safeUrl(png, true), png.replace(/\s/g, ''), 'allowDataImage 放行')
  assert.equal(safeUrl(png), null, '默认（href 场景）阻断')
  assert.equal(safeUrl('data:image/svg+xml,<svg onload=alert(1)>', true), null, '非 base64 图片子类不放行——SVG 可携带脚本')
  assert.equal(safeUrl('data:text/html,x', true), null, 'data:text/html 阻断')
})

test('降级语义：null = 调用方删属性；空串 = 合法空 href', () => {
  assert.equal(safeUrl(''), '', '空串合法（unlink 形态）')
  assert.equal(safeUrl(undefined), '', '非字符串降级空串')
  assert.equal(safeUrl(123), '', '数字降级空串')
})

test('非 ASCII 域名/中文路径原样（白名单只管 scheme——不管内容）', () => {
  assert.equal(safeUrl('https://例え.jp/路径'), 'https://例え.jp/路径')
  assert.equal(safeUrl('/docs/中文.html'), '/docs/中文.html')
})
