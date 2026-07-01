import { Router, type WebSocketHandler } from '@weifuwujs/core';
export declare function broadcastReload(): void;
export declare function liveWs(): WebSocketHandler;
export declare function liveRouter(_dir: string): Router;
export declare function liveWatcher(dir: string): {
    close: () => void;
};
