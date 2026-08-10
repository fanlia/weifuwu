/**
 * ui-router-demo 客户端入口 — uiServe 挂载（路由定义在 router.ts，两端共享）
 */

import { uiServe } from '../../../src/ui-dom/index.ts'
import { app } from './router.ts'

uiServe(app, { root: '#root', hydrate: !!(window as any).__DATA__ })
