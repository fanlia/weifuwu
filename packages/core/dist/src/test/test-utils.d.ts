import type { Context, Handler, SqlClient } from '../types.ts';
import { Router } from '../core/router.ts';
import { WebSocket as WSWebSocket } from 'ws';
export interface TestResponse {
    readonly status: number;
    readonly headers: Headers;
    json<T = unknown>(): Promise<T>;
    text(): Promise<string>;
}
export declare class TestRequest {
    private headers;
    private ctxMixin;
    private bodyData;
    private app;
    private method;
    private path;
    constructor(app: TestApp, method: string, path: string);
    /** Set a request header */
    header(name: string, value: string): this;
    /** Mix properties into ctx (simulating middleware injection) */
    with(mixin: Partial<Context>): this;
    /** Shortcut: set ctx.user */
    withUser(user: unknown): this;
    /** Shortcut: set ctx.tenant */
    withTenant(tenant: {
        id: string;
        name: string;
        role: string;
    }): this;
    /** Set JSON request body */
    body(data: unknown): this;
    /** Set raw text body */
    rawBody(data: string): this;
    /** Send the request and return the response */
    send(): Promise<TestResponse>;
}
export declare class TestApp {
    private router;
    private wsServer;
    private wsConnections;
    constructor();
    /**
     * Register a WebSocket handler.
     */
    ws(path: string, handler: import('../core/router.ts').WebSocketHandler): this;
    /** Get the raw Router (for advanced use). */
    get _router(): Router;
    /** Add global middleware */
    use(mw: any): this;
    /** Register a GET route — supports route-level middleware via spread args. */
    get(path: string, ...args: any[]): this;
    /** Register a POST route. */
    post(path: string, ...args: any[]): this;
    /** Register a PUT route. */
    put(path: string, ...args: any[]): this;
    /** Register a PATCH route. */
    patch(path: string, ...args: any[]): this;
    /** Register a DELETE route. */
    delete(path: string, ...args: any[]): this;
    /** Start building a GET request */
    getReq(path: string): TestRequest;
    /** Start building a POST request */
    postReq(path: string): TestRequest;
    /** Start building a PUT request */
    putReq(path: string): TestRequest;
    /** Start building a PATCH request */
    patchReq(path: string): TestRequest;
    /** Start building a DELETE request */
    deleteReq(path: string): TestRequest;
    /** Get the underlying handler (for advanced usage) */
    handler(): Handler;
    /** Start building a WebSocket connection to the given path. */
    wsReq(path: string): TestWSRequest;
    /**
     * Internal: ensure HTTP server is running for WebSocket connections.
     * Starts on a random port.
     */
    _ensureServer(): Promise<string>;
    /**
     * Internal: register a WS connection for cleanup.
     */
    _trackConnection(conn: TestWSConnection): void;
    /**
     * Cleanup all WebSocket connections and stop the server.
     */
    close(): Promise<void>;
}
/** Start building a WebSocket test connection. */
export declare class TestWSRequest {
    private app;
    private path;
    private _timeout;
    constructor(app: TestApp, path: string);
    /** Set the timeout for operations (default: 5000ms). */
    timeout(ms: number): this;
    /**
     * Connect to the WebSocket endpoint.
     * Starts a real HTTP server (random port) if not already running.
     */
    connect(): Promise<TestWSConnection>;
}
/**
 * A connected WebSocket for testing.
 *
 * ```ts
 * const conn = await app.wsReq('/echo').connect()
 * conn.send('hello')
 * const msg = await conn.receive()
 * assert.equal(msg, 'hello')
 * conn.close()
 * ```
 */
export declare class TestWSConnection {
    private ws;
    private _timeout;
    private messageQueue;
    private resolveQueue;
    private _closed;
    constructor(ws: WSWebSocket, timeout?: number);
    /** Send a text message. */
    send(data: string): void;
    /** Send a JSON message. */
    json(data: unknown): void;
    /**
     * Wait for the next message. Returns the raw text.
     * Throws on timeout or if the connection is closed.
     */
    receive(timeout?: number): Promise<string>;
    /** Wait for the next message and parse as JSON. */
    receiveJson<T = unknown>(): Promise<T>;
    /**
     * Assert that no message is received within the given silence period.
     * Useful for verifying that something did NOT happen.
     */
    expectSilent(ms: number): Promise<void>;
    /** Close the connection. */
    close(): void;
    /** Whether the connection is closed. */
    get closed(): boolean;
}
/** Create a new test app */
export declare function testApp(): TestApp;
/**
 * Result of createTestDb().
 */
export interface TestDb {
    /** Tagged-template SQL client connected to the test database. */
    sql: SqlClient;
    /** Connection URL of the test database. */
    url: string;
    /** Schema name used for this test session. */
    schema: string;
    /** Destroy the test database (drop schema). */
    destroy: () => Promise<void>;
}
/**
 * Create an isolated test database schema for integration testing.
 *
 * Uses PostgreSQL schemas for isolation — no separate database needed.
 * Each call creates a unique schema under the same database.
 *
 * ```ts
 * const db = await createTestDb()
 * await db.sql`CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT)`
 * // ... run tests ...
 * await db.destroy()  // drops the schema
 * ```
 *
 * Uses `TEST_DATABASE_URL` or `DATABASE_URL` env var.
 */
export declare function createTestDb(options?: {
    /** Database URL. Default: TEST_DATABASE_URL or DATABASE_URL. */
    url?: string;
    /** Schema name. Default: auto-generated 'test_<timestamp>_<random>'. */
    schema?: string;
}): Promise<TestDb>;
/**
 * Run a test callback within an isolated transaction that is rolled back
 * after completion. This provides the fastest isolation — no cleanup needed.
 *
 * ```ts
 * await withTestDb(async (sql) => {
 *   await sql`INSERT INTO users ...`
 *   // All changes are rolled back after this callback returns
 * })
 * ```
 *
 * @param optionsOrFn Either a URL string or options object, or the callback directly.
 * @param fn Async callback receiving a tagged-template sql client.
 */
export declare function withTestDb(optionsOrFn: string | {
    url?: string;
} | ((sql: SqlClient) => Promise<void>), fn?: (sql: SqlClient) => Promise<void>): Promise<void>;
