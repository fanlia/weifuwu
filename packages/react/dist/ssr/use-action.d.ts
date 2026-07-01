export interface UseActionOptions<T = any> {
    method?: string;
    headers?: Record<string, string>;
    onSuccess?: (data: T) => void;
    onError?: (err: Error) => void;
}
export interface UseActionReturn<T = any> {
    submit: (body?: any) => Promise<T | undefined>;
    data: T | null;
    error: Error | null;
    pending: boolean;
    reset: () => void;
}
export declare function useAction<T = any>(url: string | URL, options?: UseActionOptions<T>): UseActionReturn<T>;
