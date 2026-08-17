/**
 * client.ts——客户端入口（纯 SPA 渲染：vdom3 事件流引擎）
 * createRouter(routes, root) —— 监听 location → 匹配 → 事件流渲染
 */
import { createRouter } from 'weifuwu/ui-dom'
import { routes } from './routes.tsx'

createRouter(routes, document.querySelector('#root') as HTMLElement)
