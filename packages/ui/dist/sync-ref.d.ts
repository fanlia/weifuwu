/**
 * syncRef() — ref + URL 双向绑定
 *
 * 将 ref 与浏览器 URL 同步，实现客户端路由。
 *
 * ```ts
 * const route = syncRef('/')
 * route.value = '/about'     // → URL 更新，视图切换
 * ```
 */
import { type Signal } from './signal.ts';
export interface SyncRefOptions {
    /** URL 查询参数名。不传则绑定到 pathname */
    key?: string;
    /** 是否使用 replaceState 代替 pushState (默认 false) */
    replace?: boolean;
}
/**
 * 创建一个与浏览器 URL 双向绑定的 ref。
 */
export declare function syncRef(initial?: string, options?: SyncRefOptions): Signal<string>;
