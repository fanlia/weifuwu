#!/usr/bin/env node
/**
 * 私有化升级脚本（R7 交付链）——备份 → 启动 → 健康校验 → 失败提示回滚
 *
 * 用法（在部署机执行）：
 *   node scripts/upgrade.mjs --backup-dir /data/backups
 *
 * 流程：
 *   1. pg_dump 备份当前库（保留旧版本可回滚）
 *   2. 重启服务（docker compose up -d --build 或 pm2 restart）
 *   3. 轮询 /healthz 直至健康（超时判定失败）
 *   4. 成功 → 打印升级完成；失败 → 打印回滚指引（恢复备份 + 旧镜像）
 *
 * 依赖：环境变量 DATABASE_URL、PUBLIC_BASE_URL（或 HEALTHZ_URL）
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const args = process.argv.slice(2)
const backupDir = (args.find((a) => a.startsWith('--backup-dir=')) ?? '').split('=')[1] ?? '/data/backups'
const healthzUrl = process.env.HEALTHZ_URL ?? `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000'}/healthz`
const maxWaitMs = Number(process.env.HEALTHZ_TIMEOUT_MS ?? 120_000)

function run(cmd) {
  console.log(`$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: root, env: process.env })
}

const dbUrl = process.env.DATABASE_URL ?? ''
function backup() {
  if (!dbUrl) {
    console.warn('  ⚠ DATABASE_URL 未设置——跳过数据库备份（请在外部备份）')
    return ''
  }
  const m = dbUrl.match(/postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/)
  if (!m) {
    console.warn('  ⚠ DATABASE_URL 格式无法解析——跳过备份')
    return ''
  }
  const [, user, pass, host, port, db] = m
  mkdirSync(backupDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const file = join(backupDir, `agent-platform-${ts}.sql`)
  console.log(`  … 备份数据库 → ${file}`)
  run(`PGPASSWORD=${pass} pg_dump -h ${host} -p ${port} -U ${user} -d ${db} -Fc -f ${file}`)
  return file
}

async function waitHealthy() {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthzUrl)
      if (res.ok) {
        const body = await res.json().catch(() => ({}))
        if (body.pg !== false) return body
      }
    } catch { /* 服务未起——继续轮询 */ }
    await new Promise((r) => setTimeout(r, 3000))
  }
  return null
}

async function main() {
  console.log('[upgrade] 开始升级（R7 交付链）\n')

  // 1. 备份
  const backupFile = backup()
  console.log()

  // 2. 重启（自动探测部署方式）
  console.log('  … 重启服务...')
  const isDocker = existsSync(join(root, 'docker-compose.yml'))
  try {
    if (isDocker) run('docker compose up -d --build')
    else if (existsSync('/proc/1/cmdline') && execSync('cat /proc/1/cmdline').toString().includes('pm2')) run('pm2 restart agent-platform')
    else {
      console.warn('  ⚠ 未识别部署方式——请手动重启服务后继续')
      console.warn('    docker compose up -d postgres redis（根目录——仅依赖） 或  pm2 restart agent-platform 或  node server.ts')
    }
  } catch (e) {
    console.error('  ✗ 重启失败:', e.message)
    process.exit(1)
  }

  // 3. 健康校验
  console.log(`\n  … 等待服务健康（${healthzUrl}，超时 ${maxWaitMs / 1000}s）...`)
  const health = await waitHealthy()
  if (health) {
    console.log(`  ✓ 服务健康：pg=${health.pg} redis=${health.redis ?? '-'} sandbox=${health.sandbox ? 'ok' : '-'}`)
    console.log('\n  ✅ 升级完成')
    if (backupFile) console.log(`  备份文件：${backupFile}（确认稳定后可删除）`)
  } else {
    console.error(`\n  ✗ 服务 ${maxWaitMs / 1000}s 内未健康——升级可能失败`)
    console.error('  回滚指引：')
    if (backupFile) console.error(`    1. 恢复备份：PGPASSWORD=... pg_restore -d <db> ${backupFile}`)
    console.error('    2. 回退镜像/代码后重启：docker compose up -d（旧版本）')
    process.exit(1)
  }
}

main().catch((e) => { console.error('[upgrade] 失败:', e); process.exit(1) })
