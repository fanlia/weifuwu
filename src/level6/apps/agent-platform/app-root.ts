/**
 * 应用根锚点（dev 直跑 与 dist bundle **同语义**——0.95.0 安装包实证）
 *
 * esbuild 把整个 server 节点打进 dist/level6/apps/agent-platform/server.js 后，
 * 嵌套模块里的 `dirname(import.meta.url)` 变成 **bundle 所在目录**（应用根），
 * 与源码目录语义分歧（原 src/bootstrap/... 相对路径全部失真——SSR 入口 /
 * public html / skills / sandbox-agent / 框架 dist 读取失败）。
 *
 * 本文件位于应用根：dev 运行时 dirname = 应用根；bundle 后 import.meta.url 指向
 * server.js（同样位于应用根）——两态一致。所有应用相对路径在此之上推导。
 */
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const APP_ROOT = dirname(fileURLToPath(import.meta.url))
