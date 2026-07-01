export declare const OUT_DIR = ".weifuwu/ssr";
export declare function id(s: string): string;
export declare function clearCompileCache(): void;
export declare function compileTsx(path: string): Promise<any>;
/**
 * Dev hot-reload: per-file transformSync (~0.5ms) + shared vm context.
 */
export declare function compileTsxDev(path: string): any;
/** Auto-select dev (registry+vm) or prod (ESM + import) compilation */
export declare function compile(path: string): Promise<any>;
export declare let vendorHash: string;
/** Build a single vendor bundle containing all needed vendor modules */
export declare function compileVendorBundle(): Promise<string>;
