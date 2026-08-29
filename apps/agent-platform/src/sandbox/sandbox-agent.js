#!/usr/bin/env node
/**
 * sandbox-agent——沙盒容器 PID 1 常驻入口（SANDBOX-AGENT-PLAN Wave 1——2026-08）
 *
 * 根因（实测定案）：容器 PID 1 = 裸 sleep/工具进程——**无显式信号 handler——
 * 内核忽略 PID 1 的默认信号动作（SIGTERM 被丢弃）**——docker stop 等 10s 宽限
 * 后 SIGKILL（实测 10.1s 稳定——kill -TERM 直达 PID1 不退出——实验证据）。
 *
 * 本入口：
 * - **PID 1 = agent**（镜像 CMD 改为 node sandbox-agent.js——不是裸 sleep）
 * - **显式信号处理**：SIGTERM/SIGINT → 杀活跃子进程树 → 优雅退出（秒级——
 *   node 显式 handler 实验：SIGTERM 秒退 ✅）
 * - **能力声明**：/capabilities 从 /opt/sandbox/capabilities.json 读（镜像层
 *   声明——AI/框架可见）
 * - **健康检查**：/healthz（200 = 就绪——框架 probe 可升级）
 *
 * 协议（兼容优先）：
 * - **stdin 协议保留**（主力——docker exec 路径不变——tool-runner 语义零破坏）
 * - HTTP 面为增强（健康/能力只读——不强制改 exec 链）
 */

const http = require('node:http')
const { spawn } = require('node:child_process')
const { readFileSync } = require('node:fs')

const PORT = Number(process.env.AGENT_PORT || 5711)
const CAPS_PATH = '/opt/sandbox/capabilities.json'

// ── 信号处理（根治 stop 10s——PID1 显式 handler）──────
let activeChildren = new Set()
let shuttingDown = false

function runToolRunner(args, stdinData) {
  return new Promise((resolve) => {
    const child = spawn('node', ['/opt/sandbox/tool-runner.js', ...args], {
      cwd: '/ws',
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    activeChildren.add(child)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('close', (code) => {
      activeChildren.delete(child)
      resolve({ code, stdout, stderr })
    })
    if (stdinData != null) child.stdin.write(stdinData)
    child.stdin.end()
  })
}

function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[sandbox-agent] 收到 ${signal}——优雅关闭（杀 ${activeChildren.size} 活跃子进程）`)
  // 杀活跃子进程树（同 process group——tool-runner 的 bash 子进程）
  for (const c of activeChildren) {
    try { process.kill(-c.pid, 'SIGKILL') } catch { try { c.kill('SIGKILL') } catch { /* 已退 */ } }
  }
  // 短留排空（stdin/日志 flush）——然后退出（出口 code 0——docker 视为干净）
  setTimeout(() => process.exit(0), 100)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// ── 能力声明（镜像层——AI/框架可见）──────
function capabilities() {
  try {
    return JSON.parse(readFileSync(CAPS_PATH, 'utf-8'))
  } catch {
    return { image: 'generic', tools: ['bash', 'read', 'write', 'edit', 'grep', 'list_files'] }
  }
}

// ── HTTP 增强面（健康/能力/状态——只读）──────
const server = http.createServer((req, res) => {
  const url = req.url || ''
  if (url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, pid: process.pid }))
    return
  }
  if (url === '/capabilities') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(capabilities()))
    return
  }
  if (url === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      pid: process.pid,
      activeChildren: activeChildren.size,
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      uptimeSec: Math.round(process.uptime()),
    }))
    return
  }
  res.writeHead(404)
  res.end()
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[sandbox-agent] listening on 127.0.0.1:${PORT}（健康/能力/状态面——工具经 stdin 协议）`)
})

// ── stdin 工具协议（主力——docker exec 路径——与 tool-runner 语义一致）──────
function stdinHandler() {
  let input = ''
  process.stdin.setEncoding('utf-8')
  process.stdin.on('data', (chunk) => { input += chunk })
  process.stdin.on('end', async () => {
    let req
    try {
      req = JSON.parse(input)
    } catch {
      req = { tool: 'bash', args: { command: input } } // 非 JSON（bash 管道）
    }
    try {
      const output = await runToolRunner([], JSON.stringify(req))
      process.stdout.write(output.stdout || JSON.stringify({ ok: true, output: '' }))
    } catch (e) {
      process.stdout.write(JSON.stringify({ ok: false, error: String(e) }))
    }
  })
}
stdinHandler()

// 保持事件循环（HTTP 服务 + stdin 监听——PID1 常驻）
