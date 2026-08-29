/**
 * 平台数据层——/index.json 结构化索引加载（工厂层 await——两阶段组件数据声明）
 *
 * 缓存：模块级 Map（路由导航/重渲染零成本——与 ctx.data 精神一致）
 * 数据源：server.ts `/index.json`（registry 运行时构建——单一事实源）
 */
export interface IndexJson {
  counts: Record<string, number>
  components: { id: string; name: string; category: string; desc: string; family: string | null; variantOf: string | null; tags: string[]; sourceFile: string | null; cssFile: string | null; testFile: string | null; gotchas: string[]; usedInPatterns: string[]; usedInApps: string[]; relatedBackend: string[] }[]
  primitives: { id: string; name: string; cssFile: string; desc: string; classes: string[]; kind: string }[]
  patterns: { id: string; name: string; group: string; desc: string; file: string; uses: string[]; usedInApps: string[] }[]
  apps: { id: string; name: string; desc: string; dir: string; usesPatterns: string[]; uses: string[]; production: boolean; quality: string[] }[]
  backend: { id: string; name: string; group: string; desc: string; middleware: string; endpoint: string | null; relatedComponents: string[] }[]
  capabilities: { id: string; name: string; desc: string; srcFile: string; selfUsedIn: string[] }[]
  guides: { id: string; name: string; desc: string }[]
  needs: { id: string; name: string; desc: string; template?: string; patterns: string[]; components: string[]; backend: string[]; guide: string }[]
  cases: { id: string; name: string; type: string; desc: string; highlights: string[]; url?: string }[]
  community: { id: string; name: string; desc: string; author: string; url: string; quality: string[] }[]
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
export const EMPTY_INDEX: IndexJson = {
  counts: {}, components: [], primitives: [], patterns: [], apps: [],
  backend: [], capabilities: [], guides: [], needs: [], cases: [], community: [],
}
export function fetchIndexCached(notify?: () => void): IndexJson {
  if (indexCache) return indexCache
  void fetchIndex().then(() => notify?.()) // 数据到 → 通知调用方（组件重渲染）
  return EMPTY_INDEX
}
