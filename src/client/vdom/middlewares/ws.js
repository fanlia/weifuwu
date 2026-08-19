/**
 * vdom middlewares — ws（WebSocket 客户端——ctx.ws 注入面）
 *
 * 设计：WebSocket 构造经 opts 注入（jsdom 无 WS——测试 mock——
 * 零全局直接访问）；onMessage 订阅（返回退订）；unmount 关闭。
 */
/** 创建 ws 客户端（每 serve 实例独立） */
export function ws(opts = {}) {
    const WsCtor = opts.WebSocketCtor ?? (globalThis.WebSocket);
    let sock = null;
    const subs = new Set();
    const handleMessage = (e) => {
        let data = e.data;
        if (typeof e.data === 'string') {
            try {
                data = JSON.parse(e.data);
            }
            catch { /* 原样 */ }
        }
        for (const cb of [...subs])
            cb(data);
    };
    return {
        connect(url) {
            sock?.close();
            if (!WsCtor)
                return; // 环境无 WS——静默（测试不连）
            sock = new WsCtor(url);
            sock.onmessage = handleMessage;
            sock.onclose = () => { sock = null; };
        },
        send(data) {
            sock?.send(typeof data === 'string' ? data : JSON.stringify(data));
        },
        onMessage(cb) {
            subs.add(cb);
            return () => { subs.delete(cb); };
        },
        close() {
            sock?.close();
            sock = null;
        },
    };
}
