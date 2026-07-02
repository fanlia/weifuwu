/**
 * html() — Deprecated. Use h() instead.
 *
 * ```ts
 * // Before:
 * html`<button @click="${fn}">${text}</button>`
 *
 * // After:
 * h('button', { onclick: fn }, text)
 * ```
 *
 * Kept as a re-export alias for backward compatibility.
 */
export { h as html } from './h.ts';
