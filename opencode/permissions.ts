/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ToolPermission, OpencodePermissions } from './types.ts'

const DENIED_COMMANDS = [
  /^rm\s+-rf\s+\/\s*$/,
  /^mkfs/,
  /^dd\s+if=/,
  /^:\(\)\{.*\}:;$/,
  /^fork\s+bomb/i,
]

const DENIED_PATHS = [/\/\.env$/, /\/\.env\.\w+$/, /\/node_modules\//]

export function isCommandAllowed(command: string): boolean {
  const trimmed = command.trim()
  for (const re of DENIED_COMMANDS) {
    if (re.test(trimmed)) return false
  }
  return true
}

export function isPathAllowed(
  resolvedPath: string,
  workspace: string,
  _perms?: OpencodePermissions,
): boolean {
  if (!resolvedPath.startsWith(workspace)) return false

  for (const re of DENIED_PATHS) {
    if (re.test(resolvedPath)) return false
  }

  return true
}

export function isToolEnabled(name: string, perms?: OpencodePermissions): boolean {
  if (!perms) return true
  const p = (perms as any)[name] as ToolPermission | undefined
  if (p === undefined) return true
  return p.allow !== false
}

function matchGlob(str: string, pattern: string): boolean {
  const parts = pattern.split('*')
  if (parts.length === 1) return str === pattern
  if (!str.startsWith(parts[0])) return false
  if (!str.endsWith(parts[parts.length - 1])) return false
  return true
}

export function isSkillAllowed(name: string, perms?: OpencodePermissions): boolean {
  if (!perms?.skill) return true

  const entries = Object.entries(perms.skill)
  entries.sort(([a], [b]) => {
    const hasStarA = a.includes('*') ? 1 : 0
    const hasStarB = b.includes('*') ? 1 : 0
    if (hasStarA !== hasStarB) return hasStarA - hasStarB
    return b.length - a.length
  })

  for (const [pattern, perm] of entries) {
    if (matchGlob(name, pattern)) {
      return perm.allow !== false
    }
  }

  return true
}
