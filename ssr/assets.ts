/**
 * @deprecated Use {@link wfuwAssets} from `weifuwu` instead.
 *
 * `assetRouter()` and `assetScripts()` have been replaced by `wfuwAssets()`
 * which serves the weifuwu-ui frontend runtime (zero external dependencies).
 *
 * Migration:
 * ```ts
 * // Old
 * import { assetRouter, assetScripts } from 'weifuwu'
 * app.use('/', assetRouter())
 * // In layout: ${assetScripts()}
 *
 * // New
 * import { wfuwAssets } from 'weifuwu'
 * app.use('/', wfuwAssets())
 * // In layout: <script src="/__wfw/js/weifuwu-ui.js">
 * ```
 */
import { wfuwAssets } from './ui/assets.ts'
import { raw, type RawString } from './html.ts'

/** @deprecated Use {@link wfuwAssets} instead. */
export function assetRouter() {
  // eslint-disable-next-line no-console
  console.warn('[weifuwu] assetRouter() is deprecated. Use wfuwAssets() instead.')
  return wfuwAssets()
}

/** @deprecated Use `<script src="/__wfw/js/weifuwu-ui.js">` instead. */
export function assetScripts(): RawString {
  // eslint-disable-next-line no-console
  console.warn('[weifuwu] assetScripts() is deprecated. Use weifuwu-ui.js directly.')
  return raw(`
<script src="/__wfw/js/weifuwu-ui.js"></script>
<link rel="stylesheet" href="/__wfw/css/weifuwu-ui.css">
`)
}
