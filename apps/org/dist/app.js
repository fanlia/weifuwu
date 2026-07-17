// src/client/signal.ts
var currentEffect = null;
var currentDeps = null;
var _batchDepth = 0;
var _pendingBatch = /* @__PURE__ */ new Set();
var Signal = class {
  #value;
  #listeners = /* @__PURE__ */ new Set();
  constructor(value) {
    this.#value = value;
  }
  get value() {
    if (currentEffect) {
      this.#listeners.add(currentEffect);
      currentDeps?.add(this);
    }
    return this.#value;
  }
  set value(v) {
    if (v !== this.#value) {
      this.#value = v;
      if (_batchDepth > 0) {
        for (const fn of this.#listeners) _pendingBatch.add(fn);
      } else {
        const fns = [...this.#listeners];
        for (const fn of fns) fn();
      }
    }
  }
  /** @internal 移除监听器（由 effect dispose 调用） */
  _removeListener(fn) {
    this.#listeners.delete(fn);
  }
  /**
   * 可变更新 — 原地修改信号值并触发通知。
   *
   * 适用于数组/对象等引用类型：无需创建新引用即可触发更新。
   *
   * ```ts
   * const items = signal([1, 2, 3])
   * items.mutate(arr => arr.push(4))  // 数组原地修改
   * // items.value === [1, 2, 3, 4]
   * ```
   */
  mutate(fn) {
    fn(this.#value);
    if (_batchDepth > 0) {
      for (const fn2 of this.#listeners) _pendingBatch.add(fn2);
    } else {
      const fns = [...this.#listeners];
      for (const fn2 of fns) fn2();
    }
  }
};
function signal(initial) {
  return new Signal(initial);
}
function isSignal(value) {
  return value instanceof Signal;
}
function effect(fn) {
  const deps = /* @__PURE__ */ new Set();
  const run = () => {
    for (const dep of deps) dep._removeListener(run);
    deps.clear();
    const prevEffect = currentEffect;
    const prevDeps = currentDeps;
    currentEffect = run;
    currentDeps = deps;
    try {
      fn();
    } finally {
      currentEffect = prevEffect;
      currentDeps = prevDeps;
    }
  };
  run();
  return () => {
    for (const dep of deps) dep._removeListener(run);
    deps.clear();
  };
}
function computed(fn) {
  const s = signal(fn());
  effect(() => {
    s.value = fn();
  });
  return s;
}

// src/client/jsx-runtime.ts
var currentCtx = null;
function setCtx(ctx2) {
  currentCtx = ctx2;
}
function onMount(fn) {
  if (_pendingMountQueue) _pendingMountQueue.push(fn);
}
function onCleanup(fn) {
  if (_pendingCleanupQueue) _pendingCleanupQueue.push(fn);
}
var _pendingMountQueue = null;
var _pendingCleanupQueue = null;
var _entries = /* @__PURE__ */ new Map();
function _ensure(el) {
  let entry = _entries.get(el);
  if (entry) return entry;
  entry = {
    mounted: document.contains(el),
    observer: null,
    mountFns: [],
    disposeFns: []
  };
  _entries.set(el, entry);
  const obs = new MutationObserver(() => {
    const now = document.contains(el);
    if (now && !entry.mounted) {
      entry.mounted = true;
      const fns = entry.mountFns.slice();
      entry.mountFns = [];
      for (const fn of fns) {
        const dispose = fn();
        if (typeof dispose === "function") {
          entry.disposeFns.push(dispose);
        }
      }
    } else if (!now && entry.mounted) {
      entry.mounted = false;
      for (const fn of entry.disposeFns) fn();
      entry.disposeFns = [];
      entry.mountFns = [];
      obs.disconnect();
      _entries.delete(el);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  entry.observer = obs;
  return entry;
}
function _trackEffect(el, dispose) {
  const entry = _ensure(el);
  entry.disposeFns.push(dispose);
}
function setProp(el, key, value) {
  if (key === "class" || key === "className") {
    if (isSignal(value)) {
      _trackEffect(el, effect(() => {
        el.className = String(value.value);
      }));
    } else {
      el.className = String(value ?? "");
    }
  } else if (key === "style" && typeof value === "object" && value !== null) {
    Object.assign(el.style, value);
  } else if (key.startsWith("on") && typeof value === "function") {
    el.addEventListener(key.slice(2).toLowerCase(), value);
  } else if (key === "ref" && typeof value === "function") {
    value(el);
  } else if (isSignal(value)) {
    _trackEffect(el, effect(() => {
      const v = value.value;
      if (v == null || v === false) el.removeAttribute(key);
      else if (v === true) el.setAttribute(key, "");
      else el.setAttribute(key, String(v));
    }));
  } else if (value != null && value !== false) {
    if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
}
function appendChild(parent, child) {
  if (child == null || child === false || child === true) return;
  if (Array.isArray(child)) {
    child.forEach((c) => appendChild(parent, c));
    return;
  }
  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }
  if (isSignal(child)) {
    const text = document.createTextNode("");
    if (parent instanceof Element) {
      _trackEffect(parent, effect(() => {
        text.textContent = String(child.value);
      }));
    } else {
      effect(() => {
        text.textContent = String(child.value);
      });
    }
    parent.appendChild(text);
    return;
  }
  parent.appendChild(document.createTextNode(String(child)));
}
function jsx(type, props, ...children) {
  if (typeof type === "function") {
    const merged = children.length > 0 ? { ...props, children } : props;
    const prevMount = _pendingMountQueue;
    const prevCleanup = _pendingCleanupQueue;
    _pendingMountQueue = [];
    _pendingCleanupQueue = [];
    let result = document.createDocumentFragment();
    try {
      result = type(merged, currentCtx) ?? document.createDocumentFragment();
    } finally {
      if (_pendingMountQueue.length > 0 || _pendingCleanupQueue.length > 0) {
        let targetEl = null;
        if (result instanceof Element) {
          targetEl = result;
        } else if (result instanceof DocumentFragment && result.firstElementChild) {
          targetEl = result.firstElementChild;
        }
        if (targetEl) {
          const entry = _ensure(targetEl);
          for (const fn of _pendingMountQueue) {
            if (entry.mounted) {
              const dispose = fn();
              if (typeof dispose === "function") entry.disposeFns.push(dispose);
            } else {
              entry.mountFns.push(fn);
            }
          }
          for (const fn of _pendingCleanupQueue) {
            entry.disposeFns.push(fn);
          }
        }
      }
      _pendingMountQueue = prevMount;
      _pendingCleanupQueue = prevCleanup;
    }
    return result;
  }
  const el = document.createElement(type);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k !== "children") setProp(el, k, v);
    }
  }
  const childList = children.length > 0 ? children : props?.children != null ? [props.children] : [];
  for (const child of childList) appendChild(el, child);
  return el;
}
function jsxs(type, props, ...children) {
  return jsx(type, props, ...children);
}
function domMount(root, app2) {
  const container = typeof root === "string" ? document.querySelector(root) : root;
  if (!container) throw new Error(`mount target not found: ${root}`);
  container.innerHTML = "";
  container.appendChild(app2);
}
function toNode(v) {
  if (v instanceof Node) return v;
  if (typeof v === "function") return toNode(v());
  return document.createTextNode(String(v ?? ""));
}
function Show({ when, children, fallback }) {
  const el = document.createElement("div");
  el.style.display = "contents";
  function render(show) {
    while (el.lastChild) el.removeChild(el.lastChild);
    if (show && children != null) {
      el.appendChild(toNode(children));
    } else if (!show && fallback != null) {
      el.appendChild(toNode(fallback));
    }
  }
  if (isSignal(when)) {
    const dispose = effect(() => render(Boolean(when.value)));
    _trackEffect(el, dispose);
  } else {
    render(Boolean(when));
  }
  return el;
}
function For({ each, children, keyBy }) {
  const el = document.createElement("div");
  el.style.display = "contents";
  function getKey(item, index) {
    if (typeof keyBy === "function") return keyBy(item);
    if (typeof keyBy === "string") return String(item[keyBy] ?? index);
    return String(index);
  }
  function render(list) {
    if (!keyBy) {
      while (el.lastChild) el.removeChild(el.lastChild);
      for (let i = 0; i < list.length; i++) {
        el.appendChild(children(list[i], i));
      }
      return;
    }
    const oldNodes = Array.from(el.children).filter((n) => n instanceof Element);
    const oldKeyMap = /* @__PURE__ */ new Map();
    for (const node of oldNodes) {
      const k = node.getAttribute("data-key");
      if (k !== null) oldKeyMap.set(k, node);
    }
    const newKeys = [];
    const newItems = [];
    for (let i = 0; i < list.length; i++) {
      newKeys.push(getKey(list[i], i));
      newItems.push(list[i]);
    }
    const removedKeys = new Set(oldKeyMap.keys());
    for (const k of newKeys) removedKeys.delete(k);
    for (const k of removedKeys) {
      const node = oldKeyMap.get(k);
      node.remove();
      oldKeyMap.delete(k);
    }
    let insertBefore = el.firstChild;
    for (let i = list.length - 1; i >= 0; i--) {
      const key = newKeys[i];
      const existing = oldKeyMap.get(key);
      if (existing) {
        el.insertBefore(existing, insertBefore);
        insertBefore = existing;
      } else {
        const node = children(newItems[i], i);
        if (node instanceof Element) {
          node.setAttribute("data-key", key);
        }
        el.insertBefore(node, insertBefore);
        insertBefore = node;
      }
    }
  }
  if (isSignal(each)) {
    const dispose = effect(() => render(each.value));
    _trackEffect(el, dispose);
  } else {
    render(each);
  }
  return el;
}

// src/client/app.ts
function createApp() {
  const middlewares = [];
  const provides = /* @__PURE__ */ new Map();
  let ctx2 = {
    route: {
      path: window.location.pathname,
      params: {},
      query: Object.fromEntries(new URLSearchParams(window.location.search)),
      hash: window.location.hash,
      component: null,
      data: {},
      loading: false
    },
    app: {
      navigate(path) {
        window.history.pushState({}, "", path);
        ctx2.route.path = path;
        ctx2.route.query = Object.fromEntries(new URLSearchParams(window.location.search));
        ctx2.route.hash = window.location.hash;
        window.dispatchEvent(new CustomEvent("wefu:navigate", { detail: { path } }));
      }
    },
    user: null,
    token: null,
    isAuthenticated: false,
    login: async () => {
    },
    logout: () => {
    },
    register: async () => {
    },
    api: null,
    ws: null,
    provide(key, value) {
      provides.set(key, value);
    },
    inject(key) {
      return provides.get(key) ?? null;
    }
  };
  return {
    get ctx() {
      return ctx2;
    },
    use(mw) {
      middlewares.push(mw);
      return this;
    },
    async mount(rootSelector, RootComponent) {
      for (const mw of middlewares) {
        ctx2 = await mw(ctx2);
      }
      setCtx(ctx2);
      const app2 = jsx(RootComponent, {});
      domMount(rootSelector, app2);
      setCtx(null);
    },
    hydrate(selector, Component, props) {
      const root = document.querySelector(selector);
      if (!root) {
        console.warn(`hydrate target not found: ${selector}`);
        return;
      }
      const mergedProps = props ?? window.__WFUI_PROPS__ ?? {};
      setCtx(ctx2);
      const vnode = jsx(Component, mergedProps);
      root.appendChild(vnode);
      setCtx(null);
    }
  };
}

// src/client/router.ts
function router(opts) {
  const mode = opts.mode ?? "hash";
  const matchers = opts.routes.map((route) => {
    const parts = route.path.split("/").filter(Boolean);
    const keys = [];
    const reStr = "^/" + parts.map((p) => {
      if (p.startsWith(":")) {
        keys.push(p.slice(1));
        return "([^/]+)";
      }
      return p;
    }).join("/") + "$";
    return { re: new RegExp(reStr), keys, route };
  });
  function matchRoute(path) {
    for (const m of matchers) {
      const result = path.match(m.re);
      if (!result) continue;
      const params = {};
      m.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(result[i + 1]);
      });
      return {
        matched: { component: m.route.component, params, title: m.route.title, auth: m.route.auth },
        routeDef: m.route
      };
    }
    return null;
  }
  return (ctx2) => {
    function emit(path) {
      window.dispatchEvent(new CustomEvent("wefu:route", { detail: { path } }));
    }
    function resolve(path) {
      const raw = mode === "hash" ? path || "/" : path;
      const [cleanPath, qs] = raw.split("?");
      ctx2.route.query = Object.fromEntries(new URLSearchParams(qs ?? ""));
      ctx2.route.path = cleanPath;
      const r = matchRoute(cleanPath);
      if (!r) {
        ctx2.route.component = opts.notFound ?? null;
        ctx2.route.data = {};
        ctx2.route.transition = opts.transition;
        return { component: null, routeDef: void 0 };
      }
      ctx2.route.params = r.matched.params;
      ctx2.route.component = r.matched.component;
      ctx2.route.title = r.matched.title;
      ctx2.route.auth = r.matched.auth;
      ctx2.route.transition = r.routeDef.transition ?? opts.transition;
      if (r.matched.title) document.title = r.matched.title;
      return { component: r.matched.component, routeDef: r.routeDef };
    }
    function navigateAndLoad(path) {
      const { routeDef } = resolve(path);
      if (ctx2.route.auth && !ctx2.user) {
        setTimeout(() => ctx2.app.navigate("/login"), 0);
        return;
      }
      if (routeDef?.loader) {
        ctx2.route.loading = true;
        emit(ctx2.route.path);
        routeDef.loader(ctx2).then((data) => {
          ctx2.route.data = data;
          ctx2.route.loading = false;
          emit(ctx2.route.path);
        }).catch(() => {
          ctx2.route.data = {};
          ctx2.route.loading = false;
          emit(ctx2.route.path);
        });
      } else {
        ctx2.route.loading = false;
        emit(ctx2.route.path);
      }
    }
    ctx2.app.navigate = (path) => {
      if (mode === "hash") {
        window.location.hash = "#" + path;
      } else {
        window.history.pushState({}, "", path);
        navigateAndLoad(path);
      }
    };
    if (mode === "hash") {
      window.addEventListener("hashchange", () => {
        navigateAndLoad(window.location.hash.slice(1) || "/");
      });
    } else {
      window.addEventListener("popstate", () => {
        navigateAndLoad(window.location.pathname + window.location.search);
      });
    }
    const initialPath = mode === "hash" ? window.location.hash.slice(1) || "/" : window.location.pathname + window.location.search;
    navigateAndLoad(initialPath);
    return ctx2;
  };
}
function RouteView(_props, ctx2) {
  const el = document.createElement("div");
  el.style.position = "relative";
  let currentPath = "";
  let currentQuery = "";
  let currentComponent = null;
  let leavingPage = null;
  function removeLeaving() {
    if (leavingPage && el.contains(leavingPage)) {
      el.removeChild(leavingPage);
    }
    leavingPage = null;
  }
  function render() {
    const Component = ctx2.route.component;
    const path = ctx2.route.path;
    const queryStr = JSON.stringify(ctx2.route.query);
    const trans = ctx2.route.transition;
    if (!Component) {
      if (el.children.length > 0) el.textContent = "";
      currentPath = "";
      currentQuery = "";
      currentComponent = null;
      return;
    }
    if (Component === currentComponent && path === currentPath && queryStr === currentQuery) return;
    currentPath = path;
    currentQuery = queryStr;
    if (trans) {
      const prev = currentComponent ? el.lastElementChild : null;
      if (prev instanceof HTMLElement) {
        prev.classList.add(`${trans}-leave`, `${trans}-leave-active`);
        leavingPage = prev;
        const onLeaveEnd = () => {
          prev.classList.remove(`${trans}-leave`, `${trans}-leave-active`);
          removeLeaving();
          prev.removeEventListener("transitionend", onLeaveEnd);
          prev.removeEventListener("animationend", onLeaveEnd);
        };
        prev.addEventListener("transitionend", onLeaveEnd);
        prev.addEventListener("animationend", onLeaveEnd);
        setTimeout(onLeaveEnd, 400);
      }
      currentComponent = Component;
      setCtx(ctx2);
      const page = jsx(Component, {});
      setCtx(null);
      if (page instanceof HTMLElement) {
        page.style.position = "absolute";
        page.style.top = "0";
        page.style.left = "0";
        page.style.width = "100%";
        page.classList.add(`${trans}-enter`);
        el.appendChild(page);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            page.classList.add(`${trans}-enter-active`);
            page.classList.remove(`${trans}-enter`);
            const onEnterEnd = () => {
              page.style.position = "";
              page.style.top = "";
              page.style.left = "";
              page.style.width = "";
              page.classList.remove(`${trans}-enter-active`);
              page.removeEventListener("transitionend", onEnterEnd);
              page.removeEventListener("animationend", onEnterEnd);
            };
            page.addEventListener("transitionend", onEnterEnd);
            page.addEventListener("animationend", onEnterEnd);
            setTimeout(onEnterEnd, 400);
          });
        });
      } else {
        el.appendChild(page);
      }
    } else {
      currentComponent = Component;
      el.textContent = "";
      setCtx(ctx2);
      const page = jsx(Component, {});
      el.appendChild(page);
      setCtx(null);
    }
  }
  render();
  window.addEventListener("wefu:route", render);
  return el;
}

