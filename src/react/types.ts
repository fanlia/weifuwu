import type { Context } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    /**
     * Render the page matching the current request URL from a directory.
     *
     * Scans `dir` for `page.tsx` files, discovers nested `layout.tsx`,
     * auto-compiles Tailwind CSS (`globals.css`), auto-generates client
     * bundle, and returns a complete HTML response.
     *
     * @example
     * ```ts
     * app.get('/*', async (req, ctx) => ctx.render('./ui'))
     * ```
     */
    render(dir: string): Promise<Response>
  }
}
