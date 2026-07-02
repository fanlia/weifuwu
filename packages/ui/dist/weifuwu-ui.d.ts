/**
 * @weifuwujs/ui — Browser entry
 *
 * Exposed as `weifuwu` global (IIFE).
 * Usage:
 *   <script src="/_ui/weifuwu-ui.js"></script>
 *   <script>
 *     const { ref, h, render } = weifuwu
 *   </script>
 */
import { ref, computed, effect, batch, Signal, Computed } from './signal.ts';
import { h, text, fragment, triggerMount, when, each } from './h.ts';
import { bind } from './bind.ts';
import { render, reactiveRender } from './render.ts';
export declare const theme: {
    value: Signal<any>;
    resolved: Computed<any>;
    toggle(): void;
    set(val: string): void;
};
export declare const i18n: {
    locale: Signal<any>;
    messages: Signal<any>;
    t(key: string, params?: Record<string, string>): string;
    set(locale: string): void;
};
export declare const toast: {
    list: Signal<{
        id: number;
        message: string;
        type: string;
    }[]>;
    _nextId: number;
    show(message: string, type?: string, duration?: number): void;
    dismiss(id: number): void;
    success(msg: string): void;
    error(msg: string): void;
    info(msg: string): void;
    warning(msg: string): void;
};
export declare const modal: {
    open: Signal<string | null>;
    show(id: string): void;
    hide(id?: string): void;
};
export { ref, computed, effect, batch, Signal, Computed };
export { component, signal } from './component.ts';
export { syncRef } from './sync-ref.ts';
export { h, text, fragment, triggerMount, when, each };
export { bind };
export { render, reactiveRender };
export { errorBoundary, onRenderError } from './error-boundary.ts';