// src/client/middleware/api.ts
var _getToken = () => null;
function setTokenGetter(fn) {
  _getToken = fn;
}
function getToken() {
  return _getToken();
}
var ApiError = class extends Error {
  status;
  constructor(status, message) {
    super(`[${status}] ${message}`);
    this.name = "ApiError";
    this.status = status;
  }
};
var ApiClient = class {
  #baseUrl;
  constructor(baseUrl = "/api") {
    this.#baseUrl = baseUrl;
  }
  async request(method, path, body) {
    const headers = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (body != null) headers["Content-Type"] = "application/json";
    const res = await fetch(`${this.#baseUrl}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : void 0
    });
    if (!res.ok) {
      throw new ApiError(res.status, await res.text().catch(() => res.statusText));
    }
    if (res.status === 204) return void 0;
    return res.json();
  }
  get(path) {
    return this.request("GET", path);
  }
  post(path, body) {
    return this.request("POST", path, body);
  }
  put(path, body) {
    return this.request("PUT", path, body);
  }
  patch(path, body) {
    return this.request("PATCH", path, body);
  }
  delete(path) {
    return this.request("DELETE", path);
  }
};
function api(opts = {}) {
  return (ctx2) => {
    ctx2.api = new ApiClient(opts.baseUrl ?? "/api");
    return ctx2;
  };
}

// src/client/middleware/auth.ts
function auth(opts = {}) {
  const storageKey = opts.storageKey ?? "wefu:auth";
  const loginPath = opts.loginPath ?? "/api/login";
  const registerPath = opts.registerPath ?? "/api/register";
  const mePath = opts.mePath ?? "/api/me";
  return async (ctx2) => {
    const userSignal = signal(null);
    const tokenSignal = signal(null);
    setTokenGetter(() => tokenSignal.value);
    function persist(user, token) {
      userSignal.value = user;
      tokenSignal.value = token;
      if (token && user) {
        localStorage.setItem(storageKey, JSON.stringify({ user, token }));
      } else {
        localStorage.removeItem(storageKey);
      }
    }
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const { user, token } = JSON.parse(saved);
        userSignal.value = user;
        tokenSignal.value = token;
        setTokenGetter(() => token);
      }
    } catch {
    }
    if (tokenSignal.value) {
      try {
        const api2 = new ApiClient();
        const user = await api2.get(mePath);
        persist(user, tokenSignal.value);
      } catch {
        persist(null, null);
      }
    }
    return {
      ...ctx2,
      get user() {
        return userSignal.value;
      },
      get token() {
        return tokenSignal.value;
      },
      get isAuthenticated() {
        return !!tokenSignal.value && !!userSignal.value;
      },
      async login(email, password) {
        const api2 = new ApiClient();
        const res = await api2.post(loginPath, { email, password });
        persist(res.user, res.token);
      },
      logout() {
        persist(null, null);
      },
      async register(input) {
        const api2 = new ApiClient();
        const res = await api2.post(registerPath, input);
        persist(res.user, res.token);
      }
    };
  };
}

// src/client/middleware/ws.ts
function ws(opts = {}) {
  const wsUrl = opts.url ?? "/ws";
  const reconnectInterval = opts.reconnectInterval ?? 3e3;
  const maxReconnect = opts.maxReconnect ?? 10;
  return (ctx2) => {
    const isConnected = signal(false);
    const messageHandlers = /* @__PURE__ */ new Set();
    let socket = null;
    let reconnectCount = 0;
    let reconnectTimer = null;
    function connect() {
      if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
      const token = getToken();
      const url = token ? `${wsUrl}?token=${token}` : wsUrl;
      try {
        socket = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      socket.onopen = () => {
        isConnected.value = true;
        reconnectCount = 0;
      };
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          for (const h of messageHandlers) h(data);
        } catch {
          for (const h of messageHandlers) h(event.data);
        }
      };
      socket.onclose = () => {
        isConnected.value = false;
        socket = null;
        scheduleReconnect();
      };
      socket.onerror = () => {
        socket?.close();
      };
    }
    function scheduleReconnect() {
      if (reconnectCount >= maxReconnect) return;
      reconnectCount++;
      reconnectTimer = setTimeout(connect, reconnectInterval * reconnectCount);
    }
    function send(data) {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(typeof data === "string" ? data : JSON.stringify(data));
      }
    }
    function join(room) {
      send({ type: "join", room });
    }
    function leave(room) {
      send({ type: "leave", room });
    }
    connect();
    return Object.assign(Object.create(ctx2), {
      ws: {
        send,
        onMessage: (handler) => {
          messageHandlers.add(handler);
          return () => messageHandlers.delete(handler);
        },
        join,
        leave,
        get isConnected() {
          return isConnected;
        }
      }
    });
  };
}

// src/client/lib/css.ts
var _counter = 0;
var _injected = /* @__PURE__ */ new Set();
function createStyles(styles) {
  const prefix = `_w`;
  const keys = Object.keys(styles);
  const result = {};
  const rules = [];
  for (const key of keys) {
    _counter++;
    const className = `${prefix}${_counter}`;
    result[key] = className;
    rules.push(`.${className} { ${styles[key]} }`);
  }
  const styleId = `_w_${keys.join("_")}`;
  if (!_injected.has(styleId)) {
    _injected.add(styleId);
    const style = document.createElement("style");
    style.setAttribute("data-wefu-css", styleId);
    style.textContent = rules.join("\n");
    if (document.head) {
      document.head.appendChild(style);
    }
  }
  return result;
}

// apps/org/src/main.tsx
function formatDate(d) {
  return new Date(d).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
function Button({ onClick, children, variant = "primary", size = "md", disabled, className }) {
  const base = "inline-flex items-center justify-center font-medium rounded-lg cursor-pointer transition-colors select-none";
  const variants = {
    primary: "bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700",
    secondary: "bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300",
    danger: "bg-red-500 text-white hover:bg-red-600 active:bg-red-700",
    ghost: "text-gray-500 hover:bg-gray-100 active:bg-gray-200"
  };
  const sizes = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-4 py-2 text-sm"
  };
  const disabledStyle = disabled ? "opacity-50 cursor-not-allowed" : "";
  return /* @__PURE__ */ jsx(
    "button",
    {
      class: `${base} ${variants[variant]} ${sizes[size]} ${disabledStyle} ${className || ""}`,
      onClick,
      disabled,
      children
    }
  );
}
function Modal({ show, onClose, title, children }) {
  return /* @__PURE__ */ jsx(Show, { when: show, children: /* @__PURE__ */ jsxs("div", { class: "fixed inset-0 z-50 flex items-center justify-center", onClick: onClose, children: [
    /* @__PURE__ */ jsx("div", { class: "fixed inset-0 bg-black/30 anim-fade-in" }),
    /* @__PURE__ */ jsxs("div", { class: "relative bg-white rounded-xl shadow-modal p-6 w-full max-w-md mx-4 anim-slide-in", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs("div", { class: "flex items-center justify-between mb-4", children: [
        /* @__PURE__ */ jsx("h2", { class: "text-lg font-semibold", children: title }),
        /* @__PURE__ */ jsx("button", { class: "text-gray-400 hover:text-gray-600 text-lg cursor-pointer", onClick: onClose, children: "\u2715" })
      ] }),
      children
    ] })
  ] }) });
}
function LoginPage(_props, ctx2) {
  const email = signal("");
  const password = signal("");
  const name = signal("");
  const isRegister = signal(false);
  const error = signal("");
  const loading = signal(false);
  const emailError = signal("");
  const passwordError = signal("");
  const validate = () => {
    emailError.value = "";
    passwordError.value = "";
    if (!email.value.trim()) {
      emailError.value = "\u8BF7\u8F93\u5165\u90AE\u7BB1";
      return false;
    }
    if (!email.value.includes("@")) {
      emailError.value = "\u90AE\u7BB1\u683C\u5F0F\u4E0D\u6B63\u786E";
      return false;
    }
    if (password.value.length < 3) {
      passwordError.value = "\u5BC6\u7801\u81F3\u5C11 3 \u4E2A\u5B57\u7B26";
      return false;
    }
    return true;
  };
  const submit = async () => {
    if (!validate()) return;
    error.value = "";
    loading.value = true;
    try {
      if (isRegister.value) {
        if (!name.value.trim()) {
          error.value = "\u8BF7\u8F93\u5165\u6635\u79F0";
          loading.value = false;
          return;
        }
        await ctx2.register?.({ email: email.value.trim(), name: name.value.trim(), password: password.value });
      } else {
        await ctx2.login?.(email.value.trim(), password.value);
      }
    } catch (e) {
      error.value = e?.message || "\u64CD\u4F5C\u5931\u8D25";
    } finally {
      loading.value = false;
    }
  };
  const s = createStyles({
    page: "flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100",
    card: "bg-white rounded-xl p-8 shadow-elevated w-full max-w-sm anim-slide-in",
    logo: "text-3xl text-center mb-1",
    title: "text-2xl font-bold text-center mb-1",
    subtitle: "text-gray-400 text-sm text-center mb-6",
    input: "w-full px-3 py-2.5 border rounded-lg text-sm mb-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all",
    inputError: "w-full px-3 py-2.5 border rounded-lg text-sm mb-1 focus:outline-none border-red-400 focus:border-red-500 focus:ring-red-100",
    fieldError: "text-red-500 text-xs mb-2 ml-1",
    errorBox: "bg-red-50 text-red-600 text-xs rounded-lg p-3 mb-3 anim-slide-in",
    btn: "w-full py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-600 active:bg-blue-700 transition-colors mb-3 disabled:opacity-50 disabled:cursor-not-allowed",
    switchLink: "text-center text-xs text-gray-400 cursor-pointer hover:text-blue-500 transition-colors",
    footer: "text-center text-xs text-gray-300 mt-6"
  });
  return /* @__PURE__ */ jsx("div", { class: s.page, children: /* @__PURE__ */ jsxs("div", { class: s.card, children: [
    /* @__PURE__ */ jsx("div", { class: s.logo, children: "\u{1F3E2}" }),
    /* @__PURE__ */ jsx("h1", { class: s.title, children: "Org" }),
    /* @__PURE__ */ jsx("p", { class: s.subtitle, children: "Enterprise AI Collaboration Platform" }),
    /* @__PURE__ */ jsx(Show, { when: isRegister, children: /* @__PURE__ */ jsx("input", { class: s.input, value: name, onInput: (e) => name.value = e.target.value, placeholder: "\u6635\u79F0" }) }),
    /* @__PURE__ */ jsx(
      "input",
      {
        class: emailError.value ? s.inputError : s.input,
        value: email,
        onInput: (e) => {
          email.value = e.target.value;
          emailError.value = "";
        },
        placeholder: "\u90AE\u7BB1",
        type: "email"
      }
    ),
    /* @__PURE__ */ jsx(Show, { when: emailError.value, children: /* @__PURE__ */ jsx("p", { class: s.fieldError, children: emailError.value }) }),
    /* @__PURE__ */ jsx(
      "input",
      {
        class: passwordError.value ? s.inputError : s.input,
        value: password,
        onInput: (e) => {
          password.value = e.target.value;
          passwordError.value = "";
        },
        placeholder: "\u5BC6\u7801",
        type: "password",
        onKeyDown: (e) => e.key === "Enter" && submit()
      }
    ),
    /* @__PURE__ */ jsx(Show, { when: passwordError.value, children: /* @__PURE__ */ jsx("p", { class: s.fieldError, children: passwordError.value }) }),
    /* @__PURE__ */ jsx(Show, { when: error.value, children: /* @__PURE__ */ jsxs("div", { class: s.errorBox, children: [
      "\u26A0 ",
      error.value
    ] }) }),
    /* @__PURE__ */ jsx("button", { class: s.btn, onClick: submit, disabled: loading.value, children: loading.value ? "\u23F3 \u5904\u7406\u4E2D..." : isRegister.value ? "\u6CE8\u518C" : "\u767B\u5F55" }),
    /* @__PURE__ */ jsx(
      "p",
      {
        class: s.switchLink,
        onClick: () => {
          isRegister.value = !isRegister.value;
          error.value = "";
          emailError.value = "";
          passwordError.value = "";
        },
        children: computed(() => isRegister.value ? "\u5DF2\u6709\u8D26\u53F7\uFF1F\u767B\u5F55 \u2192" : "\u6CA1\u6709\u8D26\u53F7\uFF1F\u6CE8\u518C \u2192")
      }
    ),
    /* @__PURE__ */ jsx("p", { class: s.footer, children: "Powered by weifuwu" })
  ] }) });
}
function DepartmentChat({ conversationId, agents }, ctx2) {
  const messages = signal([]);
  const input = signal("");
  const loading = signal(true);
  const showAgentPicker = signal(false);
  const agentFilter = signal("");
  const aiStreaming = signal(false);
  const streamingText = signal("");
  const streamingAgentName = signal("");
  onMount(() => {
    ctx2.api.get(`/conversations/${conversationId}/messages`).then((msgs) => {
      messages.value = Array.isArray(msgs) ? msgs.slice().reverse() : [];
      loading.value = false;
    }).catch(() => loading.value = false);
  });
  const unsub = ctx2.ws.onMessage((raw) => {
    const data = raw;
    if (data.conversation_id === conversationId && data.id) {
      messages.value = [...messages.value, data];
    }
  });
  onCleanup(() => unsub());
  const aiAgents = agents.filter((a) => a.kind === "ai");
  const onInput = (e) => {
    const val = e.target.value;
    input.value = val;
    const lastAt = val.lastIndexOf("@");
    if (lastAt >= 0 && (lastAt === 0 || val[lastAt - 1] === " ")) {
      const after = val.slice(lastAt + 1);
      if (!after.includes(" ")) {
        showAgentPicker.value = true;
        agentFilter.value = after;
        return;
      }
    }
    showAgentPicker.value = false;
  };
  const matchedAgents = computed(() => aiAgents.filter((a) => a.name.toLowerCase().includes(agentFilter.value.toLowerCase())));
  const selectAgent = (agent) => {
    const val = input.value;
    const lastAt = val.lastIndexOf("@");
    const before = val.slice(0, lastAt);
    input.value = before + "@" + agent.name + " ";
    showAgentPicker.value = false;
  };
  const send = async () => {
    const text = input.value.trim();
    if (!text || aiStreaming.value) return;
    input.value = "";
    showAgentPicker.value = false;
    const msg = await ctx2.api.post("/messages", { conversationId, body: text });
    messages.value = [...messages.value, msg];
    const matchedAgent = aiAgents.find((a) => text.includes(`@${a.name}`));
    if (matchedAgent) {
      const placeholderId = "ai-" + Date.now();
      const placeholder = {
        id: placeholderId,
        sender_id: matchedAgent.id,
        sender_name: matchedAgent.name,
        body: "...",
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        is_ai: true
      };
      messages.value = [...messages.value, placeholder];
      aiStreaming.value = true;
      streamingText.value = "";
      streamingAgentName.value = matchedAgent.name;
      try {
        const history = messages.value.slice(-20).map((m) => ({
          role: m.sender_id === ctx2.user?.id ? "user" : "assistant",
          content: m.body.replace(/\*\*.*?\*\*:/g, "").trim()
        }));
        const response = await fetch(`/api/agents/${matchedAgent.id}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, messages: history.slice(0, -1) })
        });
        if (!response.ok) throw new Error("AI request failed");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No stream reader");
        const decoder = new TextDecoder();
        let fullText = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "text") {
                  fullText += data.content;
                  streamingText.value = fullText;
                } else if (data.type === "error") {
                  console.error("AI error:", data.error);
                }
              } catch {
              }
            }
          }
        }
        messages.value = messages.value.map(
          (m) => m.id === placeholderId ? { ...m, body: streamingText.value || fullText } : m
        );
      } catch (e) {
        console.error("AI chat error:", e);
        messages.value = messages.value.filter((m) => m.id !== placeholderId);
      } finally {
        aiStreaming.value = false;
        streamingText.value = "";
      }
    }
  };
  const s = createStyles({
    container: "flex flex-col h-full",
    msgList: "flex-1 overflow-y-auto px-4 py-3 space-y-2",
    msgRow: "flex",
    timeDivider: "text-center text-xs text-gray-300 my-4 relative before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-gray-100",
    timeText: "relative z-10 bg-gray-50 px-2 text-gray-400",
    msgName: "text-xs text-gray-400 mb-0.5",
    inputArea: "px-4 py-3 border-t border-gray-200 bg-white",
    inputRow: "flex gap-2",
    input: "flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500",
    sendBtn: "px-4 py-2 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 disabled:opacity-50",
    picker: "absolute bottom-full left-4 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg p-1 max-h-32 overflow-y-auto z-10",
    pickerItem: "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm cursor-pointer hover:bg-gray-100",
    streamingBar: "px-4 py-2 bg-blue-50 border-t border-blue-100 text-sm text-blue-600 flex items-center gap-2",
    dot: "w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"
  });
  return /* @__PURE__ */ jsxs("div", { class: s.container, children: [
    /* @__PURE__ */ jsxs("div", { class: s.msgList, children: [
      /* @__PURE__ */ jsx(Show, { when: loading, children: /* @__PURE__ */ jsx("p", { class: "text-center text-gray-400 text-sm py-10", children: "\u52A0\u8F7D\u4E2D..." }) }),
      /* @__PURE__ */ jsx(For, { each: messages, children: (msg, i) => {
        const isMine = msg.sender_id === ctx2.user?.id;
        const isAI = msg.is_ai || msg.sender_name?.startsWith("**");
        const prev = messages.value[i - 1];
        const showTimeDivider = !prev || new Date(msg.created_at).toDateString() !== new Date(prev.created_at).toDateString();
        const senderChanged = !prev || prev.sender_id !== msg.sender_id || showTimeDivider;
        const timeLabel = new Date(msg.created_at).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) === (/* @__PURE__ */ new Date()).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) ? "\u4ECA\u5929" : new Date(msg.created_at).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
        return /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx(Show, { when: showTimeDivider, children: /* @__PURE__ */ jsx("div", { class: s.timeDivider, children: /* @__PURE__ */ jsx("span", { class: s.timeText, children: timeLabel }) }) }),
          /* @__PURE__ */ jsx("div", { class: `flex ${isMine ? "justify-end" : "justify-start"} mb-2 anim-slide-in`, children: /* @__PURE__ */ jsxs("div", { class: "max-w-[70%]", children: [
            /* @__PURE__ */ jsx(Show, { when: senderChanged && !isMine, children: /* @__PURE__ */ jsx("p", { class: s.msgName, children: msg.sender_name?.replace(/\*\*/g, "") || "\u672A\u77E5" }) }),
            /* @__PURE__ */ jsx("div", { class: `msg-bubble ${isMine ? "mine" : isAI ? "ai" : "other"}`, children: msg.body === "..." && isAI ? /* @__PURE__ */ jsx("span", { class: "italic text-gray-400", children: "\u601D\u8003\u4E2D..." }) : msg.body })
          ] }) })
        ] });
      } }),
      /* @__PURE__ */ jsx(Show, { when: aiStreaming && streamingText.value, children: /* @__PURE__ */ jsx("div", { class: "flex mb-2 anim-slide-in", children: /* @__PURE__ */ jsxs("div", { class: "max-w-[70%]", children: [
        /* @__PURE__ */ jsx("p", { class: s.msgName, children: streamingAgentName.value }),
        /* @__PURE__ */ jsxs("div", { class: "msg-bubble ai", children: [
          streamingText.value,
          /* @__PURE__ */ jsx("span", { class: "anim-blink ml-0.5 text-blue-500", children: "\u258D" })
        ] })
      ] }) }) })
    ] }),
    /* @__PURE__ */ jsx(Show, { when: aiStreaming && !streamingText.value, children: /* @__PURE__ */ jsxs("div", { class: s.streamingBar, children: [
      /* @__PURE__ */ jsx("span", { class: s.dot }),
      /* @__PURE__ */ jsx("span", { children: "AI \u6B63\u5728\u601D\u8003..." })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { class: s.inputArea, style: "position: relative", children: [
      /* @__PURE__ */ jsx(Show, { when: showAgentPicker && matchedAgents.value.length > 0, children: /* @__PURE__ */ jsx("div", { class: s.picker, children: /* @__PURE__ */ jsx(For, { each: matchedAgents, children: (a) => /* @__PURE__ */ jsxs("div", { class: s.pickerItem, onClick: () => selectAgent(a), children: [
        /* @__PURE__ */ jsx("span", { children: "\u{1F916}" }),
        /* @__PURE__ */ jsx("span", { children: a.name })
      ] }) }) }) }),
      /* @__PURE__ */ jsxs("div", { class: s.inputRow, children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            class: s.input,
            value: input,
            onInput,
            onKeyDown: (e) => e.key === "Enter" && send(),
            placeholder: "\u8F93\u5165\u6D88\u606F\uFF0C@AI\u673A\u5668\u4EBA\u5BF9\u8BDD..."
          }
        ),
        /* @__PURE__ */ jsx("button", { class: s.sendBtn, onClick: send, disabled: aiStreaming, children: aiStreaming ? "..." : "\u53D1\u9001" })
      ] })
    ] })
  ] });
}
function Skeleton({ lines = 3 }) {
  const arr = Array.from({ length: lines });
  return /* @__PURE__ */ jsx("div", { class: "space-y-3 p-4", children: /* @__PURE__ */ jsx(For, { each: arr, children: () => /* @__PURE__ */ jsx("div", { class: "h-4 bg-gray-200 rounded-md animate-pulse", style: { width: `${60 + Math.random() * 30}%` } }) }) });
}
var TOAST_ICONS = {
  success: "\u2713",
  error: "\u2715",
  info: "i",
  warning: "\u26A0"
};
var TOAST_COLORS = {
  success: "bg-green-500",
  error: "bg-red-500",
  info: "bg-blue-500",
  warning: "bg-orange-500"
};
var TOAST_DURATION = 3500;
var toasts = signal([]);
var toastId = 0;
function showToast(msg, type = "info") {
  const id = ++toastId;
  const item = { id, msg, type, startTime: Date.now() };
  toasts.value = [...toasts.value, item];
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, TOAST_DURATION);
}
function ToastContainer() {
  const s = createStyles({
    container: "fixed top-4 right-4 z-50 space-y-2 pointer-events-none",
    toast: "pointer-events-auto rounded-lg shadow-modal text-sm text-white overflow-hidden anim-slide-in cursor-pointer",
    body: "flex items-center gap-2.5 px-4 py-3",
    icon: "w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold shrink-0",
    msg: "flex-1",
    progress: "h-1 bg-white/30",
    progressBar: "h-full bg-white/60 transition-all"
  });
  return /* @__PURE__ */ jsx("div", { class: s.container, children: /* @__PURE__ */ jsx(For, { each: toasts, children: (t) => {
    const elapsed = Date.now() - t.startTime;
    const remaining = Math.max(0, 1 - elapsed / TOAST_DURATION);
    return /* @__PURE__ */ jsxs(
      "div",
      {
        class: `${s.toast} ${TOAST_COLORS[t.type]}`,
        onClick: () => {
          toasts.value = toasts.value.filter((x) => x.id !== t.id);
        },
        children: [
          /* @__PURE__ */ jsxs("div", { class: s.body, children: [
            /* @__PURE__ */ jsx("span", { class: s.icon, children: TOAST_ICONS[t.type] }),
            /* @__PURE__ */ jsx("span", { class: s.msg, children: t.msg })
          ] }),
          /* @__PURE__ */ jsx("div", { class: s.progress, children: /* @__PURE__ */ jsx("div", { class: s.progressBar, style: { width: `${remaining * 100}%` } }) })
        ]
      }
    );
  } }) });
}
function OnboardingWizard({ onDone }, _ctx) {
  const step = signal(1);
  const newName = signal("");
  const newSlug = signal("");
  const creating = signal(false);
  const s = createStyles({
    wrap: "max-w-lg mx-auto mt-12 text-center",
    icon: "text-6xl mb-4",
    title: "text-xl font-bold mb-2",
    desc: "text-gray-500 text-sm mb-6",
    input: "w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-3 focus:outline-none focus:border-blue-500",
    btn: "px-5 py-2 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 mx-1",
    skip: "px-5 py-2 bg-gray-100 text-gray-500 rounded-lg text-sm cursor-pointer hover:bg-gray-200 mx-1",
    dot: "inline-block w-2 h-2 rounded-full mx-1",
    dotActive: "inline-block w-2 h-2 rounded-full mx-1 bg-blue-500"
  });
  const createAndGo = async () => {
    creating.value = true;
    try {
      const t = await ctx.api.post("/tenants", { name: newName.value || "\u6211\u7684\u56E2\u961F", slug: newSlug.value || "my-team" });
      showToast("\u{1F389} \u79DF\u6237\u521B\u5EFA\u6210\u529F\uFF01", "success");
      onDone();
      setTimeout(() => ctx.app.navigate(`/tenant/${t.id}`), 300);
    } catch (e) {
      showToast("\u521B\u5EFA\u5931\u8D25: " + (e?.message || "\u672A\u77E5\u9519\u8BEF"), "error");
    } finally {
      creating.value = false;
    }
  };
  return /* @__PURE__ */ jsxs("div", { class: s.wrap, children: [
    /* @__PURE__ */ jsxs(Show, { when: step.value === 1, children: [
      /* @__PURE__ */ jsx("div", { class: s.icon, children: "\u{1F44B}" }),
      /* @__PURE__ */ jsx("h2", { class: s.title, children: "\u6B22\u8FCE\u4F7F\u7528 Org" }),
      /* @__PURE__ */ jsx("p", { class: s.desc, children: "\u4F01\u4E1A\u7EA7 AI \u534F\u4F5C\u5E73\u53F0\u3002\u4EBA\u548C AI Agent \u5728\u540C\u4E00\u4E2A\u7EC4\u7EC7\u67B6\u6784\u4E0B\u534F\u540C\u5DE5\u4F5C\u3002" }),
      /* @__PURE__ */ jsxs("div", { class: "flex gap-2 justify-center", children: [
        /* @__PURE__ */ jsx("button", { class: s.btn, onClick: () => step.value = 2, children: "\u5FEB\u901F\u5F00\u59CB" }),
        /* @__PURE__ */ jsx("button", { class: s.skip, onClick: onDone, children: "\u7A0D\u540E\u8BBE\u7F6E" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Show, { when: step.value === 2, children: [
      /* @__PURE__ */ jsx("div", { class: s.icon, children: "\u{1F3E2}" }),
      /* @__PURE__ */ jsx("h2", { class: s.title, children: "\u521B\u5EFA\u4F60\u7684\u7B2C\u4E00\u4E2A\u79DF\u6237" }),
      /* @__PURE__ */ jsx("p", { class: s.desc, children: "\u79DF\u6237\u662F\u7EC4\u7EC7\u7684\u6700\u9AD8\u5C42\u7EA7\uFF0C\u5305\u542B\u516C\u53F8\u3001\u90E8\u95E8\u548C\u6210\u5458\u3002" }),
      /* @__PURE__ */ jsx("input", { class: s.input, value: newName, onInput: (e) => newName.value = e.target.value, placeholder: "\u79DF\u6237\u540D\u79F0\uFF08\u5982\uFF1A\u6211\u7684\u516C\u53F8\uFF09" }),
      /* @__PURE__ */ jsx("input", { class: s.input, value: newSlug, onInput: (e) => newSlug.value = e.target.value, placeholder: "\u6807\u8BC6\uFF08\u5982\uFF1Amy-company\uFF09" }),
      /* @__PURE__ */ jsx("button", { class: s.btn, onClick: createAndGo, disabled: creating.value, children: creating.value ? "\u521B\u5EFA\u4E2D..." : "\u{1F680} \u521B\u5EFA\u5E76\u5F00\u59CB" })
    ] }),
    /* @__PURE__ */ jsxs("div", { class: "mt-6", children: [
      /* @__PURE__ */ jsx("span", { class: step.value === 1 ? s.dotActive : s.dot }),
      /* @__PURE__ */ jsx("span", { class: step.value === 2 ? s.dotActive : s.dot })
    ] })
  ] });
}
function HomePage(_props, ctx2) {
  const tenants = signal([]);
  const loading = signal(true);
  const showCreate = signal(false);
  const newName = signal("");
  const newSlug = signal("");
  const showOnboarding = signal(false);
  const loadError = signal("");
  onMount(() => {
    ctx2.api.get("/tenants").then((list) => {
      tenants.value = list;
      loading.value = false;
      if (list.length === 0) showOnboarding.value = true;
    }).catch((e) => {
      loading.value = false;
      loadError.value = e?.message || "\u52A0\u8F7D\u5931\u8D25";
    });
  });
  const createTenant = async () => {
    try {
      const t = await ctx2.api.post("/tenants", { name: newName.value, slug: newSlug.value });
      tenants.value = [...tenants.value, t];
      showCreate.value = false;
      newName.value = "";
      newSlug.value = "";
      showToast("\u79DF\u6237\u521B\u5EFA\u6210\u529F\uFF01", "success");
    } catch (e) {
      showToast("\u521B\u5EFA\u5931\u8D25: " + (e?.message || "\u672A\u77E5\u9519\u8BEF"), "error");
    }
  };
  const s = createStyles({
    page: "p-8",
    header: "flex items-center justify-between mb-6",
    title: "text-2xl font-bold",
    subtitle: "text-gray-500 text-sm",
    card: "bg-white rounded-xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow"
  });
  return /* @__PURE__ */ jsxs("div", { class: s.page, children: [
    /* @__PURE__ */ jsx(Show, { when: showOnboarding, children: /* @__PURE__ */ jsx(OnboardingWizard, { onDone: () => {
      showOnboarding.value = false;
    }, ctx: ctx2 }) }),
    /* @__PURE__ */ jsxs(Show, { when: computed(() => !showOnboarding.value), children: [
      /* @__PURE__ */ jsxs("div", { class: s.header, children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h1", { class: s.title, children: "Org" }),
          /* @__PURE__ */ jsx("p", { class: s.subtitle, children: "Enterprise AI Collaboration Platform" })
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            class: "px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600",
            onClick: () => showCreate.value = true,
            children: "+ \u521B\u5EFA\u79DF\u6237"
          }
        )
      ] }),
      /* @__PURE__ */ jsx(Show, { when: loading, children: /* @__PURE__ */ jsx(Skeleton, { lines: 4 }) }),
      /* @__PURE__ */ jsx(Show, { when: loadError, children: /* @__PURE__ */ jsxs("div", { class: "bg-red-50 text-red-600 rounded-xl p-4 mb-4 text-sm", children: [
        "\u52A0\u8F7D\u5931\u8D25: ",
        loadError,
        /* @__PURE__ */ jsx("button", { class: "ml-2 underline cursor-pointer", onClick: () => {
          loading.value = true;
          loadError.value = "";
          ctx2.api.get("/tenants").then((l) => {
            tenants.value = l;
            loading.value = false;
            if (l.length === 0) showOnboarding.value = true;
          }).catch((e) => {
            loading.value = false;
            loadError.value = e.message;
          });
        }, children: "\u91CD\u8BD5" })
      ] }) }),
      /* @__PURE__ */ jsxs(Modal, { show: showCreate.value, onClose: () => showCreate.value = false, title: "\u521B\u5EFA\u79DF\u6237", children: [
        /* @__PURE__ */ jsx("label", { class: "text-xs text-gray-500 block mb-1", children: "\u540D\u79F0" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            class: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:outline-none focus:border-blue-500",
            value: newName,
            onInput: (e) => newName.value = e.target.value,
            placeholder: "\u4F8B\u5982: \u6211\u7684\u516C\u53F8"
          }
        ),
        /* @__PURE__ */ jsx("label", { class: "text-xs text-gray-500 block mb-1", children: "\u6807\u8BC6\uFF08slug\uFF09" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            class: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4 focus:outline-none focus:border-blue-500",
            value: newSlug,
            onInput: (e) => newSlug.value = e.target.value,
            placeholder: "\u4F8B\u5982: my-company"
          }
        ),
        /* @__PURE__ */ jsxs("div", { class: "flex gap-2 justify-end", children: [
          /* @__PURE__ */ jsx(Button, { variant: "secondary", onClick: () => showCreate.value = false, children: "\u53D6\u6D88" }),
          /* @__PURE__ */ jsx(Button, { onClick: createTenant, children: "\u521B\u5EFA" })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { class: "grid gap-4", children: /* @__PURE__ */ jsx(For, { each: tenants, children: (t) => /* @__PURE__ */ jsxs("div", { class: s.card, onClick: () => ctx2.app.navigate(`/tenant/${t.id}`), children: [
        /* @__PURE__ */ jsx("h3", { class: "font-semibold text-lg", children: t.name }),
        /* @__PURE__ */ jsxs("p", { class: "text-gray-400 text-sm mt-1", children: [
          "/",
          t.slug
        ] }),
        /* @__PURE__ */ jsxs("p", { class: "text-gray-300 text-xs mt-2", children: [
          "\u521B\u5EFA\u4E8E ",
          formatDate(t.created_at)
        ] })
      ] }) }) }),
      /* @__PURE__ */ jsx(Show, { when: computed(() => !loading.value && tenants.value.length === 0), children: /* @__PURE__ */ jsxs("div", { class: "text-center py-16 text-gray-400", children: [
        /* @__PURE__ */ jsx("p", { class: "text-5xl mb-3", children: "\u{1F3E2}" }),
        /* @__PURE__ */ jsx("p", { class: "mb-4", children: "\u8FD8\u6CA1\u6709\u79DF\u6237\uFF0C\u5F00\u59CB\u521B\u5EFA\u7B2C\u4E00\u4E2A" }),
        /* @__PURE__ */ jsx(
          "button",
          {
            class: "px-5 py-2 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600",
            onClick: () => showCreate.value = true,
            children: "+ \u521B\u5EFA\u79DF\u6237"
          }
        )
      ] }) })
    ] })
  ] });
}
function TenantPage(_props, ctx2) {
  const { tenantId } = ctx2.route.params;
  const tenant = signal(null);
  const companies = signal([]);
  const loading = signal(true);
  const showCreate = signal(false);
  const newName = signal("");
  onMount(() => {
    Promise.all([
      ctx2.api.get(`/tenants/${tenantId}`).then((t) => tenant.value = t),
      ctx2.api.get(`/tenants/${tenantId}/companies`).then((list) => companies.value = list)
    ]).finally(() => loading.value = false);
  });
  const createCompany = async () => {
    try {
      const c = await ctx2.api.post(`/tenants/${tenantId}/companies`, { name: newName.value });
      companies.value = [...companies.value, c];
      showCreate.value = false;
      newName.value = "";
      showToast("\u516C\u53F8\u521B\u5EFA\u6210\u529F\uFF01", "success");
    } catch (e) {
      showToast("\u521B\u5EFA\u5931\u8D25: " + (e?.message || "\u672A\u77E5\u9519\u8BEF"), "error");
    }
  };
  return /* @__PURE__ */ jsxs("div", { class: "p-8", children: [
    /* @__PURE__ */ jsxs("div", { class: "mb-6", children: [
      /* @__PURE__ */ jsx("p", { class: "text-sm text-blue-500 cursor-pointer mb-1", onClick: () => ctx2.app.navigate("/"), children: "\u2190 \u8FD4\u56DE" }),
      /* @__PURE__ */ jsxs("div", { class: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("h1", { class: "text-2xl font-bold", children: computed(() => tenant.value?.name || "\u52A0\u8F7D\u4E2D...") }) }),
        /* @__PURE__ */ jsx(
          "button",
          {
            class: "px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600",
            onClick: () => showCreate.value = true,
            children: "+ \u521B\u5EFA\u516C\u53F8"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx(Show, { when: loading, children: /* @__PURE__ */ jsx("p", { class: "text-gray-400 text-center py-10", children: "\u52A0\u8F7D\u4E2D..." }) }),
    /* @__PURE__ */ jsxs(Modal, { show: showCreate.value, onClose: () => showCreate.value = false, title: "\u521B\u5EFA\u516C\u53F8", children: [
      /* @__PURE__ */ jsx("label", { class: "text-xs text-gray-500 block mb-1", children: "\u516C\u53F8\u540D\u79F0" }),
      /* @__PURE__ */ jsx(
        "input",
        {
          class: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4",
          value: newName,
          onInput: (e) => newName.value = e.target.value,
          placeholder: "\u4F8B\u5982: Engineering"
        }
      ),
      /* @__PURE__ */ jsxs("div", { class: "flex gap-2 justify-end", children: [
        /* @__PURE__ */ jsx(Button, { variant: "secondary", onClick: () => showCreate.value = false, children: "\u53D6\u6D88" }),
        /* @__PURE__ */ jsx(Button, { onClick: createCompany, children: "\u521B\u5EFA" })
      ] })
    ] }),
    /* @__PURE__ */ jsx(For, { each: companies, children: (c) => /* @__PURE__ */ jsx(
      "div",
      {
        class: "bg-white rounded-xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow mb-4",
        onClick: () => ctx2.app.navigate(`/tenant/${tenantId}/company/${c.id}`),
        children: /* @__PURE__ */ jsx("h3", { class: "font-semibold text-lg", children: c.name })
      }
    ) }),
    /* @__PURE__ */ jsx(Show, { when: !loading && companies.value.length === 0, children: /* @__PURE__ */ jsxs("div", { class: "text-center py-16 text-gray-400", children: [
      /* @__PURE__ */ jsx("p", { class: "text-5xl mb-3", children: "\u{1F3D7}\uFE0F" }),
      /* @__PURE__ */ jsx("p", { children: "\u8FD8\u6CA1\u6709\u516C\u53F8" })
    ] }) })
  ] });
}
function CompanyPage(_props, ctx2) {
  const { tenantId, companyId } = ctx2.route.params;
  const company = signal(null);
  const departments = signal([]);
  const loading = signal(true);
  const showCreate = signal(false);
  const newName = signal("");
  const newDesc = signal("");
  onMount(() => {
    Promise.all([
      ctx2.api.get(`/companies/${companyId}`).then((c) => company.value = c),
      ctx2.api.get(`/companies/${companyId}/departments`).then((list) => departments.value = list)
    ]).finally(() => loading.value = false);
  });
  const createDepartment = async () => {
    try {
      const d = await ctx2.api.post(`/companies/${companyId}/departments`, { name: newName.value, description: newDesc.value || void 0 });
      departments.value = [...departments.value, d];
      showCreate.value = false;
      newName.value = "";
      newDesc.value = "";
      showToast("\u90E8\u95E8\u521B\u5EFA\u6210\u529F\uFF01\u5DF2\u81EA\u52A8\u521B\u5EFA\u804A\u5929\u4F1A\u8BDD\u3002", "success");
    } catch (e) {
      showToast("\u521B\u5EFA\u5931\u8D25: " + (e?.message || "\u672A\u77E5\u9519\u8BEF"), "error");
    }
  };
  return /* @__PURE__ */ jsxs("div", { class: "p-8", children: [
    /* @__PURE__ */ jsxs("div", { class: "mb-6", children: [
      /* @__PURE__ */ jsx("p", { class: "text-sm text-blue-500 cursor-pointer mb-1", onClick: () => ctx2.app.navigate(`/tenant/${tenantId}`), children: "\u2190 \u8FD4\u56DE" }),
      /* @__PURE__ */ jsxs("div", { class: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("h1", { class: "text-2xl font-bold", children: computed(() => company.value?.name || "\u52A0\u8F7D\u4E2D...") }) }),
        /* @__PURE__ */ jsx(
          "button",
          {
            class: "px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600",
            onClick: () => showCreate.value = true,
            children: "+ \u521B\u5EFA\u90E8\u95E8"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx(Show, { when: loading, children: /* @__PURE__ */ jsx("p", { class: "text-gray-400 text-center py-10", children: "\u52A0\u8F7D\u4E2D..." }) }),
    /* @__PURE__ */ jsxs(Modal, { show: showCreate.value, onClose: () => showCreate.value = false, title: "\u521B\u5EFA\u90E8\u95E8", children: [
      /* @__PURE__ */ jsx("label", { class: "text-xs text-gray-500 block mb-1", children: "\u90E8\u95E8\u540D\u79F0" }),
      /* @__PURE__ */ jsx(
        "input",
        {
          class: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3",
          value: newName,
          onInput: (e) => newName.value = e.target.value,
          placeholder: "\u4F8B\u5982: AI Team"
        }
      ),
      /* @__PURE__ */ jsx("label", { class: "text-xs text-gray-500 block mb-1", children: "\u63CF\u8FF0\uFF08\u53EF\u9009\uFF09" }),
      /* @__PURE__ */ jsx(
        "input",
        {
          class: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4",
          value: newDesc,
          onInput: (e) => newDesc.value = e.target.value,
          placeholder: "\u90E8\u95E8\u7684\u804C\u8D23"
        }
      ),
      /* @__PURE__ */ jsxs("div", { class: "flex gap-2 justify-end", children: [
        /* @__PURE__ */ jsx(Button, { variant: "secondary", onClick: () => showCreate.value = false, children: "\u53D6\u6D88" }),
        /* @__PURE__ */ jsx(Button, { onClick: createDepartment, children: "\u521B\u5EFA" })
      ] })
    ] }),
    /* @__PURE__ */ jsx(For, { each: departments, children: (d) => /* @__PURE__ */ jsx(
      "div",
      {
        class: "bg-white rounded-xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow mb-4",
        onClick: () => ctx2.app.navigate(`/tenant/${tenantId}/company/${companyId}/dept/${d.id}`),
        children: /* @__PURE__ */ jsxs("div", { class: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("h3", { class: "font-semibold text-lg", children: d.name }),
            /* @__PURE__ */ jsx(Show, { when: d.description, children: /* @__PURE__ */ jsx("p", { class: "text-gray-400 text-sm mt-1", children: d.description }) })
          ] }),
          /* @__PURE__ */ jsx(Show, { when: d.agent_count !== void 0, children: /* @__PURE__ */ jsxs("span", { class: "text-sm text-gray-300", children: [
            d.agent_count,
            " \u6210\u5458"
          ] }) })
        ] })
      }
    ) }),
    /* @__PURE__ */ jsx(Show, { when: !loading && departments.value.length === 0, children: /* @__PURE__ */ jsxs("div", { class: "text-center py-16 text-gray-400", children: [
      /* @__PURE__ */ jsx("p", { class: "text-5xl mb-3", children: "\u{1F4AC}" }),
      /* @__PURE__ */ jsx("p", { children: "\u8FD8\u6CA1\u6709\u90E8\u95E8" })
    ] }) })
  ] });
}
function DepartmentPage(_props, ctx2) {
  const { tenantId, companyId, deptId } = ctx2.route.params;
  const dept = signal(null);
  const agents = signal([]);
  const activeTab = signal(null);
  const showAddAgent = signal(false);
  const allAgents = signal([]);
  const selectedAgentId = signal("");
  const kbDocs = signal([]);
  const kbLoading = signal(false);
  const importTitle = signal("");
  const importContent = signal("");
  const importSource = signal("");
  const searchQuery = signal("");
  const searchResults = signal([]);
  onMount(async () => {
    const [d, ag] = await Promise.all([
      ctx2.api.get(`/departments/${deptId}`),
      ctx2.api.get(`/departments/${deptId}/agents`)
    ]);
    dept.value = d;
    agents.value = ag;
  });
  const openAddAgent = async () => {
    showAddAgent.value = true;
    allAgents.value = await ctx2.api.get("/agents");
  };
  const addAgent = async () => {
    if (!selectedAgentId.value) return;
    try {
      await ctx2.api.post(`/departments/${deptId}/agents`, { agentId: selectedAgentId.value, role: "member" });
      agents.value = await ctx2.api.get(`/departments/${deptId}/agents`);
      showAddAgent.value = false;
      selectedAgentId.value = "";
      showToast("Agent \u5DF2\u52A0\u5165\u90E8\u95E8", "success");
    } catch (e) {
      showToast("\u6DFB\u52A0\u5931\u8D25: " + (e?.message || "\u672A\u77E5\u9519\u8BEF"), "error");
    }
  };
  const loadKBDocs = async () => {
    kbLoading.value = true;
    kbDocs.value = await ctx2.api.get(`/departments/${deptId}/kb/documents`);
    kbLoading.value = false;
  };
  const importDoc = async () => {
    if (!importTitle.value || !importContent.value) return;
    try {
      await ctx2.api.post(`/departments/${deptId}/kb/import`, {
        title: importTitle.value,
        content: importContent.value,
        source: importSource.value || void 0
      });
      importTitle.value = "";
      importContent.value = "";
      importSource.value = "";
      await loadKBDocs();
      showToast("\u6587\u6863\u5DF2\u5BFC\u5165\u77E5\u8BC6\u5E93 \u2713", "success");
    } catch (e) {
      showToast("\u5BFC\u5165\u5931\u8D25: " + (e?.message || "\u672A\u77E5\u9519\u8BEF"), "error");
    }
  };
  const searchKB = async () => {
    if (!searchQuery.value) return;
    searchResults.value = await ctx2.api.post(`/departments/${deptId}/kb/search`, { query: searchQuery.value });
  };
  const setTab = (tab) => {
    activeTab.value = activeTab.value === tab ? null : tab;
    if (tab === "kb" && kbDocs.value.length === 0) loadKBDocs();
  };
  const tabs = [
    { key: "members", label: `\u6210\u5458 (${agents.value.length})`, icon: "\u{1F465}" },
    { key: "kb", label: "\u77E5\u8BC6\u5E93", icon: "\u{1F4DA}" }
  ];
  const s = createStyles({
    container: "flex flex-col h-full",
    header: "px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-white shrink-0",
    body: "flex-1 flex overflow-hidden",
    panel: "w-72 border-l border-gray-200 bg-gray-50 overflow-y-auto shrink-0 flex flex-col",
    tabBar: "flex border-b border-gray-200 shrink-0",
    tab: "flex-1 px-3 py-2 text-xs font-medium text-gray-500 cursor-pointer text-center hover:bg-gray-100 transition-colors",
    tabActive: "flex-1 px-3 py-2 text-xs font-medium text-blue-600 cursor-pointer text-center bg-white border-b-2 border-blue-500 transition-colors",
    panelBody: "flex-1 overflow-y-auto",
    panelSection: "p-3 border-b border-gray-200",
    panelTitle: "text-xs font-semibold text-gray-500 uppercase mb-2",
    agentItem: "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer",
    kbItem: "px-3 py-2.5 border-b border-gray-100 text-sm hover:bg-blue-50 transition-colors cursor-default",
    kbChip: "inline-block text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 mr-1",
    input: "w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs mb-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all",
    textarea: "w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs mb-2 h-16 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all resize-none",
    btnPrimary: "px-3 py-1.5 bg-blue-500 text-white rounded-md text-xs cursor-pointer hover:bg-blue-600 transition-colors",
    searchResult: "px-3 py-2 border-b border-blue-50 text-xs text-gray-600 hover:bg-blue-50 transition-colors",
    score: "text-blue-500 font-medium"
  });
  return /* @__PURE__ */ jsxs("div", { class: s.container, children: [
    /* @__PURE__ */ jsxs("div", { class: s.header, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(
          "p",
          {
            class: "text-xs text-blue-500 cursor-pointer mb-1",
            onClick: () => ctx2.app.navigate(`/tenant/${tenantId}/company/${companyId}`),
            children: "\u2190 \u8FD4\u56DE\u516C\u53F8"
          }
        ),
        /* @__PURE__ */ jsx("h1", { class: "font-semibold text-base", children: computed(() => dept.value?.name || "\u52A0\u8F7D\u4E2D...") })
      ] }),
      /* @__PURE__ */ jsx("div", { class: "flex gap-1", children: /* @__PURE__ */ jsx(For, { each: tabs, children: (tab) => /* @__PURE__ */ jsxs(
        "button",
        {
          class: activeTab.value === tab.key ? s.tabActive : s.tab,
          onClick: () => setTab(tab.key),
          children: [
            tab.icon,
            " ",
            tab.label
          ]
        }
      ) }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { class: s.body, children: [
      /* @__PURE__ */ jsx("div", { class: "flex-1 flex flex-col min-w-0", children: /* @__PURE__ */ jsx(Show, { when: dept.value?.conversation_id, fallback: /* @__PURE__ */ jsx("div", { class: "flex-1 flex items-center justify-center text-gray-400 text-sm", children: "\u90E8\u95E8\u8FD8\u6CA1\u6709\u804A\u5929\u4F1A\u8BDD" }), children: /* @__PURE__ */ jsx(DepartmentChat, { conversationId: dept.value.conversation_id, agents: agents.value }) }) }),
      /* @__PURE__ */ jsx(Show, { when: activeTab.value, children: /* @__PURE__ */ jsxs("div", { class: s.panel, children: [
        /* @__PURE__ */ jsx("div", { class: s.tabBar, children: /* @__PURE__ */ jsx(For, { each: tabs, children: (tab) => /* @__PURE__ */ jsxs(
          "div",
          {
            class: activeTab.value === tab.key ? s.tabActive : s.tab,
            onClick: () => setTab(tab.key),
            children: [
              tab.icon,
              " ",
              tab.label
            ]
          }
        ) }) }),
        /* @__PURE__ */ jsx(Show, { when: activeTab.value === "members", children: /* @__PURE__ */ jsxs("div", { class: s.panelBody, children: [
          /* @__PURE__ */ jsxs("div", { class: s.panelSection, children: [
            /* @__PURE__ */ jsxs("div", { class: "flex items-center justify-between mb-3", children: [
              /* @__PURE__ */ jsx("h3", { class: s.panelTitle, children: "\u90E8\u95E8\u6210\u5458" }),
              /* @__PURE__ */ jsx("button", { class: "text-xs text-blue-500 cursor-pointer hover:text-blue-700", onClick: openAddAgent, children: "+ \u6DFB\u52A0" })
            ] }),
            /* @__PURE__ */ jsx(For, { each: agents, children: (a) => /* @__PURE__ */ jsxs("div", { class: s.agentItem, children: [
              /* @__PURE__ */ jsx("span", { children: a.kind === "ai" ? "\u{1F916}" : a.kind === "user" ? "\u{1F464}" : a.kind === "webhook" ? "\u{1F517}" : "\u{1F4DA}" }),
              /* @__PURE__ */ jsx("span", { children: a.name }),
              /* @__PURE__ */ jsx("span", { class: "text-xs text-gray-400 ml-auto", children: a.kind })
            ] }) }),
            /* @__PURE__ */ jsx(Show, { when: agents.value.length === 0, children: /* @__PURE__ */ jsx("p", { class: "text-xs text-gray-400 text-center py-4", children: "\u6682\u65E0\u6210\u5458" }) })
          ] }),
          /* @__PURE__ */ jsx(Show, { when: showAddAgent, children: /* @__PURE__ */ jsxs("div", { class: s.panelSection, children: [
            /* @__PURE__ */ jsxs(
              "select",
              {
                class: "w-full px-2 py-1.5 border border-gray-300 rounded text-xs mb-2",
                value: selectedAgentId,
                onChange: (e) => selectedAgentId.value = e.target.value,
                children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: "\u9009\u62E9 Agent..." }),
                  /* @__PURE__ */ jsx(For, { each: allAgents, children: (a) => /* @__PURE__ */ jsxs("option", { value: a.id, children: [
                    a.name,
                    " (",
                    a.kind,
                    ")"
                  ] }) })
                ]
              }
            ),
            /* @__PURE__ */ jsxs("div", { class: "flex gap-2", children: [
              /* @__PURE__ */ jsx("button", { class: "flex-1 px-2 py-1 bg-blue-500 text-white rounded text-xs cursor-pointer hover:bg-blue-600", onClick: addAgent, children: "\u6DFB\u52A0" }),
              /* @__PURE__ */ jsx("button", { class: "px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs cursor-pointer", onClick: () => showAddAgent.value = false, children: "\u53D6\u6D88" })
            ] })
          ] }) })
        ] }) }),
        /* @__PURE__ */ jsx(Show, { when: activeTab.value === "kb", children: /* @__PURE__ */ jsxs("div", { class: s.panelBody, children: [
          /* @__PURE__ */ jsxs("div", { class: s.panelSection, children: [
            /* @__PURE__ */ jsx("h3", { class: s.panelTitle, children: "\u5BFC\u5165\u77E5\u8BC6" }),
            /* @__PURE__ */ jsx("input", { class: s.input, value: importTitle, onInput: (e) => importTitle.value = e.target.value, placeholder: "\u6807\u9898" }),
            /* @__PURE__ */ jsx("textarea", { class: s.textarea, value: importContent, onInput: (e) => importContent.value = e.target.value, placeholder: "\u7C98\u8D34\u6587\u6863\u5185\u5BB9..." }),
            /* @__PURE__ */ jsx("input", { class: s.input, value: importSource, onInput: (e) => importSource.value = e.target.value, placeholder: "\u6765\u6E90\uFF08\u53EF\u9009\uFF09" }),
            /* @__PURE__ */ jsx("button", { class: s.btnPrimary, onClick: importDoc, children: "\u5BFC\u5165" })
          ] }),
          /* @__PURE__ */ jsxs("div", { class: s.panelSection, children: [
            /* @__PURE__ */ jsx("h3", { class: s.panelTitle, children: "\u68C0\u7D22\u6D4B\u8BD5" }),
            /* @__PURE__ */ jsxs("div", { class: "flex gap-1 mb-2", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  class: "flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs",
                  value: searchQuery,
                  onInput: (e) => searchQuery.value = e.target.value,
                  placeholder: "\u8F93\u5165\u67E5\u8BE2...",
                  onKeyDown: (e) => e.key === "Enter" && searchKB()
                }
              ),
              /* @__PURE__ */ jsx("button", { class: s.btnPrimary, onClick: searchKB, children: "\u641C\u7D22" })
            ] }),
            /* @__PURE__ */ jsx(For, { each: searchResults, children: (r) => /* @__PURE__ */ jsxs("div", { class: s.searchResult, children: [
              /* @__PURE__ */ jsx("strong", { children: r.title || "\u7247\u6BB5" }),
              " ",
              /* @__PURE__ */ jsxs("span", { class: s.score, children: [
                Math.round(r.score * 100),
                "%"
              ] }),
              /* @__PURE__ */ jsx("br", {}),
              r.content.slice(0, 100),
              "..."
            ] }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { class: s.panelSection, children: [
            /* @__PURE__ */ jsx("h3", { class: s.panelTitle, children: computed(() => `\u6587\u6863 (${kbDocs.value.length})`) }),
            /* @__PURE__ */ jsx(Show, { when: kbLoading, children: /* @__PURE__ */ jsx("p", { class: "text-xs text-gray-400 text-center py-2", children: "\u52A0\u8F7D\u4E2D..." }) }),
            /* @__PURE__ */ jsx(For, { each: kbDocs, children: (doc) => /* @__PURE__ */ jsxs("div", { class: s.kbItem, children: [
              /* @__PURE__ */ jsx("p", { class: "font-medium", children: doc.title }),
              /* @__PURE__ */ jsxs("p", { children: [
                /* @__PURE__ */ jsxs("span", { class: s.kbChip, children: [
                  doc.chunk_count,
                  " \u6BB5"
                ] }),
                " ",
                doc.source || "\u65E0\u6765\u6E90"
              ] })
            ] }) }),
            /* @__PURE__ */ jsx(Show, { when: !kbLoading && kbDocs.value.length === 0, children: /* @__PURE__ */ jsx("p", { class: "text-xs text-gray-400 text-center py-2", children: "\u6682\u65E0\u6587\u6863" }) })
          ] })
        ] }) })
      ] }) })
    ] })
  ] });
}
function NotFound(_props, ctx2) {
  return /* @__PURE__ */ jsxs("div", { class: "text-center py-20", children: [
    /* @__PURE__ */ jsx("h1", { class: "text-5xl text-gray-300 font-bold", children: "404" }),
    /* @__PURE__ */ jsx("p", { class: "my-3 text-gray-400", children: "\u9875\u9762\u672A\u627E\u5230" }),
    /* @__PURE__ */ jsx("button", { class: "px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer", onClick: () => ctx2.app.navigate("/"), children: "\u56DE\u9996\u9875" })
  ] });
}
function OrgTree(_props, ctx2) {
  const tenants = signal([]);
  const expanded = signal({});
  const companiesMap = signal({});
  const departmentsMap = signal({});
  const loading = signal(true);
  const error = signal("");
  onMount(async () => {
    try {
      const list = await ctx2.api.get("/tenants");
      tenants.value = list;
      loading.value = false;
      if (list.length > 0) {
        expanded.value = { ...expanded.value, [list[0].id]: true };
        await loadCompanies(list[0].id);
      }
    } catch (e) {
      loading.value = false;
      error.value = e?.message || "\u52A0\u8F7D\u5931\u8D25";
    }
  });
  const loadCompanies = async (id) => {
    if (companiesMap.value[id]) return;
    companiesMap.value = { ...companiesMap.value, [id]: await ctx2.api.get(`/tenants/${id}/companies`) };
  };
  const loadDepartments = async (id) => {
    if (departmentsMap.value[id]) return;
    departmentsMap.value = { ...departmentsMap.value, [id]: await ctx2.api.get(`/companies/${id}/departments`) };
  };
  const toggleTenant = async (id) => {
    expanded.value = { ...expanded.value, [id]: !expanded.value[id] };
    if (expanded.value[id]) await loadCompanies(id);
  };
  const toggleCompany = async (tid, cid) => {
    const k = `c:${cid}`;
    expanded.value = { ...expanded.value, [k]: !expanded.value[k] };
    if (expanded.value[k]) await loadDepartments(cid);
    ctx2.app.navigate(`/tenant/${tid}/company/${cid}`);
  };
  const active = (p) => window.location.hash.includes(p);
  const s = createStyles({
    tree: "flex-1 overflow-y-auto px-1 py-2",
    th: "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium cursor-pointer transition-all hover:bg-gray-200",
    thA: "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium cursor-pointer bg-blue-50 text-blue-700 transition-all",
    ci: "flex items-center gap-1.5 px-2.5 py-1.5 ml-4 rounded-md text-sm text-gray-600 cursor-pointer transition-all hover:bg-gray-200",
    ciA: "flex items-center gap-1.5 px-2.5 py-1.5 ml-4 rounded-md text-sm text-blue-600 cursor-pointer bg-blue-50 border-l-[3px] border-blue-500 rounded-l-none transition-all",
    di: "flex items-center gap-1.5 px-2.5 py-1.5 ml-8 rounded-md text-sm text-gray-500 cursor-pointer transition-all hover:bg-gray-200",
    diA: "flex items-center gap-1.5 px-2.5 py-1.5 ml-8 rounded-md text-sm text-blue-600 cursor-pointer bg-blue-50 border-l-[3px] border-blue-500 rounded-l-none transition-all"
  });
  return /* @__PURE__ */ jsxs("div", { class: s.tree, children: [
    /* @__PURE__ */ jsx(Show, { when: loading, children: /* @__PURE__ */ jsx("p", { class: "text-xs text-gray-400 text-center py-4", children: "\u52A0\u8F7D\u4E2D..." }) }),
    /* @__PURE__ */ jsx(Show, { when: error, children: /* @__PURE__ */ jsx("p", { class: "text-xs text-red-400 text-center py-4", children: error }) }),
    /* @__PURE__ */ jsx(For, { each: tenants, children: (t) => /* @__PURE__ */ jsxs("div", { class: "mb-2", children: [
      /* @__PURE__ */ jsxs(
        "div",
        {
          class: active(`/tenant/${t.id}`) && !active("/company/") ? s.thA : `${s.th} text-gray-700 hover:bg-gray-200`,
          onClick: () => {
            toggleTenant(t.id);
            ctx2.app.navigate(`/tenant/${t.id}`);
          },
          children: [
            /* @__PURE__ */ jsx("span", { children: expanded.value[t.id] ? "\u25BC" : "\u25B6" }),
            /* @__PURE__ */ jsx("span", { children: "\u{1F3E2}" }),
            /* @__PURE__ */ jsx("span", { children: t.name })
          ]
        }
      ),
      /* @__PURE__ */ jsx(Show, { when: expanded.value[t.id] && companiesMap.value[t.id], children: /* @__PURE__ */ jsx(For, { each: companiesMap.value[t.id] || [], children: (c) => /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs(
          "div",
          {
            class: active(`/company/${c.id}`) ? s.ciA : s.ci,
            onClick: () => toggleCompany(t.id, c.id),
            children: [
              /* @__PURE__ */ jsx("span", { children: expanded.value[`c:${c.id}`] ? "\u25BC" : "\u25B6" }),
              /* @__PURE__ */ jsx("span", { children: "\u{1F3D7}\uFE0F" }),
              /* @__PURE__ */ jsx("span", { children: c.name })
            ]
          }
        ),
        /* @__PURE__ */ jsx(Show, { when: expanded.value[`c:${c.id}`] && departmentsMap.value[c.id], children: /* @__PURE__ */ jsx(For, { each: departmentsMap.value[c.id] || [], children: (d) => /* @__PURE__ */ jsxs(
          "div",
          {
            class: active(`/dept/${d.id}`) ? s.diA : s.di,
            onClick: () => ctx2.app.navigate(`/tenant/${t.id}/company/${c.id}/dept/${d.id}`),
            children: [
              /* @__PURE__ */ jsx("span", { children: "\u{1F4AC}" }),
              /* @__PURE__ */ jsx("span", { children: d.name })
            ]
          }
        ) }) })
      ] }) }) })
    ] }) }),
    /* @__PURE__ */ jsx(Show, { when: !loading && tenants.value.length === 0, children: /* @__PURE__ */ jsx("p", { class: "text-xs text-gray-400 text-center py-4", children: "\u8FD8\u6CA1\u6709\u79DF\u6237" }) })
  ] });
}
function Sidebar({ collapsed, onToggle }, ctx2) {
  const searchQuery = signal("");
  const recentConvs = signal([]);
  const showOrgTree = signal(true);
  onMount(() => {
    ctx2.api.get("/conversations").then((list) => {
      recentConvs.value = list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5);
    }).catch(() => {
    });
  });
  const s = createStyles({
    wrap: `${collapsed ? "w-0 md:w-[220px] overflow-hidden" : "w-[220px]"} border-r border-gray-200 bg-[#fafafa] flex flex-col overflow-hidden shrink-0 transition-all duration-300`,
    header: "px-3 py-2.5 border-b border-gray-200 flex items-center justify-between shrink-0",
    title: "font-bold text-sm text-blue-600 cursor-pointer",
    userName: "text-xs text-gray-400 max-w-[100px] truncate",
    searchBox: "mx-2 my-2 px-2.5 py-1.5 bg-gray-100 rounded-md text-xs text-gray-400 cursor-text focus:outline-none focus:bg-white focus:border focus:border-blue-300",
    section: "mb-1",
    sectionHeader: "px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between cursor-pointer hover:text-gray-700",
    recentItem: "flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-md mx-2 cursor-pointer truncate",
    recentItemActive: "flex items-center gap-2 px-3 py-1.5 text-sm text-blue-700 bg-blue-50 rounded-md mx-2 cursor-pointer truncate",
    recentBadge: "ml-auto bg-red-500 text-white text-xs rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px]",
    status: "px-3 py-2 border-t border-gray-200 text-xs text-gray-400 flex items-center justify-between shrink-0",
    logout: "cursor-pointer hover:text-red-500"
  });
  return /* @__PURE__ */ jsxs("div", { class: s.wrap, children: [
    /* @__PURE__ */ jsxs("div", { class: s.header, children: [
      /* @__PURE__ */ jsx("span", { class: s.title, onClick: () => ctx2.app.navigate("/"), children: "Org" }),
      /* @__PURE__ */ jsx("span", { class: s.userName, children: computed(() => ctx2.user?.name || "") })
    ] }),
    /* @__PURE__ */ jsx("div", { class: s.searchBox, onClick: () => {
    }, children: "\u{1F50D} \u641C\u7D22\u79DF\u6237/\u90E8\u95E8/\u6D88\u606F..." }),
    /* @__PURE__ */ jsx(Show, { when: recentConvs.value.length > 0, children: /* @__PURE__ */ jsxs("div", { class: s.section, children: [
      /* @__PURE__ */ jsx("div", { class: s.sectionHeader, children: /* @__PURE__ */ jsx("span", { children: "\u6700\u8FD1" }) }),
      /* @__PURE__ */ jsx(For, { each: recentConvs, children: (c) => {
        const isActive = ctx2.route.path.includes(c.department?.id || "");
        return /* @__PURE__ */ jsxs(
          "div",
          {
            class: isActive ? s.recentItemActive : s.recentItem,
            onClick: () => {
              if (c.department) {
                ctx2.app.navigate(`/tenant/${ctx2.route.params.tenantId || ""}/company/${ctx2.route.params.companyId || ""}/dept/${c.department.id}`);
              }
            },
            children: [
              /* @__PURE__ */ jsx("span", { children: c.unread > 0 ? "\u{1F4AC}" : "\u{1F4AD}" }),
              /* @__PURE__ */ jsx("span", { class: "flex-1 truncate", children: c.department?.name || c.title }),
              /* @__PURE__ */ jsx(Show, { when: c.unread > 0, children: /* @__PURE__ */ jsx("span", { class: s.recentBadge, children: c.unread > 99 ? "99+" : c.unread }) })
            ]
          }
        );
      } })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { class: s.section, children: [
      /* @__PURE__ */ jsx("div", { class: s.sectionHeader, onClick: () => showOrgTree.value = !showOrgTree.value, children: /* @__PURE__ */ jsxs("span", { children: [
        showOrgTree.value ? "\u25BC" : "\u25B6",
        " \u7EC4\u7EC7"
      ] }) }),
      /* @__PURE__ */ jsx(Show, { when: showOrgTree, children: /* @__PURE__ */ jsx(OrgTree, { _props: {}, ctx: ctx2 }) })
    ] }),
    /* @__PURE__ */ jsx("div", { class: "flex-1" }),
    /* @__PURE__ */ jsxs("div", { class: s.status, children: [
      /* @__PURE__ */ jsx("span", { children: "v0.1" }),
      /* @__PURE__ */ jsx("span", { class: s.logout, onClick: () => ctx2.logout(), children: "\u9000\u51FA" })
    ] })
  ] });
}
function BrowseLayout(_props, ctx2) {
  const sidebarCollapsed = signal(false);
  return /* @__PURE__ */ jsxs("div", { class: "flex h-screen overflow-hidden bg-gray-50", children: [
    /* @__PURE__ */ jsx(Sidebar, { collapsed: sidebarCollapsed.value, onToggle: () => sidebarCollapsed.value = !sidebarCollapsed.value, ctx: ctx2 }),
    /* @__PURE__ */ jsx("div", { class: "flex-1 flex flex-col overflow-hidden min-w-0", children: /* @__PURE__ */ jsx(RouteView, {}) })
  ] });
}
function ConversationList(_props, ctx2) {
  const convs = signal([]);
  const loading = signal(true);
  const currentDeptId = computed(() => ctx2.route.params.deptId || "");
  onMount(() => {
    ctx2.api.get("/conversations").then((list) => {
      convs.value = list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      loading.value = false;
    }).catch(() => loading.value = false);
  });
  const s = createStyles({
    wrap: "w-[240px] border-r border-gray-200 bg-white flex flex-col overflow-hidden shrink-0",
    header: "px-4 py-3 border-b border-gray-100 shrink-0",
    title: "text-xs font-semibold text-gray-500 uppercase",
    list: "flex-1 overflow-y-auto",
    item: "flex items-center gap-2 px-4 py-2.5 cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition-colors",
    itemActive: "flex items-center gap-2 px-4 py-2.5 cursor-pointer border-b border-gray-50 bg-blue-50 border-l-2 border-l-blue-500 transition-colors",
    deptName: "text-sm font-medium truncate",
    deptNameActive: "text-sm font-medium truncate text-blue-700",
    preview: "text-xs text-gray-400 truncate mt-0.5",
    badge: "ml-auto bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1",
    time: "text-xs text-gray-300 ml-auto",
    icon: "text-base shrink-0"
  });
  return /* @__PURE__ */ jsxs("div", { class: s.wrap, children: [
    /* @__PURE__ */ jsx("div", { class: s.header, children: /* @__PURE__ */ jsx("h2", { class: s.title, children: "\u90E8\u95E8\u804A\u5929" }) }),
    /* @__PURE__ */ jsxs("div", { class: s.list, children: [
      /* @__PURE__ */ jsx(Show, { when: loading, children: /* @__PURE__ */ jsx("p", { class: "text-xs text-gray-400 text-center py-8", children: "\u52A0\u8F7D\u4E2D..." }) }),
      /* @__PURE__ */ jsx(For, { each: convs, children: (c) => {
        const isActive = c.department?.id === currentDeptId.value;
        return /* @__PURE__ */ jsxs(
          "div",
          {
            class: isActive ? s.itemActive : s.item,
            onClick: () => c.department && ctx2.app.navigate(`/tenant/${ctx2.route.params.tenantId || ""}/company/${ctx2.route.params.companyId || ""}/dept/${c.department.id}`),
            children: [
              /* @__PURE__ */ jsx("span", { class: s.icon, children: c.unread > 0 ? "\u{1F4AC}" : "\u{1F4AD}" }),
              /* @__PURE__ */ jsxs("div", { class: "flex-1 min-w-0", children: [
                /* @__PURE__ */ jsxs("div", { class: "flex items-center justify-between", children: [
                  /* @__PURE__ */ jsx("span", { class: isActive ? s.deptNameActive : s.deptName, children: c.department?.name || c.title || "\u672A\u77E5" }),
                  /* @__PURE__ */ jsx("span", { class: s.time, children: c.last_message ? new Date(c.last_message.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "" })
                ] }),
                /* @__PURE__ */ jsx("p", { class: s.preview, children: c.last_message?.body?.slice(0, 40) || "\u6682\u65E0\u6D88\u606F" })
              ] }),
              /* @__PURE__ */ jsx(Show, { when: c.unread > 0, children: /* @__PURE__ */ jsx("span", { class: s.badge, children: c.unread > 99 ? "99+" : c.unread }) })
            ]
          }
        );
      } }),
      /* @__PURE__ */ jsx(Show, { when: !loading && convs.value.length === 0, children: /* @__PURE__ */ jsx("p", { class: "text-xs text-gray-400 text-center py-8", children: "\u6682\u65E0\u4F1A\u8BDD" }) })
    ] })
  ] });
}
function ChatLayout(_props, ctx2) {
  const sidebarCollapsed = signal(false);
  return /* @__PURE__ */ jsxs("div", { class: "flex h-screen overflow-hidden bg-gray-50", children: [
    /* @__PURE__ */ jsx(Sidebar, { collapsed: sidebarCollapsed.value, onToggle: () => sidebarCollapsed.value = !sidebarCollapsed.value, ctx: ctx2 }),
    /* @__PURE__ */ jsx(ConversationList, { _props: {}, ctx: ctx2 }),
    /* @__PURE__ */ jsx("div", { class: "flex-1 flex flex-col overflow-hidden min-w-0", children: /* @__PURE__ */ jsx(RouteView, {}) })
  ] });
}
function AppShell(_props, ctx2) {
  const user = computed(() => ctx2.user);
  const isLoggedIn = computed(() => !!user.value);
  const isChat = computed(() => ctx2.route.path.includes("/dept/"));
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(ToastContainer, {}),
    !isLoggedIn.value ? /* @__PURE__ */ jsx(LoginPage, { _props: {}, ctx: ctx2 }) : !isChat.value ? /* @__PURE__ */ jsx(BrowseLayout, { _props: {}, ctx: ctx2 }) : /* @__PURE__ */ jsx(ChatLayout, { _props: {}, ctx: ctx2 })
  ] });
}
var routes = [
  { path: "/", component: HomePage, title: "Org \u9996\u9875" },
  { path: "/tenant/:tenantId", component: TenantPage, title: "\u79DF\u6237" },
  { path: "/tenant/:tenantId/company/:companyId", component: CompanyPage, title: "\u516C\u53F8" },
  { path: "/tenant/:tenantId/company/:companyId/dept/:deptId", component: DepartmentPage, title: "\u90E8\u95E8" }
];
var app = createApp();
app.use(api());
app.use(auth({ loginPath: "/login", registerPath: "/register", mePath: "/me" }));
app.use(ws());
app.use(router({ routes, notFound: NotFound, mode: "hash", transition: "page" }));
app.mount("#root", AppShell);
