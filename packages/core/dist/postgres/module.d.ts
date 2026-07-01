import type { SqlClient, Closeable } from '../types.ts';
import type { PostgresClient } from './types.ts';
export declare class PgModule implements Closeable {
    protected sql: SqlClient;
    protected pg: PostgresClient;
    constructor(pg: PostgresClient);
    transaction<T>(fn: (sql: SqlClient) => Promise<T>, retryOpts?: {
        maxRetries?: number;
    }): Promise<T>;
    migrate(): Promise<void>;
    close(): Promise<void>;
}
