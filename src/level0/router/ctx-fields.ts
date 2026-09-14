/**
 * ctx 字段注册表（SHARED-TRIE-EXCELLENCE B0'——2027-10）
 *
 * **ctx 扩展机制双端统一**（用户论证：「前后端都是通过扩展 ctx.xxx
 * 提供新能力，只是扩展的能力不一样」）——middleware 声明 injects（注入
 * 字段）/depends（依赖字段）——依赖未注册抛错（含注册引导文案）。
 *
 * - server：Router._checkMiddlewareMeta 迁移消费（行为零变化——
 *   global/route/mount 三位置检查语义保留）
 * - client：获得同一机制（UIContext declare module 类型增强的运行时
 *   对应——未来前端中间件声明 injects 同样受检）——类型/运行时双层对齐
 */

export interface CtxFieldRegistry {
  /** 登记注入字段（injects——provider 中间件先行注册） */
  register(injects: string[]): void
  /** 依赖检查（depends——未注册抛错，含 app.use(xxx()) 引导） */
  check(depends: string[], location: string): void
  has(field: string): boolean
}

export function createCtxFieldRegistry(): CtxFieldRegistry {
  const fields = new Set<string>()
  return {
    register(injects: string[]) {
      for (const f of injects) fields.add(f)
    },
    check(depends: string[], location: string) {
      for (const dep of depends) {
        if (!fields.has(dep)) {
          throw new Error(
            `[weifuwu] Middleware at "${location}" depends on ctx.${dep} but it hasn't been registered.\n` +
            `  Register the provider before this middleware: app.use(${dep}())`,
          )
        }
      }
    },
    has(field: string) {
      return fields.has(field)
    },
  }
}
