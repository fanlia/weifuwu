/** Options for setting a cookie. All fields map to standard Set-Cookie attributes. */
export interface CookieOptions {
    domain?: string;
    path?: string;
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
}
/** Parse cookies from a Request's `Cookie` header.
 *
 * @example
 * ```ts
 * const cookies = getCookies(req)
 * console.log(cookies.session_id) // value or undefined
 * ``` */
export declare function getCookies(req: Request): Record<string, string>;
/** Set a cookie on a Response.
 *
 * Appends a `Set-Cookie` header to the existing response headers.
 * Returns a new Response with the added header.
 *
 * @example
 * ```ts
 * const res = new Response('ok')
 * return setCookie(res, 'session', token, { httpOnly: true, path: '/' })
 * ``` */
export declare function setCookie(res: Response, name: string, value: string, options?: CookieOptions): Response;
/** Delete a cookie by setting `Max-Age=0`.
 *
 * @example
 * ```ts
 * return deleteCookie(res, 'session')
 * ``` */
export declare function deleteCookie(res: Response, name: string, options?: Omit<CookieOptions, 'maxAge'>): Response;
