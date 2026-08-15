/**
 * 模拟数据收集汇总（新架构 2026-12）——读取各角色部门工作目录的 survey-result.json
 *
 * 三层模型：每角色一个部门，结果写入 {AGENT_WORKSPACE_ROOT}/{deptId}/survey-result.json
 * （AI 的交付物——执行验证标记保证真实落盘）。
 *
 * 用法：node --env-file=.env scripts/survey-summary.mjs
 */

import { postgres } from 'weifuwu'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROLES = ['财务小王', '市场小李', '产品老张', '客服小陈', '研发大刘', '人事小周', '销售阿强', '运营小赵', '行政陈姐', '实习生阿泽']

async function main() {
  const pg = postgres()
  const { sql } = pg

  // 角色部门 id（部门名 = 角色名）
  const depts = await sql`
    SELECT id, name FROM departments
    WHERE app_id = '00000000-0000-0000-0000-000000000001' AND name = ANY(string_to_array(${ROLES.join(',')}, ',')::text[]) AND is_dm = FALSE
  `
  const workspaceRoot = resolve(process.env.AGENT_WORKSPACE_ROOT ?? join(process.cwd(), 'data', 'workspaces'))
  const records = []
  for (const d of depts ?? []) {
    const file = join(workspaceRoot, String(d.id), 'survey-result.json')
    if (existsSync(file)) {
      try {
        const r = JSON.parse(readFileSync(file, 'utf-8'))
        records.push({ name: String(d.name), ...r })
      } catch { /* 解析失败跳过 */ }
    }
  }

  console.log(`=== 问卷填写汇总（${records.length}/${ROLES.length}）===\n`)
  if (records.length === 0) {
    console.log('暂无结果——先跑 seed-survey-agents.mjs + survey-launch.mjs')
    await pg.close()
    process.exit(0)
  }

  for (const r of records) {
    console.log(`- ${r.name}（${r.role ?? '?'}）${r.submitted ? '✅ 已提交' : '❌ 未提交'}${r.verified ? ' · 已验证' : ''}`)
    const answers = r.answers ?? {}
    for (const [q, a] of Object.entries(answers)) {
      console.log(`    ${q}: ${JSON.stringify(a)}`)
    }
  }

  // 统计：评分分布/焦点词频（问卷结果结构自适应）
  console.log('\n=== 统计 ===')
  const ratingDist = {}
  const focusCount = {}
  for (const r of records) {
    const answers = r.answers ?? {}
    for (const [q, a] of Object.entries(answers)) {
      if (typeof a === 'number' && a >= 1 && a <= 10) {
        ratingDist[q] = ratingDist[q] ?? {}
        ratingDist[q][a] = (ratingDist[q][a] ?? 0) + 1
      }
      if (typeof a === 'string') {
        for (const m of String(a).match(/[\u4e00-\u9fa5]{2,}/g) ?? []) {
          if (['反馈', '填写', '问卷', '提交', '满意', '工作', '可以', '没有', '需要', '问题', '服务', '产品', '系统', '希望', '比较'].includes(m)) continue
          focusCount[m] = (focusCount[m] ?? 0) + 1
        }
      }
    }
  }
  for (const [q, dist] of Object.entries(ratingDist)) {
    console.log(`${q} 分布：${JSON.stringify(dist)}`)
  }
  const topFocus = Object.entries(focusCount).sort((a, b) => b[1] - a[1]).slice(0, 10)
  if (topFocus.length > 0) console.log(`高频词：${topFocus.map(([w, n]) => `${w}(${n})`).join(' ')}`)
  console.log(`\n完成率：${records.length}/${ROLES.length}`)
  await pg.close()
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
