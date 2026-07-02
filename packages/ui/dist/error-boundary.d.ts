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
export interface ErrorBoundaryAttrs {
    /** Optional custom fallback UI. Receives the error as argument. */
    fallback?: (error: Error) => Node;
    children?: Node | Node[];
}
/**
 * Register a global error handler for uncaught render errors.
 * Useful for logging or showing a toast.
 */
export declare function onRenderError(handler: (err: Error) => void): void;
/**
 * Wrap a template function with error handling.
 * Used internally by reactiveRender.
 */
export declare function wrapWithErrorBoundary(template: () => Node, fallback?: (error: Error) => Node): () => Node;
/**
 * Wrap a template inside an error boundary explicitly.
 * Usage:
 * ```ts
 * const safeTemplate = errorBoundary(MyTemplate, (err) => h('p', null, 'Error: ' + err.message))
 * reactiveRender(container, safeTemplate)
 * ```
 */
export declare function errorBoundary(template: () => Node, fallback?: (error: Error) => Node): () => Node;
