import { type GraphQLSchema } from 'graphql';
import type { Context } from './types.ts';
import { Router } from './core/router.ts';
export interface GraphQLOptions {
    schema: string | GraphQLSchema;
    rootValue?: any;
    resolvers?: any;
    context?: (req: Request, ctx: Context) => Record<string, any> | Promise<Record<string, any>>;
    graphiql?: boolean;
    /** Max query depth (nesting). Default: 10. Set 0 to disable. */
    maxDepth?: number;
    /** Execution timeout in ms. Default: 30_000. */
    timeout?: number;
}
export type GraphQLHandler = (req: Request, ctx: Context) => GraphQLOptions | Promise<GraphQLOptions>;
export declare function graphql(handler: GraphQLHandler): Router;
