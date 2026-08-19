/**
 * vdom browser — createClientBrowser（生产环境浏览器工厂）
 *
 * 设计：Browser 接口只注入 window/document——**生产便捷工厂**（明确取
 * 全局——浏览器环境调用）；**SSR 安全**（无全局 window → null——服务端
 * 渲染不崩）。测试用 testBrowser()（独立 jsdom——零全局污染）。
 */

import type { Browser } from './Browser.ts'

/** 生产浏览器环境（全局 window/document——SSR 安全：无全局 → null） */
export function createClientBrowser(): Browser | null {
  if (typeof window === 'undefined') return null // SSR
  return { window: window as Window, document }
}
