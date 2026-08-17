/**
 * admin 独立入口——复制本目录即可运行：
 *   cd examples/apps/admin && node server.ts → http://localhost:3302
 */
import { createAdminApp, pathFromHash } from './app.tsx'

const sub = createAdminApp(document.querySelector('#root') as HTMLElement)
window.addEventListener('hashchange', () => sub.navigate(pathFromHash()))
