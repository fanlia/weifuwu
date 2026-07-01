/**
 * @deprecated weifuwu has been split into scoped packages.
 *
 * Update your imports:
 *   import { serve } from 'weifuwu'           → import { serve } from '@weifuwujs/core'
 *   import { ssr, theme } from 'weifuwu'      → import { ssr, theme } from '@weifuwujs/react'
 *
 * The 'weifuwu' package is a backward-compatibility alias and
 * will receive no new features. Migrate to '@weifuwujs/core'.
 */

if (!process.env.WEIFUWU_SUPPRESS_DEPRECATION) {
  process.emitWarning(
    [
      `'weifuwu' is deprecated. Use scoped packages instead:`,
      `  import { serve } from 'weifuwu'        →  import { serve } from '@weifuwujs/core'`,
      `  import { ssr } from 'weifuwu'           →  import { ssr } from '@weifuwujs/react'`,
      `  import { aiProvider } from 'weifuwu'    →  npm install ai  (use vercel/ai-sdk directly)`,
      `Set WEIFUWU_SUPPRESS_DEPRECATION=1 to silence this warning.`,
    ].join('\n'),
    'DeprecationWarning',
    'WEIFUWU_DEP001',
  )
}

export * from '@weifuwujs/core'
