/**
 * weifuwu/db — DBServer 接口：内存协议服务器（测试/开发零外部依赖）
 *
 * 进程内起真实线协议服务器（TCP），客户端无需改动直接连接：
 *   MemoryRedisServer     → RESP 协议 + MemoryRedis 存储引擎（命令面复用）
 *   MemoryPostgresServer  → PG v3 协议 + MemorySql 存储引擎（SQL 执行复用）
 *
 * 用途：
 *   - 引擎协议测试（connection/pool/client/subscriber）——无 docker
 *   - 开发/CI 起一个"假服务器"验证客户端协议行为
 *   - 故障注入：kill 连接 / 不响应 / 阻塞命令——编程式（服务器钩子）
 *
 * 与 MemoryRedis/MemorySql（客户端内存实现）区别：
 *   客户端内存实现 = 进程内直接调（无网络）；DBServer = 真实 TCP 线协议——
 *   验证客户端与"服务器"的网络交互（编解码/重连/订阅推送/认证握手）。
 */
export interface DBServer {
  /** 监听端口（0 = 随机分配） */
  port: number
  /** 客户端连接串（redis://127.0.0.1:port 或 postgres://user@127.0.0.1:port/db） */
  url: string
  /** 启动监听（幂等） */
  start(): Promise<void>
  /** 关闭服务器与全部连接（幂等） */
  close(): Promise<void>
}

export { MemoryRedisServer } from './redis-server.ts'
export type { RedisServerOptions } from './redis-server.ts'
