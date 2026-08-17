/**
 * 平台数据层——content/ 文本端点加载（工厂层 await——两阶段组件数据声明）
 *
 * 缓存：模块级 Map（路由导航/重渲染零成本——与 ctx.data 精神一致）
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
}

const mdCache = new Map<string, string>()
let indexCache: IndexJson | null = null

export async function fetchMd(domain: string, id: string): Promise<string> {
  const key = `/content/${domain}/${id}.md`
  const hit = mdCache.get(key)
  if (hit !== undefined) return hit
  const res = await fetch(key)
  if (!res.ok) throw new Error(`文档不存在: ${key}`)
  const text = await res.text()
  mdCache.set(key, text)
  return text
}

export async function fetchIndex(): Promise<IndexJson> {
  if (indexCache) return indexCache
  const res = await fetch('/content/index.json')
  if (!res.ok) throw new Error('index.json 不可用')
  indexCache = (await res.json()) as IndexJson
  return indexCache
}
