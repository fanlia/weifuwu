/**
 * 内置工具 handler 契约测试（2027-09——AI 工具覆盖审计补全）
 *
 * 审计结论（全部 AI 工具矩阵）：search_knowledge_base（kb-search 契约）、
 * call_agent/plan_tasks（multi-agent/orchestrator 场景矩阵）、read_csv
 * （process-csv）均有 handler 行为级覆盖——**get_current_time 零覆盖**——
 * 本文件补其格式契约（AI 面向用户的文本——时区/完整性必须正确）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerBuiltinTools } from '../src/tools/builtin.ts'
import { getToolHandler } from '../src/tools/registry.ts'

test('get_current_time：Asia/Shanghai 时区 + 年月日时分秒星期完整', async () => {
  // handler 注册面（get_current_time 不读 ctx——getCtx 空实现即可）
  registerBuiltinTools(() => ({} as any))
  const handler = getToolHandler('get_current_time') as unknown as (args: Record<string, unknown>) => Promise<string>
  assert.ok(handler, 'get_current_time handler 应已注册')
  const r = await handler({})
  // zh-CN + Asia/Shanghai：星期/日期/时间齐全
  assert.match(r, /星期[一二三四五六日]/, `应含中文星期: ${r}`)
  assert.match(r, /\d{4}年\d{1,2}月\d{1,2}日/, `应含完整日期: ${r}`)
  assert.match(r, /\d{1,2}:\d{2}:\d{2}/, `应含时分秒: ${r}`)
  // 时区快照：输出应为北京时间——与本地 UTC+8 推演时刻差 ≤15min
  const now = new Date()
  const bj = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000)
  const hm = r.match(/(\d{1,2}):(\d{2})/)!
  const rMin = Number(hm[1]) * 60 + Number(hm[2])
  const bjMin = bj.getHours() * 60 + bj.getMinutes()
  const diff = Math.min(Math.abs(rMin - bjMin), 1440 - Math.abs(rMin - bjMin))
  assert.ok(diff <= 15, `输出应为北京时间（±15min）——${r} vs 北京 ${bj.toLocaleTimeString()}`)
})

test('get_current_time：参数无关（无状态——任意 args 同格式）', async () => {
  const handler = getToolHandler('get_current_time') as unknown as (args: Record<string, unknown>) => Promise<string>
  const a = await handler({ bogus: 'x' })
  const b = await handler({})
  assert.match(a, /星期/)
  assert.match(b, /星期/)
})
