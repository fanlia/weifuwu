/**
 * Signal system — ref, computed, effect
 *
 * ref = reactive value container
 * computed = derived value (readonly ref, subscribable)
 * effect = auto-tracking side effect with proper cleanup
 */
type EffectFn = () => void;
export declare class Signal<T = unknown> {
    #private;
    constructor(value: T);
    get value(): T;
    set value(newVal: T);
    peek(): T;
    _addSub(fn: EffectFn): void;
    _removeSub(fn: EffectFn): void;
}
export declare class Computed<T = unknown> {
    #private;
    constructor(fn: () => T);
    get value(): T;
    peek(): T;
    _addSub(fn: EffectFn): void;
    _removeSub(fn: EffectFn): void;
}
/**
 * Batch multiple signal changes into a single update cycle.
 *
 * Useful when changing multiple signals at once to avoid
 * intermediate re-renders.
 *
 * ```ts
 * batch(() => {
 *   firstName.value = 'Jane'
 *   lastName.value = 'Smith'
 * })
 * // DOM updates only once, with both changes applied
 * ```
 */
export declare function batch(fn: () => void): void;
/**
 * Create a reactive reference.
 */
export declare function ref<T>(initial: T): Signal<T>;
/**
 * Create a derived reactive value.
 * Re-evaluates when any dependency changes.
 * Supports _addSub / _removeSub for direct subscription.
 */
export declare function computed<T>(fn: () => T): Computed<T>;
/**
 * Run a function and automatically re-run when any Signal read inside it changes.
 *
 * Tracks all Signal/Computed dependencies and unsubscribes on cleanup.
 * Returns a dispose function that:
 * 1. Runs the effect's cleanup callback
 * 2. Unsubscribes from all tracked Signal/Computed dependencies
 */
export declare function effect(fn: () => (() => void) | void): () => void;
export {};
