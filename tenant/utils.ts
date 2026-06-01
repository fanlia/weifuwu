import type { FieldDef } from './types.ts'

export function internalTableName(tenantId: string, slug: string): string {
  const hash = tenantId.replace(/-/g, '').slice(0, 8)
  return `_t_${hash}_${slug}`
}

export function pascalCase(slug: string): string {
  return slug.split(/[-_]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
}

export function sqlTypeForField(field: FieldDef): string {
  switch (field.type) {
    case 'string':
    case 'text':
      return 'TEXT'
    case 'integer':
      return 'INTEGER'
    case 'float':
      return 'DOUBLE PRECISION'
    case 'boolean':
      return 'BOOLEAN'
    case 'datetime':
      return 'TIMESTAMPTZ'
    case 'date':
      return 'DATE'
    case 'enum':
      return 'TEXT'
    case 'json':
      return 'JSONB'
    case 'vector':
      if (!field.dimensions) throw new Error(`vector field "${field.name}" must specify dimensions`)
      return `vector(${field.dimensions})`
    default:
      return 'TEXT'
  }
}

const RESERVED_SLUGS = new Set(['sys', 'graphql', 'auth'])

export function validateSlug(slug: string): string | null {
  if (!/^[a-z][a-z0-9_]*$/.test(slug)) {
    return 'Slug must start with a letter and contain only lowercase letters, numbers, and underscores'
  }
  if (RESERVED_SLUGS.has(slug)) {
    return `"${slug}" is a reserved slug`
  }
  if (slug.length > 48) {
    return 'Slug too long (max 48 characters)'
  }
  return null
}

export function validateFieldDefs(fields: FieldDef[]): string[] {
  const errors: string[] = []
  const names = new Set<string>()
  for (const f of fields) {
    if (!/^[a-z][a-z0-9_]*$/.test(f.name)) {
      errors.push(`Invalid field name: "${f.name}"`)
    }
    if (names.has(f.name)) {
      errors.push(`Duplicate field name: "${f.name}"`)
    }
    names.add(f.name)
    if (f.type === 'vector' && (!f.dimensions || f.dimensions < 1)) {
      errors.push(`Vector field "${f.name}" must have dimensions > 0`)
    }
    if (f.type === 'enum' && (!f.options || f.options.length === 0)) {
      errors.push(`Enum field "${f.name}" must have at least one option`)
    }
  }
  return errors
}

export function formatDefault(field: FieldDef): string {
  if (field.default === undefined || field.default === null) return ''
  switch (field.type) {
    case 'datetime':
      return field.default === 'now' ? 'NOW()' : `'${String(field.default)}'`
    case 'json':
      return `'${JSON.stringify(field.default)}'::jsonb`
    case 'vector':
      return `'[${String(field.default)}]'::vector`
    default:
      return typeof field.default === 'string'
        ? `'${field.default.replace(/'/g, "''")}'`
        : String(field.default)
  }
}

export function mapFieldToZod(field: FieldDef): string {
  let t: string
  switch (field.type) {
    case 'integer':
      t = 'z.number().int()'
      break
    case 'float':
      t = 'z.number()'
      break
    case 'boolean':
      t = 'z.boolean()'
      break
    case 'enum':
      if (field.options && field.options.length > 0) {
        t = `z.enum([${field.options.map(o => `'${o.replace(/'/g, "\\'")}'`).join(', ')}])`
      } else {
        t = 'z.string()'
      }
      break
    case 'json':
    case 'vector':
      t = 'z.any()'
      break
    default:
      t = 'z.string()'
  }
  if (!field.required) {
    if (field.default !== undefined) {
      t += `.default(${JSON.stringify(field.default)})`
    } else {
      t += '.optional()'
    }
  }
  return t
}

export function getRelationFields(fields: FieldDef[]): FieldDef[] {
  return fields.filter(f => f.relation)
}

export function findRelation(fields: FieldDef[], targetSlug: string): FieldDef | undefined {
  return fields.find(f => f.relation?.table === targetSlug)
}
