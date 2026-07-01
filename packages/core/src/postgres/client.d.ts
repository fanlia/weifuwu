import type { PostgresOptions, PostgresClient } from './types.ts';
/** Migration tracking table name. Created automatically on first migrate(). */
export declare const MIGRATIONS_TABLE = "_weifuwu_migrations";
export declare function postgres(opts?: string | PostgresOptions): PostgresClient;
