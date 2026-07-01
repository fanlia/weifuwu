/**
 * Cron expression parsing utilities (moved from cron-utils.ts).
 * Used internally by queue for scheduled job execution.
 *
 * All functions operate in local timezone.
 */
export declare function parsePattern(pattern: string): Set<number>[];
export declare function matches(fields: Set<number>[], date: Date): boolean;
export declare function cronNext(expr: string, from?: Date): number;
