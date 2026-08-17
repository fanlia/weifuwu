/**
 * auth 独立入口——复制本目录即可运行：
 *   cd examples/apps/auth && node server.ts → http://localhost:3301
 */
import { createAuthApp, pathFromHash } from './app.tsx'

const sub = createAuthApp(document.querySelector('#root') as HTMLElement)
window.addEventListener('hashchange', () => sub.navigate(pathFromHash()))
