/**
 * weifuwu — makeExecutableSchema（自研，替代 @graphql-tools/schema）
 *
 * 核心能力：SDL 字符串 + resolvers map → GraphQLSchema（字段 resolve 绑定）。
 * 覆盖 makeExecutableSchema 的常用子集：
 *   - 根类型（Query/Mutation/Subscription）resolver
 *   - 嵌套类型字段 resolver（graphql-tools 的核心价值）
 *   - 无 resolver 字段走 graphql 默认属性查找
 *   - resolvers 里未知 type 名忽略（宽松）
 *
 * 裁剪（明确不支持，graphql 原生无等价物）：
 *   - 类型合并/extends（graphql-tools merge 能力）
 *   - schema 指令绑定
 */

import { buildSchema, type GraphQLSchema } from 'graphql'

export interface MakeSchemaOptions {
  typeDefs: string | GraphQLSchema
  resolvers?: Record<string, Record<string, unknown>>
}

export function makeExecutableSchema(options: MakeSchemaOptions): GraphQLSchema {
  const schema = typeof options.typeDefs === 'string' ? buildSchema(options.typeDefs) : options.typeDefs
  const resolvers = options.resolvers ?? {}

  for (const [typeName, fieldResolvers] of Object.entries(resolvers)) {
    const type = schema.getType(typeName)
    if (!type || typeof type !== 'object' || !('getFields' in type)) continue
    const fields = type.getFields() as Record<string, { resolve?: unknown }>
    for (const [fieldName, resolver] of Object.entries(fieldResolvers)) {
      const field = fields[fieldName]
      if (field && typeof resolver === 'function') {
        field.resolve = resolver as never
      }
    }
  }

  return schema
}
