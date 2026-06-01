import type { ToolPermission, OpencodePermissions } from './types.ts'

const DENIED_COMMANDS = [
  /^rm\s+-rf\s+\/\s*$/,
  /^mkfs/,
  /^dd\s+if=/,
  /^:\(\)\{.*\}:;$/,
  /^fork\s+bomb/i,
]

const DENIED_PATHS = [
  /\/\.env$/,
  /\/\.env\.\w+$/,
  /\/node_modules\//,
]

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
  perms?: OpencodePermissions,
): boolean {
  if (!resolvedPath.startsWith(workspace)) return false

  for (const re of DENIED_PATHS) {
    if (re.test(resolvedPath)) return false
  }

  return true
}

export function isToolEnabled(
  name: string,
  perms?: OpencodePermissions,
): boolean {
  if (!perms) return true
  const p = (perms as any)[name] as ToolPermission | undefined
  if (p === undefined) return true
  return p.allow !== false
}
