import type { DeployConfig } from './types.ts'

export function defineConfig(config: DeployConfig): DeployConfig {
  const domain = config.domain || 'localhost'
  const port = config.port ?? 3000

  let nextPort = 3001
  for (const [name, ac] of Object.entries(config.apps)) {
    ac.dir ??= name
    ac.entry ??= 'index.ts'
    ac.port ??= nextPort++
    if (!ac.path && domain === 'localhost') {
      ac.path = `/${name}`
    }
  }

  return { ...config, domain, port }
}
