export type UrlInterceptor = (url: URL) => boolean | Promise<boolean>;
export declare function addInterceptor(fn: UrlInterceptor): void;
export declare function runInterceptors(url: URL): Promise<boolean>;
