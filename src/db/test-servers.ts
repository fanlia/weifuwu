/**
 * 协议测试内存服务器工具——零外部依赖（无 docker）
 *
 * Redis/PG 引擎测试连进程内 MemoryRedisServer/MemoryPostgresServer：
 * 真实 TCP 线协议交互（RESP / PG v3）——CS-04 精神保留，docker 依赖消除。
 *
 * 每个测试文件独立服务器实例（随机端口——并行隔离）；实例由进程回收
 * （node:test 文件级 after 有单跑提前触发坑——不依赖显式 close）。
 */
import { MemoryRedisServer } from './redis-server.ts'
import { MemoryPostgresServer } from './postgres-server.ts'

export interface TestServers {
  redis: { port: number; url: string }
  pg: { port: number; url: string }
}

export async function startTestServers(): Promise<TestServers> {
  const redisSrv = new MemoryRedisServer()
  await redisSrv.start()
  const pgSrv = new MemoryPostgresServer()
  await pgSrv.start()
  return {
    redis: { port: redisSrv.port, url: redisSrv.url },
    pg: { port: pgSrv.port, url: pgSrv.url },
  }
}

/** 仅 Redis（不需要 PG 的测试文件） */
export async function startRedisServer(): Promise<{ port: number; url: string }> {
  const srv = new MemoryRedisServer()
  await srv.start()
  return { port: srv.port, url: srv.url }
}

/** 仅 PG（不需要 Redis 的测试文件） */
export async function startPgServer(): Promise<{ port: number; url: string }> {
  const srv = new MemoryPostgresServer()
  await srv.start()
  return { port: srv.port, url: srv.url }
}
