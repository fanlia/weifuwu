type SetPartial<T> = Partial<T> | ((prev: T) => Partial<T>);
export interface StoreApi<T> {
    (): T;
    <S>(selector: (state: T) => S): S;
    getState: () => T;
    setState: (partial: SetPartial<T>) => void;
    subscribe: (listener: () => void) => () => void;
}
export declare function createStore<T extends Record<string, unknown>>(initial: T): StoreApi<T>;
interface UseFetchResult<T> {
    data: T | undefined;
    error: Error | undefined;
    loading: boolean;
    mutate: (data?: T) => Promise<void>;
}
interface UseFetchOptions<T> {
    fallback?: T;
    ttl?: number;
}
export declare function useFetch<T = unknown>(url: string | null, options?: UseFetchOptions<T>): UseFetchResult<T>;
export declare function useQueryState(key: string, defaultValue?: string): [string, (val: string | ((prev: string) => string)) => void];
export {};
