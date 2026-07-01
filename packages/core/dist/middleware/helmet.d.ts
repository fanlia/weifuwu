import type { Middleware, Context } from '../types.ts';
/** Options for {@link helmet}. Set any header to `false` to omit it. */
export interface HelmetOptions {
    /** `Content-Security-Policy` header value. */
    contentSecurityPolicy?: string | false;
    /** `Cross-Origin-Embedder-Policy` header value. */
    crossOriginEmbedderPolicy?: string | false;
    /** `Cross-Origin-Opener-Policy` header value. */
    crossOriginOpenerPolicy?: string | false;
    /** `Cross-Origin-Resource-Policy` header value. */
    crossOriginResourcePolicy?: string | false;
    /** `Origin-Agent-Cluster` header value. */
    originAgentCluster?: string | false;
    /** `Referrer-Policy` header value. */
    referrerPolicy?: string | false;
    /** `Strict-Transport-Security` header value. */
    strictTransportSecurity?: string | false;
    /** `X-Content-Type-Options` header value. */
    xContentTypeOptions?: string | false;
    /** `X-DNS-Prefetch-Control` header value. */
    xDnsPrefetchControl?: string | false;
    /** `X-Download-Options` header value. */
    xDownloadOptions?: string | false;
    /** `X-Frame-Options` header value. */
    xFrameOptions?: string | false;
    /** `X-Permitted-Cross-Domain-Policies` header value. */
    xPermittedCrossDomainPolicies?: string | false;
    /** `X-XSS-Protection` header value. */
    xXssProtection?: string | false;
    /** `Permissions-Policy` header value. */
    permissionsPolicy?: string | false;
}
export declare function helmet(options?: HelmetOptions): Middleware<Context, Context>;
