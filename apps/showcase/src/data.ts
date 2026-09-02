/**
 * 平台数据层——/index.json 结构化索引加载（工厂层 await——两阶段组件数据声明）
 *
 * components-only 定稿（SHOWCASE-COMPONENTS-ONLY-PLAN）：仅组件面数据。
 *
 * 缓存：模块级 Map（路由导航/重渲染零成本——与 ctx.data 精神一致）
 * 数据源：server.ts `/index.json`（registry 运行时构建——单一事实源）
 */
export interface IndexJson {
  counts: { components: number }
  components: {
    id: string; name: string; desc: string
    family: string | null; variants: { id: string; name: string; desc: string }[]; tags: string[]
    sourceFile: string | null; cssFile: string | null; testFile: string | null
    gotchas: string[]
  }[]
}

let indexCache: IndexJson | null = null

/** SSR fetch 基址（服务端 uiSsr 渲染——浏览器端为 '' → 相对 URL）
 *  server.ts 渲染前注入 http://host——自举：自 fetch 自己的 /index.json 端点 */
export function ssrFetchBase(): string {
  return ((globalThis as any).__SHOWCASE_SSR_BASE__ as string | undefined) ?? ''
}

export async function fetchIndex(): Promise<IndexJson> {
  if (indexCache) return indexCache
  const res = await fetch(ssrFetchBase() + '/index.json')
  if (!res.ok) throw new Error('index.json 不可用')
  indexCache = (await res.json()) as IndexJson
  return indexCache
}

/** **SSR 种子读取/客户端预填（2027-08——SSR≡SPA 首帧一致）**：
 *  - getIndexCache：SSR prefetch 后序列化（__DATA__.showcaseIndex）
 *  - preloadIndex：客户端 hydrate 前预热（首帧同步命中——吸收一致） */
export function getIndexCache(): IndexJson | null {
  return indexCache
}
export function preloadIndex(seed: IndexJson | undefined): void {
  if (seed) indexCache = seed
}

/** 同步缓存读取（2027-08 同步化——工厂无 await：缓存命中同步 / 未命中
 *  异步启动 fetch（首帧 loading——数据到后由调用方 rerender）——
 *  返回 EMPTY_INDEX（空态渲染——非 null——调用方零 null 检查） */
export const EMPTY_INDEX: IndexJson = { counts: { components: 0 }, components: [] }
export function fetchIndexCached(notify?: () => void): IndexJson {
  if (indexCache) return indexCache
  void fetchIndex().then(() => notify?.()) // 数据到 → 通知调用方（组件重渲染）
  return EMPTY_INDEX
}
