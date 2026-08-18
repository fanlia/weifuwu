/**
 * weifuwu/vdom — 新版本 vdom 公共面（独立实现区）
 *
 * 决策（2026-12）：
 * - ui-dom 保持不变——本目录**完全独立实现**（零引用 ui-dom——不 re-export）——
 *   完全实现后一次性替换 ui-dom
 * - 对外接口只有：h/jsx、uiServe、UIRouter
 * - createRoot **不导出**——必须使用 UIRouter（路由是唯一应用入口——
 *   类比后端 Router/serve——req = location、res = VNode）
 *
 * ── 导出面（决策 2026-12——实现完成后在此导出）──
 *
 *   h / jsx / jsxs / jsxDEV
 *     JSX 运行时面——vnode 纯数据（`<div/>` 编译目标；jsx-runtime 子路径
 *     自动导入——主入口导出 h + jsx 供手写/编程式使用）
 *
 *   UIRouter
 *     应用入口——唯一创建方式：get/use/notFound（Trie 匹配——
 *     静态段 → :param → * 通配）；内部持有渲染引擎（createRoot 内化——
 *     不对外导出）
 *
 *   uiServe
 *     渲染落地——客户端收养（hydration 吸收 + navigate/链接拦截/popstate）；
 *     SSR 面（HTML 序列化 + __DATA__ 种子）由 uiServe 内部提供
 *     （uiSsr 不导出——uiServe 双端一体——同一 router 实例）
 *
 * 结构符号内化（X-S1 S9.4）：createPortal/Fragment/Portal 不导出——
 * createPortal 是 usePopup 内部机制；数组 = 隐式 Fragment；
 * `<></>` 经 jsx-runtime 自动导入。
 *
 * ── 实施顺序（独立实现）──
 *   1. vnode + h/jsx（纯数据面——零依赖）
 *   2. router（UIRouter——Trie 匹配）
 *   3. serve（uiServe——root 创建 + hydration + 导航）
 *   4. index.ts 导出面接通——契约验收（vdom-x 引擎入口切换）
 */
