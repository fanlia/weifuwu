/**
 * vdom browser — 浏览器环境接口（依赖注入——uiServe 显式接收）
 *
 * 设计（2026-12）：uiServe(router, { root, browser })——**无全局依赖**——
 * 只注入 window/document 两个字段：
 * - window：全量浏览器窗口（window.location 取路径——addEventListener/
 *   matchMedia/requestAnimationFrame 等 hooks 用——window 即完整环境）
 * - document：文档（createElement/querySelector——渲染引擎消费面）
 *
 * 测试传 testBrowser()（独立 jsdom 实例——window/document 齐备——零全局
 * 污染）；生产传真实浏览器环境（window/document——browser/ 后续封装）。
 */

/** 浏览器环境（渲染引擎消费面——window/document 两字段） */
export interface Browser {
  /** 浏览器窗口（location/事件/媒体查询/定时器——完整环境面） */
  window: Window
  /** 文档（元素创建/查询——渲染 DOM 面） */
  document: Document
}
