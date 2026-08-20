/**
 * 首页接管闪白复现测试——SPA 接管 SSR 内容后的首帧可见性
 *
 * 复现链：SSR 首帧（可见 hero）→ UIRouter/uiServe 接管 → root 内容替换
 * 闪白根因候选：新树首帧带透明起始动画（wf-stream-in opacity 0）→
 * 替换瞬间旧内容消失、新内容透明——白屏直到动画完成。
 * 断言：接管后的首页新树首帧必须立即可见（无透明起始）。
 *
 * 2026-12 迁移：真实浏览器架构（jsdom 删除）——DOM 接管时序语义已由
 * serve.test「SSR 接管」测试覆盖（真实浏览器）——本文件保留**静态源码
 * 断言**（hero 不得含 wf-stream-in）——vitest node project（fs 访问）。
 */
import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

test('首页 hero 首帧不得带透明起始动画类（wf-stream-in——接管闪白根因）', () => {
  // Home.tsx 源码断言：hero 区不得有 wf-stream-in（动画 opacity 0 起始 → 替换后白屏）
  const src = readFileSync(join(root, 'apps/showcase/src/pages/home.tsx'), 'utf-8')
  // hero 区 = 从文件头到「我要做什么」（需求区）——含 hero 全部元素
  const heroSection = src.slice(0, src.indexOf('我要做什么'))
  expect(heroSection.includes('wf-stream-in'), `hero 含 wf-stream-in（透明起始动画）→ 接管闪白\n${heroSection.slice(0, 200)}`).toBe(false)
})
