/**
 * weifuwu/db — 生成器契约层（L0 纯类型）
 *
 * `orm.gql`/`orm.rest` 的选项与输出类型单源定义于此：
 * - 消费方（core orm / 业务）不依赖生成器实现
 * - 实现（`gql-from-shape.ts`/`rest-from-shape.ts`——装备面）导入并重出
 *
 * 纪律：改契约 = 改这里（实现不得私藏同名接口）。
 */

export interface GqlShapeOptions {
  /** 生成类型名（默认表名 PascalCase） */
  name?: string
  /** 执行面取数（默认 ctx.orm——协议层 = AST；orm.gql 内部绑定 ormBase） */
  sql?: (ctx: unknown) => unknown
  /** 租户 scope：字段名 + 上下文取值（自动注入 where/insert——跨租户隔离；
   *  与 OrmTenant.value 同签名——undefined=无值（不注入） */
  tenant?: { field: string; value: (ctx: unknown) => string | undefined }
  /** 默认分页上限（默认 100） */
  maxLimit?: number
  /** 字段策略（命名契约 W0——fieldPolicy 首版）：敏感列豁免——
   *  SDL 不生成（字段/Filter/Sort/Insert/Patch 全不出现）+ resolver 不返回 */
  hidden?: string[]
}

export interface GqlShapeOutput {
  typeDefs: string
  resolvers: Record<string, Record<string, (...args: any[]) => any>>
}

export interface RestHooks {
  beforeList?: (req: Request, ctx: unknown) => Promise<void> | void
  afterList?: (rows: Record<string, unknown>[], req: Request, ctx: unknown) => Record<string, unknown>[] | Promise<Record<string, unknown>[]>
  beforeInsert?: (data: Record<string, unknown>, req: Request, ctx: unknown) => Promise<void> | void
  beforeUpdate?: (id: string, patch: Record<string, unknown>, req: Request, ctx: unknown) => Promise<void> | void
  beforeDelete?: (id: string, req: Request, ctx: unknown) => Promise<void> | void
}

export interface RestShapeOptions {
  /** 资源名（默认表名——仅元数据） */
  name?: string
  /** 默认分页上限（默认 100） */
  maxLimit?: number
  /** 字段策略（fieldPolicy——敏感列豁免：列表/单查/返回不出现；写入面保留） */
  hidden?: string[]
  /** 业务接缝（hooks——分层纪律：业务 handler 插点） */
  hooks?: RestHooks
}

export interface RestShapeOutput {
  /** 挂载面（app.get/post/patch/delete 注册——`/api/agents` 等 base） */
  mount: (app: {
    get: (p: string, h: (req: Request, ctx: never) => Promise<Response>) => unknown
    post: (p: string, h: (req: Request, ctx: never) => Promise<Response>) => unknown
    patch: (p: string, h: (req: Request, ctx: never) => Promise<Response>) => unknown
    delete: (p: string, h: (req: Request, ctx: never) => Promise<Response>) => unknown
  }, base: string) => void
}
