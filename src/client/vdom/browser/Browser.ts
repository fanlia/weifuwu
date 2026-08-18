/**
 * vdom browser — 浏览器环境接口（依赖注入——uiServe 显式接收）
 *
 * 设计（2026-12）：uiServe(router, { root, browser })——**无全局依赖**——
 * 测试传 testBrowser()（独立 jsdom 实例——零全局污染）；生产传
 * createClientBrowser()（browser/ 实现——后续）。
 *
 * 渲染引擎只消费本接口——document/location 为最小面（元素创建/root 查找/
 * 初始路径解析）——事件/媒体查询/存储等面随 hooks 实现扩展
 * （AGENTS §5.5 能力映射表——copyText/byId/matchMedia/IntersectionObserver...）。
 */

/** 浏览器环境（渲染引擎消费面——最小集） */
export interface Browser {
  /** 渲染 DOM 面（createElement/createTextNode/querySelector...） */
  document: Document
  /** 当前地址（初始路径解析——pathname 路由匹配） */
  location: Pick<Location, 'pathname' | 'href' | 'search' | 'hash'>
}
