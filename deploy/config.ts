import type { DeployConfig } from './types.ts'

export function defineConfig(config: DeployConfig): DeployConfig {
  if (!config.domain) throw new Error('deploy: domain is required')
  if (!config.apps || Object.keys(config.apps).length === 0) {
    throw new Error('deploy: at least one app is required')
  }

  for (const [name, app] of Object.entries(config.apps)) {
    if (!app.repo) throw new Error(`deploy: app "${name}" has no repo`)
    if (!app.entry) throw new Error(`deploy: app "${name}" has no entry`)
    if (!app.port) throw new Error(`deploy: app "${name}" has no port`)
  }

  return {
    port: config.port ?? 80,
    appsDir: config.appsDir ?? '/opt/weifuwu/apps',
    ...config,
  }
}
