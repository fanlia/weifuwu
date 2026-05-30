import WebSocket, { WebSocketServer } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Context, Handler } from '../types.ts'
import type { DeployConfig, GatewayResult } from './types.ts'

interface AppMatch {
  name: string
  port: number
  stripPath?: string
}

function isBareDomain(host: string, domain: string): boolean {
  return host === domain || host === `www.${domain}`
}

function matchApp(
  config: DeployConfig,
  getPort: (name: string) => number | undefined,
  host: string,
  pathname: string,
): AppMatch | undefined {
  for (const [name, ac] of Object.entries(config.apps)) {
    if (ac.subdomain && host === `${ac.subdomain}.${config.domain}`) {
      const port = getPort(name)
      if (port) return { name, port }
    }
  }

  const pathApps = Object.entries(config.apps)
    .filter(([, ac]) => ac.path)
    .sort(([, a], [, b]) => (b.path?.length ?? 0) - (a.path?.length ?? 0))

  for (const [name, ac] of pathApps) {
    if (ac.path && pathname.startsWith(ac.path)) {
      const port = getPort(name)
      if (port) return { name, port, stripPath: ac.path }
    }
  }

  if (config.defaultApp && isBareDomain(host, config.domain)) {
    const port = getPort(config.defaultApp)
    if (port) return { name: config.defaultApp, port }
  }

  return undefined
}

export function createGateway(
  config: DeployConfig,
  getPort: (name: string) => number | undefined,
): GatewayResult {
  const handler: Handler = async (req: Request) => {
    const url = new URL(req.url)
    const match = matchApp(config, getPort, url.hostname, url.pathname)
    if (!match) return new Response('Not Found', { status: 404 })

    let targetPath = url.pathname
    if (match.stripPath && targetPath.startsWith(match.stripPath)) {
      targetPath = targetPath.slice(match.stripPath.length) || '/'
    }
    const target = `http://127.0.0.1:${match.port}${targetPath}${url.search}`

    try {
      const proxyReq = new Request(target, {
        method: req.method,
        headers: req.headers,
        body: (req.method !== 'GET' && req.method !== 'HEAD') ? req.body : null,
      })
      return await fetch(proxyReq)
    } catch {
      return new Response('Bad Gateway', { status: 502 })
    }
  }

  const wss = new WebSocketServer({ noServer: true })

  const wsHandler = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const host = req.headers.host?.split(':')[0] ?? ''
    const match = matchApp(config, getPort, host, url.pathname)

    if (!match) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }

    let targetPath = url.pathname
    if (match.stripPath && targetPath.startsWith(match.stripPath)) {
      targetPath = targetPath.slice(match.stripPath.length) || '/'
    }
    const wsUrl = `ws://127.0.0.1:${match.port}${targetPath}${url.search}`

    const backendWS = new WebSocket(wsUrl)

    backendWS.on('open', () => {
      wss.handleUpgrade(req, socket, head, (clientWS) => {
        const clientSend = (data: WebSocket.Data) => { clientWS.send(data) }
        const backendSend = (data: WebSocket.Data) => { backendWS.send(data) }

        clientWS.on('message', backendSend)
        backendWS.on('message', clientSend)

        clientWS.on('close', () => backendWS.close())
        backendWS.on('close', () => clientWS.close())
        clientWS.on('error', () => backendWS.close())
        backendWS.on('error', () => clientWS.close())
      })
    })

    backendWS.on('error', () => {
      socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      socket.destroy()
    })
  }

  return { handler, wsHandler }
}
