import {
  type GraphQLOutputType,
  type GraphQLInputType,
  type GraphQLFieldConfigMap,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLID,
  GraphQLList,
  GraphQLNonNull,
  GraphQLEnumType,
  graphql as executeGraphQL,
} from 'graphql'
import type { SqlClient } from '../vendor.ts'
import type { Context } from '../types.ts'
import { Router } from '../router.ts'
import type { FieldDef, UserTableRow } from './types.ts'
import { internalTableName, pascalCase, findRelation, getRelationFields } from './utils.ts'

// GraphQL schema generation is inherently dynamic — the any types below are
// unavoidable because resolver parent/args depend on the user-defined schema.
/* eslint-disable @typescript-eslint/no-explicit-any */
type GQLFieldMap = GraphQLFieldConfigMap<any, any>
/* eslint-enable @typescript-eslint/no-explicit-any */

function graphqlType(field: FieldDef, required: boolean): GraphQLOutputType {
  let t: GraphQLOutputType = GraphQLString
  switch (field.type) {
    case 'integer':
      t = GraphQLInt
      break
    case 'float':
      t = GraphQLFloat
      break
    case 'boolean':
      t = GraphQLBoolean
      break
    case 'enum':
      if (field.options && field.options.length > 0) {
        t = new GraphQLEnumType({
          name: `Enum_${field.name}`,
          values: Object.fromEntries(field.options.map((o) => [o, { value: o }])),
        })
      }
      break
    case 'vector':
      t = GraphQLString
      break
  }
  return required ? new GraphQLNonNull(t) : t
}

function inputGraphqlType(field: FieldDef): GraphQLInputType {
  return graphqlType(field, false) as GraphQLInputType
}

interface BuildCtx {
  sql: SqlClient
  tenantId: string
  tables: UserTableRow[]
  typeCache: Map<number, GraphQLObjectType>
}

