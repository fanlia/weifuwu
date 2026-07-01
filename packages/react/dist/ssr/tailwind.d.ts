import { Router, type Middleware } from '@weifuwujs/core';
export interface TailwindInjected {
    css: string;
    url: string;
}
declare module '@weifuwujs/core' {
    interface Context {
        tailwind?: TailwindInjected;
    }
}
export declare function addTailwindSource(dir: string): void;
export declare function tailwindContext(dir: string): Middleware;
export declare function tailwindRouter(dir: string): Router;
export declare function compileTailwindCss(cssPath: string, cssDir: string): Promise<string>;
