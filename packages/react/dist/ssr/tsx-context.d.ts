export interface PageContext {
    params: Record<string, string>;
    query: Record<string, string>;
    user: {
        id?: string;
    };
    parsed: Record<string, unknown>;
    theme?: {
        value: string;
        set?: (value: string, loc?: string) => Response;
    };
    i18n?: {
        locale: string;
        messages?: Record<string, unknown>;
        t: (key: string, params?: Record<string, string>, fallback?: string) => string;
    };
    flash?: {
        value?: string;
        set?: (data: any, loc?: string) => Response;
    };
    loaderData: Record<string, unknown>;
    env: Record<string, string>;
}
type Rebuilder = (value: Partial<PageContext>) => Partial<PageContext> | null;
export declare function addCtxRebuilder(fn: Rebuilder): void;
/** @internal Injected by ssr.ts for async-safe context isolation */
export declare function __registerAls(getStore: () => PageContext | undefined): void;
declare function setCtx(value: Partial<PageContext>): void;
declare function useCtx(): PageContext;
export declare function useLoaderData<T = Record<string, unknown>>(): T;
export declare const TsxContext: import("react").Context<PageContext>;
export { useCtx, setCtx };
