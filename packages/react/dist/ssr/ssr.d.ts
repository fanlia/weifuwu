import { Router } from '@weifuwujs/core';
export interface RouteEntry {
    path: string;
    file: string;
}
export interface SsrModule extends Router {
    close?: () => void;
    pages?: () => RouteEntry[];
}
export declare function ssr(opts: {
    dir: string;
}): SsrModule;
