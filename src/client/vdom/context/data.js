/**
 * vdom context — DataPipe 实现（数据管道——组件工厂取数的唯一异步边界）
 *
 * 契约（AGENTS §3.4——ctx.data）：
 * - **缓存 + 并发合并**：同 key 并发 get → 同一 promise（重复执行零成本——
 *   组件工厂 N 实例同 key 取数合并）
 * - **key 约定即 URL**（`/api/posts/1`）——天然唯一——key 必须含数据维度
 *   （route params、userId）
 * - **三场景**（SSR 真 fetch / hydration 种子同步命中 / SPA 未命中触发
 *   fetcher——**无 hydration 决策后**：preload/seed 保留为 SSR 种子通道——
 *   客户端接管时同步命中避免二次 fetch）
 * - **失败缓存**：reject 的 promise 缓存——显式 invalidate(key) 重试
 *   （默认失败不重试——诚实语义）
 * - 未命中且无 fetcher → 默认 fetch(key)（key = URL——JSON 解析）
 */
export function createDataPipe() {
    const cache = new Map();
    /** 种子数据（hydration 预热 / SSR 收集——key → 值） */
    let seedData = {};
    return {
        get(key, fetcher) {
            const existing = cache.get(key);
            if (existing)
                return existing;
            // 未命中——并发合并（同 key 共享同一 promise）
            const p = (async () => {
                // 种子优先（hydration 预热——同步命中——零二次 fetch）
                if (key in seedData)
                    return seedData[key];
                if (fetcher)
                    return fetcher();
                // 默认 fetch（key = URL——SPA 场景）
                const res = await fetch(key);
                if (!res.ok)
                    throw new Error(`[vdom] ctx.data 请求失败 ${res.status}: ${key}`);
                return res.json();
            })();
            // 失败缓存（显式 invalidate 重试——默认失败缓存不重试）
            cache.set(key, p);
            return p;
        },
        set(key, value) {
            cache.set(key, Promise.resolve(value));
        },
        has(key) {
            return cache.has(key);
        },
        preload(seed) {
            seedData = { ...seedData, ...seed };
        },
        invalidate(key) {
            cache.delete(key);
        },
        seed() {
            return seedData;
        },
    };
}
