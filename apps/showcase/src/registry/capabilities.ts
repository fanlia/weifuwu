/**
 * 框架能力表——12 项（showcase 平台自证：selfUsedIn = 平台自身真实使用点）。
 * 每项 = 概念 + 框架源码位置 + 平台自证 + 活体演示页。
 */
import type { CapabilityEntry } from './types.ts'

export const capabilities: CapabilityEntry[] = [
  { id: 'two-phase', name: '两阶段异步组件', desc: 'mount（工厂，只一次）+ render（每次渲染）——工厂可 await，renderFn 强制异步', srcFile: 'src/client/ui-dom/vdom3/build.ts', selfUsedIn: ['showcase 所有页面'], discipline: 'AGENTS.md §3.1' },
  { id: 'render-only', name: 'render-only 状态', desc: '只有 ctx.render() 一种触发——状态是普通对象（let/createStore），无 $ Proxy 无隐式触发', srcFile: 'src/client/ui-dom/vdom3/router.ts', selfUsedIn: ['搜索框', '主题切换', '应用页内嵌 router'], discipline: 'AGENTS.md §4' },
  { id: 'store', name: 'createStore + useExternal', desc: '共享状态原语：普通对象 + subscribe/set/update/notify——跨组件通道', srcFile: 'src/client/ui-dom/store.ts', selfUsedIn: ['主题/语言偏好跨页同步'], discipline: 'AGENTS.md §4.5' },
  { id: 'router', name: 'UIRouter 路由', desc: 'pathname 路由 + :param + layout 包裹复用 + 隔离模式（页面内嵌子路由）', srcFile: 'src/client/ui-dom/vdom3/router.ts', selfUsedIn: ['showcase 八域导航', 'app demo 嵌入'], discipline: 'AGENTS.md §3.5' },
  { id: 'data', name: 'ctx.data 数据管道', desc: 'get/set/has + 并发合并——SSR/hydration/SPA 三场景自动适配', srcFile: 'src/client/ui-dom/', selfUsedIn: ['（P2：示例页）'], discipline: 'AGENTS.md §3.4' },
  { id: 'events', name: '事件流（stream）', desc: 'DOM↔事件流全链路因果可回放——__wf_tail 实时观测', srcFile: 'src/client/ui-dom/vdom3/events.ts', selfUsedIn: ['__wf_tail 观测面板'], discipline: 'AGENTS.md §6' },
  { id: 'app-node', name: '多应用（registerApp/hApp）', desc: '注册表 + 独立状态 + app:* 边界事件——应用编排', srcFile: 'src/client/ui-dom/vdom3/registry.ts', selfUsedIn: ['multi 应用模板'], discipline: 'AGENTS.md §3.3' },
  { id: 'hooks', name: 'hooks 族', desc: 'useMedia/useInView/useChat/usePopup…——事件驱动重渲染', srcFile: 'src/client/ui-dom/vdom3/', selfUsedIn: ['懒渲染', '弹层'], discipline: 'AGENTS.md §4.2' },
  { id: 'popup', name: 'usePopup 弹窗基座', desc: 'portal + 定位 + 外部点击/Escape + 会话级模态——新弹层一律复用', srcFile: 'src/client/ui-dom/popup.ts', selfUsedIn: ['Drawer/代码抽屉/下拉'], discipline: 'AGENTS.md §5.4' },
  { id: 'self-id', name: 'selfId 精准刷新', desc: '自定义组件 ID——任意位置 render([id]) 跨组件精准定位', srcFile: 'src/client/ui-dom/vdom3/', selfUsedIn: ['（示例页）'], discipline: 'AGENTS.md §4.3' },
  { id: 'i18n', name: 'i18n 中间件', desc: 'locale/setLocale/t + 页面级重渲染（demo 专用 AppMiddleware）', srcFile: 'src/client/ui-dom/i18n.ts', selfUsedIn: ['中英切换'], discipline: 'AGENTS.md §4' },
  { id: 'theme', name: '主题系统', desc: '--wf-* token 双层（亮/暗/自动）+ ThemeSwitch + localStorage 持久化', srcFile: 'src/layout/_tokens.css', selfUsedIn: ['ThemeSwitch 全站'], discipline: 'AGENTS.md §8' },
]
