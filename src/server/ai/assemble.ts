/**
 * weifuwu AI — 组装层：provider（AiClient）→ 中间件模块（AiClientModule）
 *
 * 参考 postgres（client.ts 工厂组装 mw）——ai() 与 MemoryAi 共用：
 * 中间件注入（ctx.ai）+ 能力方法挂载（agent 引擎套 provider）。
 */
import type { Context, Middleware } from '../../server/types.ts'
import { createAgent, type AgentConfig } from './agent.ts'
import type { AiClient } from './client.ts'
import type { AIInterface } from './contracts.ts'

export interface AiInjected {
  ai: AIInterface
}

/** 模块 = 中间件 + 客户端（queue 式混合：app.use(a) + worker 直接 a.chat()）。
 *  实现 AIInterface 契约（contracts.ts 单一来源）；streamStep 为 agent 内部细节（不在契约） */
export interface AiClientModule extends Middleware<Context, Context & AiInjected>, AIInterface {
  /** 内部：单轮 LLM 流式 → emit 事件 + 聚合结果（agent 引擎用——不在契约 AIInterface） */
  streamStep: AiClient['streamStep']
}

export function assemble(client: AiClient): AiClientModule {
  const mw: Middleware = (req, ctx, next) => {
    ctx.ai = module
    return next(req, ctx)
  }
  mw.__meta = { injects: ['ai'], depends: [] }

  const module = mw as AiClientModule
  module.chat = client.chat
  module.stream = client.stream
  module.sse = client.sse
  module.streamStep = client.streamStep
  module.waitApproval = client.waitApproval
  module.approve = client.approve
  module.agent = (config: AgentConfig) => createAgent(client, config)
  module.embed = client.embed
  module.embedMany = client.embedMany
  module.generateImage = client.generateImage
  module.createVideoTask = client.createVideoTask
  module.videoStatus = client.videoStatus
  module.close = client.close

  return module
}
