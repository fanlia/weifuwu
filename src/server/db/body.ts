/**
 * weifuwu/db — bodyOf（shape → body 校验——handler 样板消失）
 *
 * 开发者动线（W0 体验提升）：shape 已知全部字段——handler 的 body 不再
 * 手写类型/必填/枚举校验。parseBody 复用 insertSchema/updateSchema 变体
 * （auto 列省略 · nullable/default 可缺省 · enum 校验）——与 orm 单源。
 *
 * 用法（手写 route——与 gql/rest 协议面同源）：
 *   const body = await bodyOf(req, agents)            // BodyOf<typeof agents>
 *   const patch = await bodyOf(req, agents, { variant: 'patch' })  // PatchOf
 *
 * 错误语义：ValidationError（400 面——错误消息含字段路径/期望——errorOf
 * 映射；校验失败不抛原始 ZodError 噪音——可读优先）。
 */
import type { ZodType, ZodRawShape } from '../../shared/zod.ts'
import type { Shape, BodyOf, PatchOf } from './shape.ts'
import { ValidationError } from './errors.ts'

export interface BodyOfOptions {
  /** insert（缺省——裸行 body——省略 auto）· patch（全可选——部分更新） */
  variant?: 'insert' | 'patch'
  /** 系统列（租户/服务端注入面）——校验前剔除（不变式：注入列声明面权威——
   *  body 传该键被忽略而非校验——W4 试点（agents app_id）实证） */
  omit?: string[]
}

type ShapeLike<S extends ZodRawShape> = Shape<S> | { __shape: import('./shape.ts').Shape<S> }

function shapeOf<S extends ZodRawShape>(s: ShapeLike<S>): Shape<S> {
  const sh = (s as { __shape?: unknown }).__shape
  return sh ? (sh as Shape<S>) : (s as Shape<S>)
}

/** 校验错误聚合（字段路径 + 消息——可读优先——不是原始 issues 堆） */
function validationErrorOf(e: unknown, label: string): ValidationError {
  if (e instanceof ValidationError) return e
  const issues = (e as { issues?: { path?: string; message?: string }[] })?.issues
  if (Array.isArray(issues) && issues.length) {
    const detail = issues.map((i) => `${i.path ? `${i.path}: ` : ''}${i.message}`).join('；')
    return new ValidationError(`参数校验失败（${label}）：${detail}`)
  }
  return new ValidationError(`参数校验失败（${label}）：${e instanceof Error ? e.message : String(e)}`)
}

/** 请求体 → 类型化输入行（shape 变体校验——enum/必填/nullable/auto 省略）。
 *  命名纪律：parseBody（request.ts）是通用 JSON 解析——bodyOf 是 shape 校验面（一个词一个概念） */
export async function bodyOf<S extends ZodRawShape>(
  req: Request,
  shapeDef: ShapeLike<S>,
  opts: BodyOfOptions = {},
): Promise<BodyOf<S>> {
  const sh = shapeOf(shapeDef)
  let data: unknown
  try {
    data = await req.json()
  } catch {
    throw new ValidationError(`参数校验失败：请求体不是合法 JSON（content-type 应为 application/json）`)
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ValidationError(`参数校验失败：body 必须为对象`)
  }
  // omit：变体生成时剔除（required 豁免——系统列声明面权威——insert/update 同面）
  const schema = opts.variant === 'patch'
    ? (sh.updateSchema({ omit: opts.omit }) as ZodType<PatchOf<S>>)
    : (sh.insertSchema({ omit: opts.omit }) as ZodType<BodyOf<S>>)
  try {
    return schema.parse(data) as BodyOf<S>
  } catch (e) {
    throw validationErrorOf(e, sh.table)
  }
}

/** body 输入行类型快捷（parseBody 返回面——语义对等导出） */
export type { BodyOf, PatchOf } from './shape.ts'
