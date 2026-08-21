/**
 * vdom browser — 浏览器环境接口（依赖注入——uiServe 显式接收）
 *
 * 设计（2026-12）：uiServe(router, { root, browser })——**无全局依赖**——
 * 注入 window/document 两字段为基座 + **组件消费面方法**（设计规则 §5.5——
 * 组件禁止直接访问 DOM 全局——一律经 ctx.browser 唯一入口——46 处迁移
 * 基线）。接口按组件库消费面扩展（P2 组件迁移——activeElement/byId/
 * copyText/scrollTop/storage 等）。
 *
 * 三态实现：客户端 createClientBrowser（惰性 typeof 防御）· SSR shim
 * （null/0/false/no-op——组件 SSR 安全）· 测试 testBrowser()/jsdom。
 */

/** 浏览器环境（基座 window/document + 组件消费面方法） */
export interface Browser {
  /** 浏览器窗口（location/事件/媒体查询/定时器——完整环境面） */
  window: Window
  /** 文档（元素创建/查询——渲染 DOM 面） */
  document: Document

  // ── 组件消费面（设计规则 §5.5 能力映射表——唯一入口） ──
  /** 复制文本 */
  copyText(text: string): void
  /** 下载文件（dataURL/blob） */
  downloadFile(filename: string, content: string, mime?: string): boolean
  /** 当前聚焦元素 */
  activeElement(): HTMLElement | null
  /** 按 id 查询 */
  byId(id: string): HTMLElement | null
  /** 查询元素（CSS 选择器） */
  query(sel: string): HTMLElement | null
  queryAll(sel: string): NodeListOf<Element> | null
  /** 创建元素/片段/注释/文本 */
  createElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] | null
  createElementNS(ns: string, tag: string): Element | null
  createDocumentFragment(): DocumentFragment | null
  createComment(text: string): Comment | null
  createTextNode(text: string): Text | null
  /** 事件监听（全局——组件层统一入口） */
  addEventListener(type: string, fn: (e: any) => void, options?: any): void
  removeEventListener(type: string, fn: (e: any) => void, options?: any): void
  /** 滚动 */
  scrollTo(y: number): void
  /** 当前滚动量（scrollingElement 优先——headless 漂移防护） */
  scrollTop(): number
  /** 媒体查询（matchMedia——headless 无 → null） */
  matchMedia(query: string): MediaQueryList | null
  /** 可视视口（visualViewport——键盘弹起/缩放） */
  visualViewport(): VisualViewport | null
  /** 滚动根元素 */
  scrollingElement(): Element | null
  bodyElement(): HTMLElement | null
  bodyAppend(el: Node): void
  bodyRemove(el: Node): void
  clearBody(): void
  /** 事件构造（jsdom 兼容——跨 realm 安全） */
  event(type: string, init?: any): Event
  /** 主题根元素 */
  rootElement(): HTMLElement | null
  /** 选区 */
  getSelection(): Selection | null
  selectionText(): string
  /** 存储（SSR/隐私模式安全） */
  storageGet(key: string): string | null
  storageSet(key: string, value: string): void
  /** 定时器（SSR no-op） */
  timeout(fn: () => void, ms: number): number
  /** 当前路径 */
  pathname(): string
  /** 设置 hash（锚点滚动——Anchor 用） */
  setHash(hash: string): void
  /** 视口高度 */
  viewportHeight(): number
  /** 表单恢复回调（ui-dom 兼容——Slider/Form 字段恢复） */
  onFormRestore?(fn: () => void): void
}
