// ── React SSR engine ───────────────────────────────────────────────
export { TsxContext } from './ssr/tsx-context.ts'
export { ssr } from './ssr/ssr.ts'
export type { SsrModule, RouteEntry } from './ssr/ssr.ts'
export { layout } from './ssr/layout.ts'
export { errorBoundary } from './ssr/error-boundary.ts'
export { Head } from './ssr/head.tsx'
export { tailwindContext, tailwindRouter, addTailwindSource } from './ssr/tailwind.ts'
export { liveRouter, liveWatcher, liveWs } from './ssr/live.ts'
export { compile, compileTsx, compileTsxDev, compileVendorBundle, clearCompileCache } from './ssr/compile.ts'
export { getServerModule, clearServerModule } from './ssr/server-registry.ts'
export { moduleServer, transformModule } from './ssr/module-server.ts'
export { streamResponse, readStream } from './ssr/stream.ts'
export type { StreamOpts } from './ssr/stream.ts'

// ── React client hooks (usage: import { useCtx } from '@weifuwujs/react') ──
export { useWebsocket } from './ssr/use-websocket.ts'
export type { UseWebsocketOptions, UseWebsocketReturn } from './ssr/use-websocket.ts'
export { useAction } from './ssr/use-action.ts'
export type { UseActionOptions, UseActionReturn } from './ssr/use-action.ts'
export { Link, useNavigate, navigate, useNavigating, addInterceptor } from './ssr/client-router.ts'
export { useCtx, setCtx, addCtxRebuilder, useLoaderData } from './ssr/tsx-context.ts'
export type { PageContext } from './ssr/tsx-context.ts'
export { createStore, useFetch, useQueryState } from './ssr/client-state.ts'
export type { StoreApi } from './ssr/client-state.ts'
export { useLocale } from './ssr/client-locale.ts'
export { useTheme, applyTheme } from './ssr/client-theme.ts'
export { useFlashMessage } from './ssr/use-flash-message.ts'
export { useAgentStream } from './ssr/use-agent-stream.ts'
export type {
  UseAgentStreamOptions,
  UseAgentStreamReturn,
  AgentStreamState,
} from './ssr/use-agent-stream.ts'
