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
export {};
