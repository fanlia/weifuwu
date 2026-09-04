/**
 * weifuwu/appAuth — 业务侧认证中间件（分离模式：_builtin 控制平面签发 token →
 * 业务应用独立进程解析——零网络验签·ctx 注入与 userSystem 同语义）
 *
 * 与 userSystem 的分工（路由命名空间定案）：
 *   userSystem = _builtin 侧（控制平面：建库/成员/签发/全量路由）
 *   appAuth    = 业务应用侧（薄：验签解析 → ctx.session/ctx.user/ctx.appId/ctx.builtin）
 *
 * 运行时注入面（类型由应用层标注——平台模式 AppCtx 自包含接口）：
 *   ctx.user    { id, email?, name? } | null   （token 包内——零查库）
 *   ctx.session { userId, appId, role } | null  （身份三元组——主面）
 *   ctx.appId   string                          （便捷面）
 *   ctx.auth    { requireAuth(), userId, appId, role }（薄方法面）
 *   ctx.builtin { get/post }                    （机器客户端——appId+appKey 自动带）
 *
 * 注：
 *   - token 由 _builtin 签发（HMAC-SHA256·共享 secret）——验签零网络
 *   - 角色变更/停用即时性：TTL 后生效（诚实边界——需即时配 verifyToken 在线校验）
 *   - ctx.user 无查库——业务需要更多面用 ctx.sql 自查（共享 DB 模式）
 */
import type { Middleware, Context, User } from '../types.ts'
import { verifyToken } from './token.ts'
import { HttpError } from '../types.ts'
/**
 * AuthInterface 公共面（两实现同构视图）：
 *   本地 = userSystem().asAppAuth()（查库——角色/账号即时）
 *   远程 = appAuth()（token 验签快照——TTL 边界）
 * 业务代码只见 AuthPort（薄面字段——两实现都真）——方法面（AuthApi）为
 * 控制平面专属（本地超集——远程不存在——分离部署时业务侧不用） */
/** 当前会话（token 解出的应用态——{ userId, appId, role }·平台账号 token = null） */
export interface Session {
  userId: string
  appId: string
  role: string
}

export interface AuthPort {
  /** 未登录抛 HttpError(401)；返回当前会话三元组 */
  requireAuth(): Session
  readonly userId: string | undefined
  readonly appId: string | undefined
  readonly role: string | undefined
}

/** 中间件注入面（本地/远程同构） */
export interface AuthInjected extends Context {
  /** 当前用户（token 包内/查库——未登录 = null） */
  user: User | null
  /** 身份三元组（主面） */
  session: Session | null
  /** 便捷面（token 应用态） */
  appId?: string
  /** 公共薄面（方法面=控制平面专属——业务代码勿用） */
  auth: AuthPort
  /** 机器客户端（仅远程实现 appAuth·builtin 配置时） */
  builtin?: BuiltinClient
}

export interface BuiltinClient {
  get<T = unknown>(path: string): Promise<T>
  post<T = unknown>(path: string, body?: unknown): Promise<T>
}

export interface AppAuthOptions {
  /** HMAC 共享密钥（与 _builtin 签发面一致） */
  secret: string
  /** 机器通信（可选——不配则无 ctx.builtin） */
  builtin?: {
    /** _builtin 控制平面 baseUrl（如 http://localhost:3000） */
    baseUrl: string
    /** 本应用 id（X-Wf-App-Id） */
    appId: string
    /** 本应用 appKey（X-Wf-App-Key） */
    appKey: string
  }
  /** 在线校验（可选——每次请求回 _builtin 强制校验 token——默认关=纯验签零网络） */
  verifyToken?: (token: string) => Promise<boolean>
}

/** 业务侧认证中间件工厂（分离模式——解析 _builtin 签发的 token——远程实现） */
export function appAuth(options: AppAuthOptions): Middleware<Context, AuthInjected> {
  const mw = async (req: Request, ctx: Context, next: any): Promise<Response> => {
    let session: Session | null = null
    let rawToken: string | null = null
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) rawToken = authHeader.slice(7)
    if (!rawToken) {
      const q = new URL(req.url ?? '', 'http://localhost').searchParams.get('token')
      if (q) rawToken = q
    }
    if (rawToken) {
      const payload = verifyToken(rawToken.trim(), options.secret)
      if (payload?.sub) {
        if (options.verifyToken) {
          const okV = await options.verifyToken(rawToken.trim())
          if (!okV) payload.sub = '' // 在线校验失败 → 视为无效
        }
        if (payload.sub) {
          const appIdv = typeof payload.appId === 'string' ? payload.appId : undefined
          session = appIdv
            ? { userId: String(payload.sub), appId: appIdv, role: String(payload.role ?? '') }
            : null
          ;(ctx as any).user = {
            id: String(payload.sub),
            ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
            ...(typeof payload.name === 'string' ? { name: payload.name } : {}),
          }
        }
      }
    }
    // 会话/授权面（userSystem 同语义——业务侧主面为 ctx.session）
    ;(ctx as any).session = session
    ;(ctx as any).auth = {
      requireAuth(): Session {
        if (!session) throw new HttpError('Unauthorized', 401)
        return session
      },
      get userId() { return session?.userId },
      get appId() { return session?.appId },
      get role() { return session?.role },
    }
    if (session) (ctx as any).appId = session.appId
    // 机器客户端（appId+appKey 沟通面——X-Wf-App-Id/Key 头——分离服务间认证）
    if (options.builtin) {
      const { baseUrl, appId, appKey } = options.builtin
      const call = async (path: string, init?: RequestInit) => {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            'X-Wf-App-Id': appId,
            'X-Wf-App-Key': appKey,
            ...(init?.headers as Record<string, string> | undefined),
          },
        })
        if (!res.ok) throw new HttpError(`builtin 调用失败 HTTP ${res.status}`, res.status)
        return res.json() as Promise<unknown>
      }
      ;(ctx as any).builtin = {
        get: <T = unknown>(path: string) => call(path) as Promise<T>,
        post: <T = unknown>(path: string, body?: unknown) =>
          call(path, { method: 'POST', body: JSON.stringify(body ?? {}) }) as Promise<T>,
      }
    }
    return next(req, ctx)
  }
  return mw as Middleware<Context, AuthInjected>
}
