/**
 * vdom core — 核心审计契约（R7—— P5）
 *
 * 直跑 scripts/core-audit.mjs（node:test——零浏览器）：
 * - C1：proc* 防御性 return 必须有语义标注（静默吞错 = P2 违例显式化）
 * - C2：core `as any` 登记制（11 处豁免——debug 门/动态属性 TS 面不足；
 *   白名单外新增 = 报错——登记理由或重构）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coreAudit } from '../../../scripts/core-audit.mjs'

test('C1/C2 核心审计零违规（防御标注 + as-any 登记制）', () => {
  const res = coreAudit()
  assert.equal(res.errors.length, 0, 'C1/C2 违规:\n' + res.errors.join('\n'))
})