function buildObjectType(table: UserTableRow, ctx: BuildCtx): GraphQLObjectType {
  const cached = ctx.typeCache.get(table.id)
  if (cached) return cached
  const typeName = pascalCase(table.slug)
  const fieldsThunk = () => {
    const fields: GQLFieldMap = {}
    fields.id = { type: new GraphQLNonNull(GraphQLID) }
    for (const f of table.fields) {
      fields[f.name] = { type: graphqlType(f, !!f.required) }
    }

    // Has-many relationships: find other tables that reference this one
    for (const other of ctx.tables) {
      if (other.id === table.id) continue
      const relField = findRelation(other.fields, table.slug)
      if (relField) {
        fields[other.slug] = {
          type: new GraphQLList(new GraphQLNonNull(buildObjectType(other, ctx))),
          args: {
            limit: { type: GraphQLInt, defaultValue: 20 },
            offset: { type: GraphQLInt, defaultValue: 0 },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          resolve: async (parent: any) => {
            const childName = internalTableName(ctx.tenantId, other.slug)
            const rows = await ctx.sql.unsafe(
              `SELECT * FROM "${childName}" WHERE "${relField.name}" = $1 AND tenant_id = $2 ORDER BY id DESC LIMIT $3 OFFSET $4`,
              [parent.id, ctx.tenantId, 20, 0],
            )
            return rows
          },
        }

        // M2M: check if the referencing table is a junction
        const relFields = getRelationFields(other.fields)
        if (relFields.length === 2 && other.fields.length <= 3) {
          const otherRel = relFields.find((f) => f.name !== relField.name)!
          const targetSlug = otherRel.relation!.table
          const targetTable = ctx.tables.find((t) => t.slug === targetSlug)
          if (targetTable) {
            const branchName = targetSlug
            fields[branchName] = {
              type: new GraphQLList(new GraphQLNonNull(buildObjectType(targetTable, ctx))),
              args: {
                limit: { type: GraphQLInt, defaultValue: 20 },
                offset: { type: GraphQLInt, defaultValue: 0 },
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              resolve: async (parent: any) => {
                const childName = internalTableName(ctx.tenantId, other.slug)
                const targetName = internalTableName(ctx.tenantId, targetSlug)
                const rows = await ctx.sql.unsafe(
                  `SELECT t.* FROM "${targetName}" t JOIN "${childName}" j ON j."${otherRel.name}" = t.id WHERE j."${relField.name}" = $1 AND t.tenant_id = $2 ORDER BY t.id DESC LIMIT $3 OFFSET $4`,
                  [parent.id, ctx.tenantId, 20, 0],
                )
                return rows
              },
            }
          }
        }
      }
    }

    // Belongs-to relationships
    for (const f of table.fields) {
      if (!f.relation) continue
      const targetSlug = f.relation.table
      const targetTable = ctx.tables.find((t) => t.slug === targetSlug)
      if (!targetTable) continue
      fields[targetSlug] = {
        type: buildObjectType(targetTable, ctx),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolve: async (parent: any) => {
          const name = internalTableName(ctx.tenantId, targetSlug)
          const [row] = await ctx.sql.unsafe(
            `SELECT * FROM "${name}" WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
            [parent[f.name], ctx.tenantId],
          )
          return row ?? null
        },
      }
    }

    return fields
  }

  const type = new GraphQLObjectType({ name: typeName, fields: fieldsThunk })
  ctx.typeCache.set(table.id, type)
  return type
}

function buildInputType(table: UserTableRow, prefix: string): GraphQLInputObjectType {
  const typeName = pascalCase(`${prefix}_${table.slug}`) + 'Input'
  return new GraphQLInputObjectType({
    name: typeName,
    fields: Object.fromEntries(table.fields.map((f) => [f.name, { type: inputGraphqlType(f) }])),
  })
}

function buildQueryFields(tables: UserTableRow[], ctx: BuildCtx): GQLFieldMap {
  const fields: GQLFieldMap = {}
  for (const table of tables) {
    const objType = buildObjectType(table, ctx)
    const slug = table.slug
    const pascal = pascalCase(slug)

    // List
    fields[slug] = {
      type: new GraphQLList(new GraphQLNonNull(objType)),
      args: {
        limit: { type: GraphQLInt, defaultValue: 20 },
        offset: { type: GraphQLInt, defaultValue: 0 },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolve: async (_: any, args: any) => {
        const name = internalTableName(ctx.tenantId, slug)
        const rows = await ctx.sql.unsafe(
          `SELECT * FROM "${name}" WHERE tenant_id = $1 ORDER BY id DESC LIMIT $2 OFFSET $3`,
          [ctx.tenantId, args.limit, args.offset],
        )
        return rows
      },
    }

    // Single
    fields[`get${pascal}`] = {
      type: objType,
      args: { id: { type: new GraphQLNonNull(GraphQLID) } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolve: async (_: any, args: any) => {
        const name = internalTableName(ctx.tenantId, slug)
        const [row] = await ctx.sql.unsafe(
          `SELECT * FROM "${name}" WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
          [parseInt(args.id, 10), ctx.tenantId],
        )
        return row ?? null
      },
    }
  }
  return fields
}

function buildMutationFields(tables: UserTableRow[], ctx: BuildCtx): GQLFieldMap {
  const fields: GQLFieldMap = {}
  for (const table of tables) {
    const objType = buildObjectType(table, ctx)
    const pascal = pascalCase(table.slug)
    const inputType = buildInputType(table, 'create')
    const patchType = buildInputType(table, 'patch')

    fields[`create${pascal}`] = {
      type: objType,
      args: { data: { type: new GraphQLNonNull(inputType) } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolve: async (_: any, args: any) => {
        const name = internalTableName(ctx.tenantId, table.slug)
        const data = { ...args.data, tenant_id: ctx.tenantId }
        const [row] = await ctx.sql.unsafe(
          `INSERT INTO "${name}" ("tenant_id", "${table.fields.map((f) => f.name).join('", "')}") VALUES ($1, ${table.fields.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING *`,
          [ctx.tenantId, ...table.fields.map((f) => data[f.name] ?? null)],
        )
        return row
      },
    }

    fields[`update${pascal}`] = {
      type: objType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        data: { type: new GraphQLNonNull(patchType) },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolve: async (_: any, args: any) => {
        const name = internalTableName(ctx.tenantId, table.slug)
        const setClauses = table.fields
          .filter((f) => args.data[f.name] !== undefined)
          .map((f, i) => `"${f.name}" = $${i + 1}`)
        if (setClauses.length === 0) {
          const [row] = await ctx.sql.unsafe(
            `SELECT * FROM "${name}" WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
            [parseInt(args.id, 10), ctx.tenantId],
          )
          return row ?? null
        }
        const values = table.fields
          .filter((f) => args.data[f.name] !== undefined)
          .map((f) => args.data[f.name])
        values.push(parseInt(args.id, 10), ctx.tenantId)
        const [row] = await ctx.sql.unsafe(
          `UPDATE "${name}" SET ${setClauses.join(', ')} WHERE id = $${values.length - 1} AND tenant_id = $${values.length} RETURNING *`,
          values,
        )
        return row ?? null
      },
    }

    fields[`delete${pascal}`] = {
      type: GraphQLBoolean,
      args: { id: { type: new GraphQLNonNull(GraphQLID) } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolve: async (_: any, args: any) => {
        const name = internalTableName(ctx.tenantId, table.slug)
        const result = await ctx.sql.unsafe(
          `DELETE FROM "${name}" WHERE id = $1 AND tenant_id = $2 RETURNING 1`,
          [parseInt(args.id, 10), ctx.tenantId],
        )
        return result.length > 0
      },
    }
  }
  return fields
}

export function buildGraphQLHandler(sql: SqlClient): Router {
  const r = new Router()

  r.post('/', async (req: Request, ctx: Context) => {
    const tables = (await sql`
      SELECT * FROM "_user_tables"
      WHERE tenant_id = ${ctx.tenant!.id}
      ORDER BY created_at ASC
    `) as unknown as UserTableRow[]

    const buildCtx: BuildCtx = { sql, tenantId: ctx.tenant!.id, tables, typeCache: new Map() }

    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: () => buildQueryFields(tables, buildCtx),
      }),
      mutation: new GraphQLObjectType({
        name: 'Mutation',
        fields: () => buildMutationFields(tables, buildCtx),
      }),
    })

    const body = (await req.json()) as {
      query?: string
      variables?: Record<string, unknown>
      operationName?: string
    }
    if (!body.query) {
      return Response.json({ errors: [{ message: 'Missing query' }] }, { status: 400 })
    }

    const result = await executeGraphQL({
      schema,
      source: body.query,
      variableValues: body.variables,
      operationName: body.operationName,
      contextValue: ctx,
    })

    return Response.json(result, { status: result.errors ? 400 : 200 })
  })

  r.get('/', async (req: Request, _ctx: Context) => {
    const url = new URL(req.url)
    if (url.searchParams.has('query')) {
      return handleGET(req, _ctx)
    }
    return new Response('GraphQL endpoint. Send POST /graphql with { query, variables }', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  })

  async function handleGET(req: Request, _ctx: Context): Promise<Response> {
    const tables = (await sql`
      SELECT * FROM "_user_tables"
      WHERE tenant_id = ${_ctx.tenant!.id}
      ORDER BY created_at ASC
    `) as unknown as UserTableRow[]

    const buildCtx: BuildCtx = { sql, tenantId: _ctx.tenant!.id, tables, typeCache: new Map() }

    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: () => buildQueryFields(tables, buildCtx),
      }),
    })

    const url = new URL(req.url)
    const query = url.searchParams.get('query')!
    let variables = {}
    try {
      const v = url.searchParams.get('variables')
      if (v) variables = JSON.parse(v)
    } catch {}

    const result = await executeGraphQL({
      schema,
      source: query,
      variableValues: variables,
      operationName: url.searchParams.get('operationName') || undefined,
      contextValue: _ctx,
    })

    return Response.json(result, { status: result.errors ? 400 : 200 })
  }

  return r
}
