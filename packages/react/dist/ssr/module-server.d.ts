import { Router } from '@weifuwujs/core';
export declare function clearModuleCache(filePath?: string): void;
export declare function transformModule(absPath: string, root: string, mountPath?: string): Promise<{
    url: string;
    code: string;
}>;
export declare function moduleServer(opts: {
    root: string | string[];
}): Router;
