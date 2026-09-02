/**
 * 样式审计契约（ §3——S1-S5 防回潮红线）
 *
 * 直跑 scripts/style-audit.mjs（node:test——零浏览器——契约层纪律）。
 * 断言：
 *   - S1-S7 错误 = 0（色值字面量 / 未知 token / CJK heading 硬编码 / 裸动效时长 /
 *     注释提前闭合——S7：--wf-transition-duration 吞声明实修实证）
 *   - S4 状态链警告 ≤ 基线（登记制：M3 清单基线 66——新警告超基线报警，
 *     修复后警告数下降——基线随 M3 推进下调）
 *   - S6 硬编码字号 ≤ 基线 12（图标/头像/徽标白名单）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { audit } from '../../../scripts/style-audit.mjs'

/** S4 警告基线（M3 交互一致性清单——每修复一批下调一次：79 → 66） */
const S4_WARN_BASELINE = 66

/** S6 硬编码字号基线（登记制——图标/头像/徽标白名单 12 处；正文 token 化后下降） */
const S6_WARN_BASELINE = 12

test('S1-S7 样式审计零错误（防回潮红线）', () => {
  const res = audit()
  assert.equal(res.errors.length, 0, 'S1-S7 违规:\n' + res.errors.join('\n'))
  assert.equal(res.files, 132, `组件 CSS 文件数（新增组件须登记审计）: ${res.files}`)
})

test('S4 交互态链警告 ≤ 基线（登记制——不新增漏网）', () => {
  const res = audit()
  const s4 = res.warnings.filter((w) => w.includes('S4'))
  assert.ok(
    s4.length <= S4_WARN_BASELINE,
    `S4 警告 ${s4.length} 超过基线 ${S4_WARN_BASELINE}——新交互元素缺状态链反馈:\n` +
      s4.slice(0, 30).join('\n'),
  )
})

test('S6 硬编码字号 ≤ 基线（登记制——正文必须 token 化）', () => {
  const res = audit()
  const s6 = res.warnings.filter((w) => w.includes('S6'))
  assert.ok(
    s6.length <= S6_WARN_BASELINE,
    `S6 硬编码字号 ${s6.length} 超过基线 ${S6_WARN_BASELINE}——正文类须 token 化:\n` +
      s6.slice(0, 30).join('\n'),
  )
})
