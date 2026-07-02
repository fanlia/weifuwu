/**
 * ErrorBoundary — catches render errors and shows a fallback UI.
 *
 * Prevents a single component crash from taking down the entire page.
 *
 * Usage:
 * ```ts
 * reactiveRender(container, () =>
 *   h(ErrorBoundary, { fallback: () => h('p', null, 'Something went wrong') },
 *     MyComponent()
 *   )
 * )
 * ```
 */

import { h } from './h.ts'

export interface ErrorBoundaryAttrs {
  /** Optional custom fallback UI. Receives the error as argument. */
  fallback?: (error: Error) => Node
  children?: Node | Node[]
}

let _errorHandler: ((err: Error) => void) | null = null

/**
 * Register a global error handler for uncaught render errors.
 * Useful for logging or showing a toast.
 */
export function onRenderError(handler: (err: Error) => void): void {
  _errorHandler = handler
}

/**
 * Wrap a template function with error handling.
 * Used internally by reactiveRender.
 */
export function wrapWithErrorBoundary(
  template: () => Node,
  fallback?: (error: Error) => Node,
): () => Node {
  return () => {
    try {
      return template()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      if (_errorHandler) _errorHandler(error)
      if (fallback) return fallback(error)
      return createDefaultErrorUI(error)
    }
  }
}

/**
 * Default error UI shown when no fallback is provided.
 */
function createDefaultErrorUI(error: Error): HTMLElement {
  const isDev = typeof location !== 'undefined' && location.hostname === 'localhost'

  return h('div', {
    style: 'padding: 24px; margin: 16px; border: 1px solid #fee2e2; border-radius: 8px; background: #fef2f2; font-family: system-ui, sans-serif;',
  },
    h('div', { style: 'color: #991b1b; font-size: 18px; font-weight: 600; margin-bottom: 8px;' }, 'Render Error'),
    h('div', { style: 'color: #dc2626; font-size: 14px; margin-bottom: 4px;' }, error.message),
    isDev ? h('pre', {
      style: 'margin-top: 12px; padding: 12px; background: #1e293b; color: #a0ffa0; border-radius: 6px; font-size: 12px; overflow-x: auto; white-space: pre-wrap;',
    }, error.stack || '') : null,
  )
}

/**
 * Wrap a template inside an error boundary explicitly.
 * Usage:
 * ```ts
 * const safeTemplate = errorBoundary(MyTemplate, (err) => h('p', null, 'Error: ' + err.message))
 * reactiveRender(container, safeTemplate)
 * ```
 */
export function errorBoundary(
  template: () => Node,
  fallback?: (error: Error) => Node,
): () => Node {
  return wrapWithErrorBoundary(template, fallback)
}
