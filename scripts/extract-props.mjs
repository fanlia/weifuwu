#!/usr/bin/env node
/**
 * AST-lite props 提取器——从组件源码解析 Props 接口。
 *
 * 设计（design/showcase-plan.md §7）：零新增依赖（typescript 不在 devDeps）；
 * 规整 `interface XxxProps {...}` / `type XxxProps = {...}` 格式解析；
 * 异常格式返回 null——调用方降级为"内嵌源码视图"（诚实裁剪 CS-05）。
 */
import { readFileSync } from 'node:fs'

/** 括号配对：从 openIdx（指向 '{'）找匹配的 '}' 索引（处理嵌套/字符串/泛型） */
function matchBrace(src, openIdx) {
  let depth = 0
  let inStr = null
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i]
    if (inStr) {
      if (ch === '\\') { i++; continue }
      if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** 解析一个字段行："name?: Type" 或 "name: Type"（剥离行尾注释） */
function parseFieldLine(line) {
  const m = line.match(/^\s*([A-Za-z_$][\w$]*)(\?)?\s*:\s*([^{};]+)$/)
  if (!m) return null
  let type = m[3].replace(/\/\/.*$/, '').trim()
  if (!type) return null
  return { name: m[1], optional: !!m[2], type }
}

/** 逐行解析接口体（支持无逗号换行分隔的 TS 风格；嵌套对象字段行跳过——深度跟踪） */
function parseBody(body) {
  const props = []
  let depth = 0
  let pendingComment = null // 待挂到下一字段的注释
  let inBlockComment = false // 多行注释进行中
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false
      continue
    }
    if (line.startsWith('/**')) {
      const end = line.indexOf('*/')
      if (end >= 0) {
        pendingComment = line.slice(3, end).trim() // 单行注释——下一字段行正常处理
        continue
      }
      pendingComment = line.slice(3).trim() // 多行注释开始
      inBlockComment = true
      continue
    }
    // 多行注释续行（防御：inBlockComment 已捕获；此处兜底）
    if (pendingComment !== null && line.startsWith('*') && !line.startsWith('/')) continue
    // 深度跟踪（嵌套对象/函数类型跨行）
    for (const ch of line) {
      if (ch === '{' || ch === '(' || ch === '[') depth++
      else if (ch === '}' || ch === ')' || ch === ']') depth--
    }
    if (depth > 0 || line === '}' || line === '} ') continue // 嵌套块内容/闭合行
    const f = parseFieldLine(line)
    if (!f) continue
    if (pendingComment) { f.comment = pendingComment; pendingComment = null }
    props.push(f)
  }
  return props
}

/**
 * 提取组件 Props 接口。
 * @returns {Array<{name:string, optional:boolean, type:string, comment?:string}> | null}
 */
export function extractProps(filePath) {
  let src
  try { src = readFileSync(filePath, 'utf-8') } catch { return null }

  // 找第一个 Props 接口/类型别名（interface XxxProps / type XxxProps =）
  const re = /\b(?:interface|type)\s+([A-Za-z_$][\w$]*Props)\s*(?:=\s*)?\{/g
  let m
  while ((m = re.exec(src))) {
    const openIdx = src.indexOf('{', m.index + m[0].length - 1)
    if (openIdx < 0) continue
    const closeIdx = matchBrace(src, openIdx)
    if (closeIdx < 0) continue
    const body = src.slice(openIdx + 1, closeIdx)
    const props = parseBody(body)
    if (props.length > 0) return props
  }
  return null
}
