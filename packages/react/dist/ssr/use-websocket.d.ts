export type UseWebsocketOptions = {
    onMessage?: (data: string) => void;
    reconnect?: boolean | {
        maxRetries?: number;
        delay?: number;
    };
    protocols?: string | string[];
    enabled?: boolean;
};
export type UseWebsocketReturn = {
    send: (data: string | ArrayBuffer | Blob) => void;
    close: () => void;
    readyState: number;
    lastMessage: string | null;
    reconnect: () => void;
};
export declare function useWebsocket(url: string | URL | (() => string | URL | null), options?: UseWebsocketOptions): UseWebsocketReturn;
