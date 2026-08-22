/**
 * agent-builder 入口——Agent 世界模拟平台（纯框架消费）
 * UIRouter + uiServe + components（AppShell/RelationGraph/Card/Form...）
 * Phase 1：世界 CRUD（列表/新建/详情——角色/关系/事件管理）
 */
import { UIRouter, uiServe, h, api, ws } from 'weifuwu/vdom'
import type { RenderCtx } from 'weifuwu/vdom'
import { Worlds, NewWorld } from './pages/worlds'
import { WorldDetail } from './pages/world-detail'
import { SharedWorld } from './pages/shared'

// 中间件装配（ctx.api——自动 JSON + 错误消息；ctx.ws——世界实时通道）
const apiClient = api({ baseUrl: '' })
const wsClient = ws({ url: '/worlds/' })

const router = new UIRouter()
router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Worlds, {})))
router.get('/worlds/new', (req, ctx) => (ctx as RenderCtx).stream(h(NewWorld, {})))
router.get('/worlds/:id', (req, ctx) => (ctx as RenderCtx).stream(h(WorldDetail, { id: ctx.params?.id ?? '' })))
router.get('/shared/:token', (req, ctx) => (ctx as RenderCtx).stream(h(SharedWorld, { token: ctx.params?.token ?? '' })))

uiServe(router, { root: '#root', api: apiClient, ws: wsClient })
