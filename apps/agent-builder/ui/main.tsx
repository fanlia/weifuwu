/**
 * agent-builder 入口——Agent 世界模拟平台（纯框架消费）
 * UIRouter + uiServe + components（AppShell/RelationGraph/Card/Form...）
 * Phase 1：世界 CRUD（列表/新建/详情——角色/关系/事件管理）
 */
import { UIRouter, uiServe, h, api } from 'weifuwu/vdom'
import type { RenderCtx } from 'weifuwu/vdom'
import { Worlds, NewWorld } from './pages/worlds'
import { WorldDetail } from './pages/world-detail'

// 中间件装配（ctx.api——自动 JSON + 错误消息）
const apiClient = api({ baseUrl: '' })

const router = new UIRouter()
router.get('/', (req, ctx) => (ctx as RenderCtx).stream(h(Worlds, {})))
router.get('/worlds/new', (req, ctx) => (ctx as RenderCtx).stream(h(NewWorld, {})))
router.get('/worlds/:id', (req, ctx) => (ctx as RenderCtx).stream(h(WorldDetail, { id: ctx.params?.id ?? '' })))

uiServe(router, { root: '#root', api: apiClient })
