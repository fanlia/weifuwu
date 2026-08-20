import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

/**
 * vitest — client 测试（真实浏览器——playwright 驱动——无 jsdom）
 *
 * 架构（AGENTS §7——2026-12 决策）：
 * - src/client DOM 测试跑**真实浏览器**（vitest browser project +
 *   playwright chromium）——删除 jsdom/testBrowser——测试直接用浏览器全局
 *   document/window（uiServe 不再注入 browser）
 * - office（纯编解码逻辑——无 DOM——依赖 node 专属 API zlib/Buffer）跑
 *   vitest node project（runner 仍 vitest——非 node:test）
 * - 需要 HTTP 取数（ctx.data/useChat/api）的测试：globalSetup（node 进程）
 *   起 fixture server（src/server 的 serve/Router 组件——真实 TCP）——
 *   provide baseUrl → 测试 inject('baseUrl')——禁止手搓 fetch mock
 * - node:test 只用于 src/server（npm run test:server）——两端分离
 */
export default defineConfig({
  test: {
    globalSetup: ['./src/client/test/global-setup.ts'],
    setupFiles: ['./src/client/test/browser-setup.ts'],
    projects: [
      {
        test: {
          name: 'browser',
          include: ['src/client/**/*.test.ts', '!src/client/office/**'],
          globalSetup: ['./src/client/test/global-setup.ts'],
          setupFiles: ['./src/client/test/browser-setup.ts'],
          browser: {
            enabled: true,
            provider: playwright({}),
            headless: true,
            screenshotFailures: false,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        test: {
          name: 'node',
          include: ['src/client/office/**/*.test.ts', 'src/cli/home-flash.test.ts'],
        },
      },
    ],
  },
})
