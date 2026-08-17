/**
 * todo 应用模板独立入口——复制本目录即可运行：
 *   cd examples/apps/todo && node server.ts → http://localhost:3300
 * hash 桥接：hashchange → 内部路由（独立运行可深链 #/new）
 */
import { createTodoApp, pathFromHash } from './app.tsx'

const sub = createTodoApp(document.querySelector('#root') as HTMLElement)
window.addEventListener('hashchange', () => sub.navigate(pathFromHash()))
