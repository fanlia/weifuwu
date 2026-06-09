import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Context, Handler } from '../types.ts'

export interface DeployConfig {
  domain?: string
  port?: number
  deployToken?: string
  defaultApp?: string
  apps: Record<string, AppConfig>
}

export interface AppConfig {
  dir?: string
  port?: number
  entry?: string
  path?: string
  env?: Record<string, string>
  healthEndpoint?: string
  buildCommand?: string
  ports?: [number, number]
}

export interface AppStatus {
  name: string
  status: 'starting' | 'running' | 'stopped' | 'error'
  port: number
  path?: string
  pid?: number
  uptime?: number
  error?: string
}

export interface DeployServer {
  close(): Promise<void>
  ready: Promise<void>
  url: string
  apps: {
    list(): AppStatus[]
    status(name: string): AppStatus | undefined
    deploy(name: string): Promise<void>
    restart(name: string): Promise<void>
    stop(name: string): Promise<void>
    start(name: string): Promise<void>
  }
}

export interface GatewayResult {
  handler: Handler
  wsHandler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void
}

declare module '../types.ts' {
  interface Context {
    deploy?: {
      appName?: string
    }
  }
}
