#!/usr/bin/env node
/**
 * 容器内统一工具执行器（挂载到沙盒容器 /opt/sandbox/tool-runner.js）
 *
 * 协议：stdin 收 JSON { tool, args } → stdout 输出 JSON { ok, output } 或 { ok:false, error }
 * 工作目录 = /ws（宿主 workspace 卷挂载点）——所有文件操作限制在 /ws 内（路径穿越防护）
 * 单一实现：read/write/edit/grep/list_files/bash 全部经此入口（安全边界 = 容器）
 */
'use strict'

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')

const WS = '/ws'
const MAX_FILE_READ = 50 * 1024 // 文件工具 50KB
const MAX_BASH_OUTPUT = 100 * 1024 // bash 100KB
const BASH_TIMEOUT_MS = 30 * 1000 // 30s

// ── 路径穿越防护（容器内防线——即使宿主有 bug 也逃不出卷） ──
function safePath(rel) {
  const relStr = String(rel ?? '')
  const resolved = path.resolve(WS, relStr || '.')
  if (resolved !== WS && !resolved.startsWith(WS + path.sep)) {
    throw new Error(`路径 "${relStr}" 超出了工作空间范围`)
  }
  return resolved
}

function truncate(s, max) {
  if (s.length <= max) return s
  return s.slice(0, max) + `\n... (输出过长，截断至 ${max} 字符，总长 ${s.length})`
}

