/**
 * vdom browser — createClientBrowser（生产浏览器环境工厂）
 *
 * 设计：Browser 接口 = window/document 基座 + 组件消费面方法（AGENTS §5.5
 * 能力映射表——copyText/query/storage/scrollTop 等唯一入口——组件禁止
 * 直接访问 DOM 全局）。**惰性环境**（对齐 ui-dom——模块加载时可能无
 * window（SSR/测试 setup 前）——方法内 typeof 检查——setupJsdom/浏览器
 * 就绪后可用——不捕获创建时的 null）。
 */
/** 生产浏览器环境（惰性：方法内 typeof 检查——SSR/测试 setup 前安全） */
export function createClientBrowser() {
    const root = () => typeof document !== 'undefined' ? document.documentElement : null;
    const scroller = () => typeof document !== 'undefined' ? (document.scrollingElement ?? document.documentElement) : null;
    return {
        get window() { return (typeof window !== 'undefined' ? window : undefined); },
        get document() { return (typeof document !== 'undefined' ? document : undefined); },
        copyText(text) {
            if (typeof navigator !== 'undefined')
                void navigator.clipboard?.writeText(text);
        },
        downloadFile(filename, content, mime = 'text/plain') {
            try {
                const doc = typeof document !== 'undefined' ? document : null;
                if (!doc)
                    return false;
                const blob = new Blob([content], { type: mime });
                const url = URL.createObjectURL(blob);
                const a = doc.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
                return true;
            }
            catch {
                return false;
            }
        },
        activeElement: () => (typeof document !== 'undefined' ? document.activeElement : null),
        byId: (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null),
        query: (sel) => (typeof document !== 'undefined' ? document.querySelector(sel) : null),
        queryAll: (sel) => (typeof document !== 'undefined' ? document.querySelectorAll(sel) : null),
        createElement: (tag) => (typeof document !== 'undefined' ? document.createElement(tag) : null),
        createElementNS: (ns, tag) => (typeof document !== 'undefined' ? document.createElementNS(ns, tag) : null),
        createDocumentFragment: () => (typeof document !== 'undefined' ? document.createDocumentFragment() : null),
        createComment: (text) => (typeof document !== 'undefined' ? document.createComment(text) : null),
        createTextNode: (text) => (typeof document !== 'undefined' ? document.createTextNode(text) : null),
        addEventListener: (type, fn, options) => { if (typeof window !== 'undefined')
            window.addEventListener(type, fn, options); },
        removeEventListener: (type, fn, options) => { if (typeof window !== 'undefined')
            window.removeEventListener(type, fn, options); },
        scrollTo: (y) => { if (typeof window !== 'undefined')
            window.scrollTo(0, y); },
        scrollTop: () => scroller()?.scrollTop ?? 0,
        matchMedia: (q) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q) : null),
        visualViewport: () => (typeof window !== 'undefined' ? window.visualViewport ?? null : null),
        scrollingElement: () => scroller(),
        bodyElement: () => (typeof document !== 'undefined' ? document.body : null),
        bodyAppend: (el) => { if (typeof document !== 'undefined')
            document.body.appendChild(el); },
        bodyRemove: (el) => { if (typeof document !== 'undefined' && document.body.contains(el))
            document.body.removeChild(el); },
        clearBody: () => { if (typeof document !== 'undefined')
            document.body.innerHTML = ''; },
        event: (type, init) => (typeof window !== 'undefined' ? new window.Event(type, init) : new Event(type, init)),
        rootElement: () => root(),
        getSelection: () => (typeof window !== 'undefined' ? window.getSelection() : null),
        selectionText: () => (typeof window !== 'undefined' ? window.getSelection()?.toString() ?? '' : ''),
        storageGet: (key) => { try {
            return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
        }
        catch {
            return null;
        } },
        storageSet: (key, value) => { try {
            if (typeof window !== 'undefined')
                window.localStorage.setItem(key, value);
        }
        catch { /* 隐私模式——忽略 */ } },
        timeout: (fn, ms) => (typeof window !== 'undefined' ? window.setTimeout(fn, ms) : 0),
        pathname: () => (typeof window !== 'undefined' ? window.location.pathname : ''),
        setHash: (hash) => { if (typeof window !== 'undefined')
            window.location.hash = hash; },
        viewportHeight: () => (typeof window !== 'undefined' ? window.innerHeight : 0),
        onFormRestore: (fn) => { fn(); },
    };
}
