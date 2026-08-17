/**
 * multi 独立入口——复制本目录即可运行：
 *   cd examples/apps/multi && node server.ts → http://localhost:3303
 */
import { createMultiApp, pathFromHash } from './app.tsx'

const sub = createMultiApp(document.querySelector('#root') as HTMLElement)
window.addEventListener('hashchange', () => sub.navigate(pathFromHash()))