// ── 工具分发 ──
async function dispatch(tool, args) {
  switch (tool) {
    case 'read': {
      const rel = String(args.path ?? '')
      if (!rel) return '请提供文件路径'
      let abs
      try { abs = safePath(rel) } catch (e) { return `读取失败: ${e.message}` }
      try {
        const content = await fsp.readFile(abs, 'utf-8')
        if (content.length === 0) return '(空文件)'
        return truncate(content, MAX_FILE_READ)
      } catch (e) { return `读取失败: ${e.message}` }
    }
    case 'write': {
      const rel = String(args.path ?? '')
      const content = String(args.content ?? '')
      if (!rel) return '请提供文件路径'
      let abs
      try { abs = safePath(rel) } catch (e) { return `写入失败: ${e.message}` }
      try {
        await fsp.mkdir(path.dirname(abs), { recursive: true })
        await fsp.writeFile(abs, content, 'utf-8')
        return `已写入 ${rel} (${content.length} 字符)`
      } catch (e) { return `写入失败: ${e.message}` }
    }
    case 'edit': {
      const rel = String(args.path ?? '')
      const oldText = String(args.oldText ?? '')
      const newText = String(args.newText ?? '')
      if (!rel || !oldText) return '请提供文件路径和 oldText'
      let abs
      try { abs = safePath(rel) } catch (e) { return `编辑失败: ${e.message}` }
      try {
        const content = await fsp.readFile(abs, 'utf-8')
        const idx = content.indexOf(oldText)
        if (idx === -1) return '未找到匹配的 oldText，请精确匹配'
        const newContent = content.replace(oldText, newText)
        await fsp.writeFile(abs, newContent, 'utf-8')
        return `已编辑 ${rel} (替换了 ${oldText.length} → ${newText.length} 字符)`
      } catch (e) { return `编辑失败: ${e.message}` }
    }
    case 'grep': {
      const pattern = String(args.pattern ?? '')
      const rel = args.path ? String(args.path) : '.'
      if (!pattern) return '请提供搜索模式'
      let abs
      try { abs = safePath(rel) } catch (e) { return `搜索失败: ${e.message}` }
      try {
        const results = []
        async function searchFile(fp, relToWs) {
          try {
            const content = await fsp.readFile(fp, 'utf-8')
            const lines = content.split('\n')
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(pattern)) results.push({ file: relToWs, line: i + 1, text: lines[i].trim().slice(0, 200) })
            }
          } catch { /* 跳过 */ }
        }
        async function searchDir(dp, relToWs) {
          try {
            const entries = await fsp.readdir(dp, { withFileTypes: true })
            for (const entry of entries) {
              const full = path.join(dp, entry.name)
              const rel2 = path.join(relToWs, entry.name)
              if (entry.isDirectory()) {
                if (!entry.name.startsWith('.') && entry.name !== 'node_modules') await searchDir(full, rel2)
              } else if (entry.isFile()) {
                await searchFile(full, rel2)
              }
            }
          } catch { /* 跳过 */ }
        }
        const st = await fsp.stat(abs)
        if (st.isDirectory()) await searchDir(abs, rel === '.' ? '' : rel)
        else await searchFile(abs, rel)
        if (results.length === 0) return '未找到匹配'
        const top10 = results.slice(0, 10)
        let output = top10.map(r => `${r.file}:${r.line} | ${r.text}`).join('\n')
        if (results.length > 10) output += `\n... 还有 ${results.length - 10} 处匹配`
        return output
      } catch (e) { return `搜索失败: ${e.message}` }
    }
    case 'list_files': {
      const rel = args.path ? String(args.path) : '.'
      let abs
      try { abs = safePath(rel) } catch (e) { return `列出目录失败: ${e.message}` }
      try {
        const entries = await fsp.readdir(abs, { withFileTypes: true })
        const items = []
        for (const entry of entries) {
          const full = path.join(abs, entry.name)
          if (entry.isDirectory()) {
            items.push(`📁 ${entry.name}/`)
          } else {
            try {
              const st = await fsp.stat(full)
              const sizeStr = st.size > 1024 ? `${(st.size / 1024).toFixed(1)}KB` : `${st.size}B`
              items.push(`📄 ${entry.name} (${sizeStr})`)
            } catch { items.push(`📄 ${entry.name}`) }
          }
        }
        items.sort()
        if (items.length === 0) return '(空目录)'
        return items.join('\n')
      } catch (e) { return `列出目录失败: ${e.message}` }
    }
    case 'bash': {
      const command = String(args.command ?? '')
      if (!command) return '请提供命令'
      const desc = String(args.description ?? '')
      // 进程组超时（P0-3 根治：外层 timeout 只杀 node——bash 的 sh+子进程会成孤儿继续跑）：
      //   spawn detached = 新进程组 → kill(-pid) 杀整个组（sh + 全部后代）——不留孤儿
      // 内部超时 = 外层（docker exec -e 传入）− 2s（至少 1s 缓冲——必须严格小于外层，
      // 否则与外层 timeout 同时触发：race 下外层先杀 node，timer 无机会执行，进程组残留）
      const outerSecs = parseInt(process.env.SANDBOX_EXEC_TIMEOUT_SECS || '', 10)
      const bashTimeoutMs = (outerSecs > 0 ? Math.max(1, outerSecs - 2) : Math.floor(BASH_TIMEOUT_MS / 1000)) * 1000
      const result = await new Promise((resolve) => {
        const child = spawn(command, {
          cwd: WS,
          shell: true,
          detached: true,
          env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', HOME: '/home/node', LANG: 'C.UTF-8' },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        let timedOut = false
        const timer = setTimeout(() => {
          timedOut = true
          try { process.kill(-child.pid, 'SIGKILL') } catch { /* 已退出 */ }
        }, bashTimeoutMs)
        child.stdout.on('data', (d) => { stdout += d })
        child.stderr.on('data', (d) => { stderr += d })
        child.on('error', () => {
          clearTimeout(timer)
          resolve(`命令执行失败: ${stderr || 'spawn 失败'}`)
        })
        child.on('close', (code) => {
          clearTimeout(timer)
          if (timedOut) {
            // 超时 = 工具失败（抛错 → {ok:false}——AI 可感知的重试语义）
            resolve({ __timeout: `命令执行超时（${Math.floor(bashTimeoutMs / 1000)}s）——沙盒已终止该命令` })
            return
          }
          const out = (stdout ?? '').trim()
          const errOut = (stderr ?? '').trim()
          let result = ''
          if (out) result += truncate(out, MAX_BASH_OUTPUT)
          if (errOut) result += result ? `\n\n--- stderr ---\n${errOut}` : errOut
          if (code !== 0) {
            result = (result ? result + '\n\n' : '') + `命令执行失败: ${errOut || `exit ${code}`}`
          }
          // 网络隔离提示（诚实裁剪前置——防 AI 反复重试 npm/curl）
          if (!result) result = '命令执行成功（无输出）'
          if (/(getaddrinfo|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|curl:|npm ERR)/i.test(result)) {
            result += '\n\n（提示：沙盒默认无网络（--network none）——网络类命令会失败；如需网络请管理员在 Agent 配置开启 allow_network）'
          }
          resolve(result)
        })
      })
      if (result && typeof result === 'object' && result.__timeout) {
        throw new Error(result.__timeout)
      }
      return result
    }
    default:
      return `未知工具: ${tool}`
  }
}

// ── 入口：stdin JSON → stdout JSON ──
async function main() {
  let input = ''
  process.stdin.setEncoding('utf-8')
  for await (const chunk of process.stdin) input += chunk
  let req
  try {
    req = JSON.parse(input)
  } catch {
    req = { tool: 'bash', args: { command: input } } // 非 JSON（bash 直接管道）→ 按命令执行
  }
  try {
    const output = await dispatch(String(req.tool ?? ''), req.args ?? {})
    process.stdout.write(JSON.stringify({ ok: true, output }))
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }))
  }
  // 强制退出（bash 分支 detached child 的 stdio 引用可能挂住事件循环——
  // 不退出则 docker exec 一直等，直到外层 timeout 杀 node）
  process.exit(0)
}

main()
