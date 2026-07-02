/**
 * weifuwuiAssets() — Serve client runtime as static files.
 *
 * Mount at /_ui to provide weifuwu-ui.css and weifuwu-ui.js.
 *
 * Usage:
 *   import { weifuwuiAssets } from '@weifuwujs/ui'
 *   app.mount('/_ui', weifuwuiAssets())
 */
import { Router } from '@weifuwujs/core';
export declare function weifuwuiAssets(): Router;
