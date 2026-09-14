/**
 * weifuwu/shared/router — 前后端唯一共享模块（trie/pipeline/context/chain/ctx-fields）
 *
 * 五件单源：URL 路由匹配（trie）· 请求→响应管道（pipeline）· 上下文组装（context）·
 * 链式执行（chain）· 上下文字段注册表（ctx-fields）——前后端同一实现
 * （server Router / client UIRouter 消费——src 相对引用 + dist 导出双通道）。
 */
export { createTrie } from './trie.ts'
export type { TrieNode } from './trie.ts'
export { dispatchRouter } from './pipeline.ts'
export type { RouterPipeline, RouteMatch } from './pipeline.ts'
export { parseRequestTarget } from './context.ts'
export type { RequestTarget } from './context.ts'
export { createCtxFieldRegistry } from './ctx-fields.ts'
export type { CtxFieldRegistry } from './ctx-fields.ts'
export { runChain } from './chain.ts'
export { freshParams, parseQuery } from './context.ts'
