/**
 * vdom core — uiServe（渲染落地——公共面——双端一体）
 *
 * 设计（design/vdom-plan.md §3/§4）：
 * - UIRouter 唯一应用入口——uiServe(router, { root, browser }) 收养渲染
 * - 渲染循环：初始 URL resolve → Response（command 事件流）→ patch
 * - **ctx.render() = 重新渲染**（事件触发/fetch 结束/定时器回调的唯一入口）：
 *   重新 resolve（handler 重跑——registry 复用——组件工厂不重跑——
 *   renderFn 重调读最新状态）→ **新的 Response command 事件流** → 消费
 *   （patch 对照现有 DOM 节点——幂等——就地更新）
 * - 函数面传输：同进程共享函数表——编码时函数 → {$fn: n} 标记——
 *   解码时查表还原（事件绑定跨 Response 保持）
 *
 * 服务端面（SSR——同一 handler 同一 Response——body 经 commandToHtml()
 * TransformStream 流式吐 HTML）后续实现。
 */
import { frontRequest } from './router.ts';
import { commandToHtml, htmlDocument } from './html.ts';
import { CommandApplier } from './patch/index.ts';
import { renderToStream } from './build.ts';
import { diffStream } from './diff/index.ts';
import { createComponentRegistry, disposeAllComponents } from './node/component.ts';
import { createDataPipe } from '../context/data.ts';
/** 函数表还原（$fn 标记 → 函数——编码/解码同进程共享） */
export function reviveFn(fnTable) {
    return (k, v) => {
        if (v && typeof v === 'object' && typeof v.$fn === 'number') {
            return fnTable.get(v.$fn);
        }
        return v;
    };
}
/** NDJSON 命令流解析（行缓冲——命令可能跨 chunk——函数表还原） */
function commandReader(reader, fnTable) {
    const decoder = new TextDecoder();
    let buf = '';
    const revive = reviveFn(fnTable);
    const pump = async () => {
        while (true) {
            const nl = buf.indexOf('\n');
            if (nl >= 0) {
                const line = buf.slice(0, nl).trim();
                buf = buf.slice(nl + 1);
                if (line)
                    return { value: JSON.parse(line, revive), done: false };
                continue;
            }
            const { value, done } = await reader.read();
            if (done) {
                if (buf.trim()) {
                    const line = buf.trim();
                    buf = '';
                    return { value: JSON.parse(line, revive), done: false };
                }
                return { value: undefined, done: true };
            }
            buf += decoder.decode(value, { stream: true });
        }
    };
    return { [Symbol.asyncIterator]() { return { next: pump }; } };
}
/** 命令流编码（函数面 → {$fn: n}——函数表——同进程共享） */
export function encodeCommands(stream, fnTable) {
    const enc = new TextEncoder();
    // 函数 → 序号（WeakMap——同函数流内复用同序号——减少重复条目；
    // 渲染流消费完清表（fnTable.clear()——历史函数已解码到事件表——
    // $fn 仅传输层——跨流不需要——长会话零累积））
    const fnToId = new WeakMap();
    const mark = (k, v) => {
        if (typeof v === 'function') {
            const known = fnToId.get(v);
            if (known !== undefined)
                return { $fn: known };
            const n = fnTable.size + 1;
            fnTable.set(n, v);
            fnToId.set(v, n);
            return { $fn: n };
        }
        return v;
    };
    return stream.pipeThrough(new TransformStream({
        transform(cmd, controller) {
            controller.enqueue(enc.encode(JSON.stringify(cmd, mark) + '\n'));
        },
    }));
}
/** 函数表（serve 级共享——编码/解码同进程） */
export function createFnTable() {
    return new Map();
}
export function uiServe(router, opts) {
    const doc = opts.browser.document;
    const win = opts.browser.window;
    const rootEl = typeof opts.root === 'string'
        ? doc.querySelector(opts.root)
        : opts.root;
    if (!rootEl)
        throw new Error(`uiServe: root 未找到 — ${String(opts.root)}`);
    // ── serve 级单例（跨渲染保持——patch 幂等对照现有 DOM + 组件注册表复用） ──
    const fnTable = createFnTable();
    const registry = createComponentRegistry();
    const applier = new CommandApplier(rootEl, doc, registry);
    let req = frontRequest(win.location.pathname);
    /** 影子树（当前渲染的 vnode——diff 对照——精准增量命令流） */
    let currentTree = null;
    /** 渲染队列（用户决策 2026-12）：渲染期间发生的 render → push 入队——
     *  每次渲染完成 → shift 取队头继续——直到队列空——**确定性**：
     *  每个渲染请求最终执行（FIFO——先触发先执行——无丢失无合并歧义） */
    let rendering = false;
    let queue = [];
    let drainPromise = null;
    /** 渲染循环（ctx.render 同 URL 重渲染 / navigate 新 URL——同一机制）
     *  **队列确定性**：渲染中触发 → push 入队（FIFO）——当前渲染完成 →
     *  shift 取队头继续——直到队列空；渲染中 await 返回 drainPromise
     *  （精确等待全部队列执行完——含后续入队的渲染）
     *  **redirect 消费**：handler 返回 3xx + Location → replaceState（重定向
     *  语义——不 push 历史）+ 渲染目标 URL（不渲染空响应）
     *  **错误传播**：工厂 reject → 本轮渲染中断（console.error——CS-03——
     *  事件回调不 throw）——**队列继续**（下一个渲染目标自愈——不丢弃） */
    /** afterRender 队列（渲染完成信号——hook 注册等挂载后动作） */
    let afterRenderFns = [];
    const runRender = async (initial) => {
        let target = initial;
        rendering = true;
        try {
            while (true) {
                req = target;
                const res = await router.resolve(req, ctx);
                // **redirect 消费（3xx + Location → replaceState + 渲染目标）**
                const loc = res.headers.get('Location');
                if (res.status >= 300 && res.status < 400 && loc) {
                    win.history.replaceState({}, '', loc);
                    target = frontRequest(loc);
                    continue; // 不渲染空响应——直接渲染目标 URL
                }
                if (res.body) {
                    for await (const cmd of commandReader(res.body.getReader(), fnTable)) {
                        applier.apply(cmd);
                    }
                }
                // 渲染完成 → 取队头继续（FIFO——先触发先执行）
                if (queue.length > 0) {
                    target = queue.shift();
                }
                else {
                    break;
                }
            }
        }
        catch (e) {
            // 渲染错误（组件工厂 reject / 流消费异常）——中断本轮——队列继续
            // **影子树重置**：ReadableStream start reject 会丢弃已缓冲命令——
            // DOM 与影子树不一致——后续 diff 全部 no-op（静默失效）——
            // 重置后下次渲染走全量 build（create 幂等/insert 幂等/done.full
            // 清理——自愈完整）
            currentTree = null;
            console.error('[vdom] render:', e);
        }
        finally {
            // **渲染完成信号**：flush afterRender（hook 注册——元素已挂载）
            const fns = afterRenderFns;
            afterRenderFns = [];
            for (const fn of fns) {
                try {
                    fn();
                }
                catch (e) {
                    console.error('[vdom] afterRender:', e);
                }
            }
            rendering = false;
            drainPromise = null;
            // **函数表清理**：$fn 仅传输层（历史函数已解码到事件表/ref 表——
            // 跨流不需要）——消费完即清——长会话零累积
            fnTable.clear();
        }
    };
    const render = (target) => {
        if (rendering && drainPromise) {
            // 渲染中触发 → push 入队（确定性：每个请求最终执行）
            queue.push(target);
            return drainPromise; // await 全部队列执行完（含后续入队）
        }
        const p = runRender(target);
        drainPromise = p;
        return p;
    };
    /** 编程式导航（pushState + 渲染——popstate 语义） */
    const navigate = async (path) => {
        win.history.pushState({}, '', path);
        await render(frontRequest(path));
    };
    // ── ctx（render = 重新渲染唯一入口——事件/fetch/定时器回调） ──
    const ctx = {
        /** 重新渲染：重新 resolve（handler 重跑——registry 复用——工厂不重跑）→
         *  新的 Response command 事件流 → 消费（patch 对照现有 DOM——就地更新）
         *  **并发守卫**：渲染中触发 → 单槽位补跑——await 精确等待最终渲染 */
        async render() {
            await render(req);
        },
        /** 数据管道（组件工厂取数——唯一异步边界——缓存/并发合并/失败缓存） */
        data: createDataPipe(),
        /** 浏览器环境（注入的 window/document） */
        browser: opts.browser,
        /** serve 级卸载注册（unmount 时执行——组件外清理） */
        onUnmount(fn) {
            serveUnmounts.push(fn);
        },
        /** 渲染完成回调注册（hook 挂载后动作——元素已挂载） */
        afterRender(fn) {
            afterRenderFns.push(fn);
        },
        // 中间件注入面（可选——ctx.api/auth/ws/i18n——组件/页面消费）
        ...(opts.api ? { api: opts.api } : {}),
        ...(opts.auth ? { auth: opts.auth } : {}),
        ...(opts.ws ? { ws: opts.ws } : {}),
        ...(opts.i18n ? { i18n: opts.i18n } : {}),
        ...(opts.toast ? { toast: opts.toast } : {}),
    };
    // ── 页面作者渲染入口（vnode → Response 事件流——函数表编码） ──
    const renderCtx = ctx;
    renderCtx.stream = (vnode, init) => {
        // **diff 本质（2026-12）：精准生成需要 patch 的事件流**——
        // 有影子树 → diff（增量命令——counter 点击只发文本 setText）；
        // 无影子树（首帧）→ build 全量。
        // root 类型变化（导航/组件切换）→ **全量 build**（done.full 清理旧树）；
        // 同类型 → diff 精准
        if (!currentTree && rootEl.childNodes.length > 0) {
            // **SSR 接管**（无 hydration——首帧清 root 预置内容——SSR 首屏被
            // 新树原子替换——接管语义——home-flash 测试锁定）
            rootEl.innerHTML = '';
        }
        const stream = currentTree
            ? (currentTree.type !== vnode.type
                ? (() => {
                    // 整树替换（导航/root 组件切换）——**旧组件实例全部卸载**
                    //（onUnmounts 清理——否则 renderComponent 复用旧 rec——类型错位）
                    disposeAllComponents(registry);
                    return renderToStream(vnode, ctx, registry);
                })()
                : diffStream(currentTree, vnode, ctx, registry))
            : renderToStream(vnode, ctx, registry);
        currentTree = vnode; // 影子树更新（下次对照）
        return new Response(encodeCommands(stream, fnTable), {
            status: init?.status ?? 200,
            headers: init?.headers,
        });
    };
    // ── 链接拦截（同源 a[href] → 导航——外链/锚点不拦截） ──
    const onDocClick = (e) => {
        const target = e.target;
        const a = target?.closest?.('a[href]');
        if (!a)
            return;
        const href = a.getAttribute('href');
        if (!href || href.startsWith('http') || href.startsWith('#'))
            return;
        e.preventDefault();
        void navigate(href);
    };
    doc.addEventListener('click', onDocClick);
    // ── popstate（浏览器前进/后退 → 渲染当前 URL） ──
    const onPopstate = () => {
        void render(frontRequest(win.location.pathname));
    };
    win.addEventListener('popstate', onPopstate);
    const ready = (async () => {
        await render(req);
    })();
    const serveUnmounts = [];
    return {
        ready,
        navigate,
        unmount() {
            doc.removeEventListener('click', onDocClick);
            win.removeEventListener('popstate', onPopstate);
            applier.dispose(); // 事件代理根监听移除（资源释放完整）
            for (const fn of serveUnmounts.reverse()) {
                try {
                    fn();
                }
                catch (e) {
                    console.error('[vdom] unmount:', e);
                }
            }
            serveUnmounts.length = 0;
            rootEl.innerHTML = '';
        },
    };
}
/** 字节流 → 命令流（NDJSON 解码 TransformStream——服务端/跨进程消费） */
export function ndjsonDecode(fnTable) {
    const decoder = new TextDecoder();
    const revive = reviveFn(fnTable);
    let buf = '';
    return new TransformStream({
        transform(chunk, controller) {
            buf += decoder.decode(chunk, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.trim())
                    continue;
                controller.enqueue(JSON.parse(line, revive));
            }
        },
        flush(controller) {
            if (buf.trim())
                controller.enqueue(JSON.parse(buf.trim(), revive));
        },
    });
}
async function streamToString(stream) {
    const reader = stream.getReader();
    let out = '';
    while (true) {
        const { value, done } = await reader.read();
        if (done)
            break;
        out += value;
    }
    return out;
}
export async function uiSsr(router, url, opts = {}) {
    const fnTable = createFnTable();
    const req = frontRequest(url);
    const ctx = {
        /** 服务端渲染入口（vnode → Response 命令流——空函数表） */
        stream: (vnode, init) => {
            const stream = renderToStream(vnode, ctx, createComponentRegistry());
            return new Response(encodeCommands(stream, fnTable), { status: init?.status ?? 200 });
        },
        /** 数据管道（SSR 真 fetch——组件工厂取数） */
        data: createDataPipe(),
    };
    const res = await router.resolve(req, ctx);
    if (!res.body)
        return htmlDocument('', opts);
    const html = await streamToString(res.body.pipeThrough(ndjsonDecode(fnTable)).pipeThrough(commandToHtml()));
    return htmlDocument(html, opts);
}
