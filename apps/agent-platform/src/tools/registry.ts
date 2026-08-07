/**
 * 工具注册表 — 全局 tool name → handler 映射（从自研 agent.ts 搬出，供框架 agent 引擎分发）
 */
const toolHandlers = new Map<string, (args: Record<string, unknown>) => unknown | Promise<unknown>>()

export function registerTool(
  name: string,
  handler: (args: Record<string, unknown>) => unknown | Promise<unknown>,
): void {
  toolHandlers.set(name, handler)
}

export function registerTools(
  tools: Record<string, (args: Record<string, unknown>) => unknown | Promise<unknown>>,
): void {
  for (const [name, handler] of Object.entries(tools)) {
    toolHandlers.set(name, handler)
  }
}

export function getToolHandler(name: string): ((args: Record<string, unknown>) => unknown | Promise<unknown>) | undefined {
  return toolHandlers.get(name)
}
