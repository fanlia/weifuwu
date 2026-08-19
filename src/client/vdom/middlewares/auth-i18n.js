/**
 * vdom middlewares — auth/i18n（ctx.auth 令牌管理 + ctx.i18n 国际化）
 *
 * - auth：token 管理（get/set/headers 注入——logout——storage 经注入——
 *   默认内存——零全局 localStorage 直接访问）
 * - i18n：locale/messages——t(key, params) 插值——setLocale 切换
 */
/** 创建 auth 客户端（每 serve 实例独立） */
export function auth(opts = {}) {
    const key = opts.key ?? 'wf-auth-token';
    const scheme = opts.scheme ?? 'Bearer';
    const storage = opts.storage ?? { get: () => null, set: () => { } };
    return {
        getToken() {
            const v = storage.get(key);
            return v ? v : null; // 空字符串（logout）归一为 null
        },
        setToken(token) {
            if (token === null)
                storage.set(key, '');
            else
                storage.set(key, token);
        },
        headers() {
            const token = storage.get(key);
            return token ? { authorization: `${scheme} ${token}` } : {};
        },
        logout() {
            storage.set(key, '');
        },
    };
}
/** 创建 i18n（locale/messages——t 插值） */
export function i18n(opts) {
    let locale = opts.locale ?? Object.keys(opts.messages)[0] ?? 'default';
    return {
        get locale() {
            return locale;
        },
        setLocale(l) {
            locale = l;
        },
        t(key, params) {
            const dict = opts.messages[locale];
            let text = dict?.[key] ?? key;
            if (params) {
                for (const [k, v] of Object.entries(params)) {
                    text = text.replaceAll(`{${k}}`, String(v));
                }
            }
            return text;
        },
    };
}
