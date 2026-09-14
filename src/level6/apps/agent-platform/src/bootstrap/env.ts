/**
 * 启动环境推导（server.ts 拆分 W1——bootstrap 域）
 *
 * PUBLIC_BASE_URL 未配置或含 localhost 时推导宿主 IP——消息/问卷链接给
 * 可达地址（容器内 AI 访问宿主用 host.docker.internal——提示词已有）。
 */
export async function derivePublicBaseUrl(): Promise<void> {
  try {
    if (!process.env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL.includes('localhost')) {
      const os = await import('node:os')
      const nets = os.networkInterfaces()
      const ip = Object.values(nets)
        .flat()
        .find((n) => n?.family === 'IPv4' && !n.internal)?.address
      if (ip) {
        process.env.PUBLIC_BASE_URL = `http://${ip}:${process.env.PORT ?? 3000}`
        console.log(`[agent-platform] PUBLIC_BASE_URL 自动推导：${process.env.PUBLIC_BASE_URL}`)
      }
    }
  } catch { /* 推导失败用默认 */ }
}
