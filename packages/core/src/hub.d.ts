import type { Redis, WebSocket, Closeable } from './types.ts';
/** Options for {@link createHub}. */
export interface HubOptions {
    /** Optional Redis client for cross-process pub/sub broadcast. */
    redis?: Redis;
    /** Key prefix for Redis channels (default: `'hub:'`). */
    prefix?: string;
}
/**
 * In-memory (and optionally Redis-backed) pub/sub hub for WebSocket rooms.
 *
 * Used internally by the WebSocket handler to implement `ctx.ws.join()` / `ctx.ws.sendRoom()`. */
export interface Hub extends Closeable {
    /** Subscribe a WebSocket to a room/group. */
    join(key: string, ws: WebSocket): void;
    /** Unsubscribe a WebSocket from all rooms. */
    leave(ws: WebSocket): void;
    /** Send a JSON message to all members of a room. */
    broadcast(key: string, data: unknown): void;
    /** Close the hub, disconnect Redis subscribers, clear all rooms. */
    close(): Promise<void>;
}
/**
 * Create a pub/sub hub for WebSocket room management.
 *
 * In-memory by default. Pass `redis` to enable cross-process broadcasting.
 *
 * ```ts
 * import { createHub } from 'weifuwu'
 *
 * const hub = createHub()
 * hub.join('room:general', ws)
 * hub.broadcast('room:general', { type: 'chat', text: 'Hello' })
 * ```
 */
export declare function createHub(opts?: HubOptions): Hub;
