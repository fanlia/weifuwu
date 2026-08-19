/**
 * vdom context — 组件 ctx 类型（独立实现——零引用 ui-dom）
 *
 * 形状对齐契约（vdom-x X-A~G + AGENTS §4）：
 * - render(ids?) 返回 Promise（X-A7——await 精确等待含补跑——契约 §4.2）
 * - data = 数据管道（唯一异步边界——三场景：SSR 真 fetch / hydration 种子 /
 *   SPA fetch——缓存 + 并发合并 + 失败显式 invalidate）
 * - onUnmount（卸载清理注册）
 * - browser / ui 由 browser/ hooks/ 模块提供实现——类型在此引用（形状细化
 *   随模块实现推进——当前 unknown 占位——实现后替换为具体接口）
 * - params（路由页面组件参数——UIRouter 注入）
 * - 中间件注入面（api/auth/ws/i18n...——索引签名——可选链消费）
 */

/** 数据管道（唯一异步边界——缓存/并发合并/错误/超时由管道管理） */
export interface DataPipe {
  /** 取数：命中同步返回——未命中调 fetcher 缓存并发合并；
   *  未命中且无 fetcher（SPA 默认 fetch）——管道管理——不挂起 */
  get<T = unknown>(key: string, fetcher?: () => Promise<T>): Promise<T>
  /** 写缓存（手动失效/预置） */
  set<T = unknown>(key: string, value: T): void
  /** 数据是否已就绪（渲染期判断——未就绪输出加载态——管线不等待） */
  has(key: string): boolean
  /** 种子注入（hydration——SSR 收集的数据预热——命中同步——零二次 fetch） */
  preload(seed: Record<string, unknown>): void
  /** 失败重试（清除缓存中 reject 的 promise——显式入口——默认失败缓存不重试） */
  invalidate(key: string): void
  /** 收集已解析数据（SSR——渲染后取种子——序列化进 __DATA__） */
  seed(): Record<string, unknown>
}

/** 组件 ctx */
export interface Ctx {
  /** 统一渲染原语（组件级闭包绑定——root/comp/语义 id 同一入口——串行调度；
   *  返回 Promise——await 精确等待（含渲染中触发的补跑——X-A7） */
  render(ids?: string[]): Promise<void>
  /** 数据管道（唯一异步边界——工厂层取数） */
  data: DataPipe
  /** 卸载清理注册（ref cleanup/监听退订——unmount 时执行） */
  onUnmount(fn: () => void): void
  /** 渲染完成回调注册（hook 挂载后动作——元素已挂载——serve 提供） */
  afterRender?(fn: () => void): void
  /** 浏览器环境 API（browser/ 实现——copyText/byId/scrollTop/storage...） */
  browser: unknown
  /** hooks 注入面（hooks/ 实现——usePopup/useControlled/useExternal...） */
  ui: unknown
  /** 路由参数（页面组件——UIRouter 注入） */
  params?: Record<string, string>
  /** 中间件注入面（api/auth/ws/i18n...——可选链消费） */
  [key: string]: unknown
}
