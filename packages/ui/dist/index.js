// src/signal.ts
var activeEffect = null;
var effectSubs = /* @__PURE__ */ new WeakMap();
var batchDepth = 0;
var pendingEffects = null;
function notify(fn) {
  if (batchDepth > 0) {
    if (!pendingEffects) pendingEffects = /* @__PURE__ */ new Set();
    pendingEffects.add(fn);
  } else {
    fn();
  }
}
function flushBatch() {
  if (pendingEffects) {
    const effects = pendingEffects;
    pendingEffects = null;
    for (const fn of effects) fn();
  }
}
var Signal = class {
  #value;
  #subs = /* @__PURE__ */ new Set();
  constructor(value) {
    this.#value = value;
  }
  get value() {
    if (activeEffect) {
      this.#subs.add(activeEffect);
      let subs = effectSubs.get(activeEffect);
      if (!subs) {
        subs = /* @__PURE__ */ new Set();
        effectSubs.set(activeEffect, subs);
      }
      subs.add(this);
    }
    return this.#value;
  }
  set value(newVal) {
    if (Object.is(newVal, this.#value)) return;
    this.#value = newVal;
    const subs = [...this.#subs];
    for (const fn of subs) notify(fn);
  }
  peek() {
    return this.#value;
  }
  _addSub(fn) {
    this.#subs.add(fn);
  }
  _removeSub(fn) {
    this.#subs.delete(fn);
  }
};
var Computed = class {
  #fn;
  #cache;
  #dirty = true;
  #effect = null;
  #subs = /* @__PURE__ */ new Set();
  constructor(fn) {
    this.#fn = fn;
    const notifyFn = () => {
      this.#dirty = true;
      const subs = [...this.#subs];
      for (const fn2 of subs) notify(fn2);
    };
    this.#effect = notifyFn;
  }
  get value() {
    if (activeEffect) {
      this.#subs.add(activeEffect);
      let subs = effectSubs.get(activeEffect);
      if (!subs) {
        subs = /* @__PURE__ */ new Set();
        effectSubs.set(activeEffect, subs);
      }
      subs.add(this);
    }
    if (this.#dirty) {
      this.#dirty = false;
      const prev = activeEffect;
      activeEffect = this.#effect;
      this.#cache = this.#fn();
      activeEffect = prev;
    }
    return this.#cache;
  }
  peek() {
    if (this.#dirty) {
      this.#dirty = false;
      this.#cache = this.#fn();
    }
    return this.#cache;
  }
  _addSub(fn) {
    this.#subs.add(fn);
  }
  _removeSub(fn) {
    this.#subs.delete(fn);
  }
};
function batch(fn) {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      flushBatch();
    }
  }
}
function ref(initial) {
  return new Signal(initial);
}
function computed(fn) {
  return new Computed(fn);
}
function effect(fn) {
  let cleanup;
  let oldSubs = /* @__PURE__ */ new Set();
  const run = () => {
    if (cleanup) cleanup();
    for (const sig of oldSubs) {
      sig._removeSub(run);
    }
    oldSubs.clear();
    effectSubs.delete(run);
    const prev = activeEffect;
    activeEffect = run;
    cleanup = fn();
    activeEffect = prev;
    const newSubs = effectSubs.get(run);
    if (newSubs) {
      oldSubs = newSubs;
    }
  };
  run();
  return () => {
    if (cleanup) cleanup();
    for (const sig of oldSubs) {
      sig._removeSub(run);
    }
    effectSubs.delete(run);
  };
}

// src/vnode.ts
function h(tag, attrs, ...children) {
  return {
    tag,
    attrs: attrs ? processAttrs(attrs) : null,
    children: flatten(children)
  };
}
function processAttrs(attrs) {
  const out = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key.startsWith("on") && typeof value === "function") {
      out[key] = value;
      continue;
    }
    if (value instanceof Signal || value instanceof Computed) {
      out[key] = value;
      continue;
    }
    out[key] = value;
  }
  return out;
}
function flatten(children) {
  const result = [];
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) {
      result.push(...flatten(child));
    } else {
      result.push(child);
    }
  }
  return result;
}
function serialize(node) {
  const parts = [];
  serializeNode(node, parts);
  return parts.join("");
}
function serializeNode(node, parts) {
  if (typeof node === "string") {
    parts.push(escapeHtml(node));
    return;
  }
  if (typeof node === "number" || typeof node === "boolean") {
    parts.push(String(node));
    return;
  }
  if (node == null) return;
  if (node instanceof Signal || node instanceof Computed) {
    const val = node.value;
    parts.push(escapeHtml(val == null ? "" : String(val)));
    return;
  }
  if ("_type" in node && node._type === "show") {
    const show = node;
    if (show.signal.peek()) {
      const result = show.factory();
      if (result) serializeNode(result, parts);
    }
    return;
  }
  if ("_type" in node && node._type === "each") {
    const eachNode = node;
    const arr = eachNode.signal.peek();
    if (Array.isArray(arr)) {
      for (let i = 0; i < arr.length; i++) {
        const item = eachNode.factory(arr[i], i);
        serializeNode(item, parts);
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      serializeNode(child, parts);
    }
    return;
  }
  const { tag, attrs, children } = node;
  parts.push("<", tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null) continue;
      if (key.startsWith("on") && typeof value === "function") {
        const eventType = key.slice(2).toLowerCase();
        parts.push(` data-on${eventType}="true"`);
        continue;
      }
      if (value instanceof Signal || value instanceof Computed) {
        const val = value.value;
        if (typeof val === "boolean") {
          if (val) parts.push(` ${key}`);
        } else {
          parts.push(` ${key}="${escapeHtml(String(val))}"`);
        }
        continue;
      }
      if (typeof value === "boolean") {
        if (value) parts.push(` ${key}`);
        continue;
      }
      parts.push(` ${key}="${escapeHtml(String(value))}"`);
    }
  }
  if (VOID_ELEMENTS.has(tag)) {
    parts.push(" />");
    return;
  }
  parts.push(">");
  for (const child of children) {
    serializeNode(child, parts);
  }
  parts.push("</", tag, ">");
}
var VOID_ELEMENTS = /* @__PURE__ */ new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// src/control-flow.ts
function when(signal, factory) {
  return { _type: "show", signal, factory };
}
function each(signal, factory) {
  return { _type: "each", signal, factory };
}

// src/shell.ts
function shell(layout) {
  return async (req, ctx, next) => {
    ctx._wuiShell = true;
    const res = await next(req, ctx);
    if (ctx._wuiBody !== void 0) {
      const head = ctx._wuiHead || {};
      const content = ctx._wuiBody;
      const bridge = ctx._wuiBridge || {
        signals: {},
        events: []
      };
      const html = layout({ head, content, bridge });
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }
    return res;
  };
}

// src/page.ts
function page(factory) {
  return async (req, ctx) => {
    const tree = factory(ctx);
    const bodyHtml = serialize(tree);
    const dataBridge = extractDataBridge(tree);
    ctx._wuiBody = bodyHtml;
    ctx._wuiBridge = dataBridge;
    ctx._wuiHead = ctx.head || ctx._wuiHead || {};
    if (ctx._wuiShell) {
      return new Response(bodyHtml, {
        headers: { "content-type": "text/plain" }
      });
    }
    const head = ctx._wuiHead || {};
    const title = head.title || "weifuwu";
    const pageHtml = `<!DOCTYPE html>
<html lang="en" data-theme="system">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml2(title)}</title>
  <link rel="stylesheet" href="/_ui/weifuwu-ui.css"/>
  <script id="__wui-data" type="application/json">${JSON.stringify(dataBridge)}</script>
</head>
<body>
  <div id="app">${bodyHtml}</div>
  <script defer src="/_ui/weifuwu-ui.js"></script>
</body>
</html>`;
    return new Response(pageHtml, {
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  };
}
function escapeHtml2(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
var signalCounter = 0;
function extractDataBridge(node) {
  const signals = {};
  const events = [];
  signalCounter = 0;
  function walk(n) {
    if (!n || typeof n !== "object") return;
    if (typeof n.peek === "function") {
      const s = n;
      const key = `s${signalCounter++}`;
      signals[key] = s.peek();
      return;
    }
    const nObj = n;
    if (nObj._type === "show") {
      const show = n;
      walk(show.signal);
      const branch = show.factory();
      if (branch) walk(branch);
      return;
    }
    if (nObj._type === "each") {
      const eachNode = n;
      walk(eachNode.signal);
      const arr = eachNode.signal.peek();
      if (Array.isArray(arr)) {
        for (let i = 0; i < arr.length; i++) {
          const item = eachNode.factory(arr[i], i);
          if (item) walk(item);
        }
      }
      return;
    }
    if ("tag" in nObj && "attrs" in nObj) {
      const node2 = n;
      if (node2.attrs) {
        for (const [key, value] of Object.entries(node2.attrs)) {
          if (key.startsWith("on") && typeof value === "function") {
            events.push({ key, type: key.slice(2).toLowerCase() });
          }
        }
      }
      if (node2.children) {
        for (const child of node2.children) {
          walk(child);
        }
      }
      return;
    }
    if (Array.isArray(n)) {
      for (const item of n) {
        walk(item);
      }
    }
  }
  walk(node);
  return { signals, events };
}

// src/assets.ts
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "@weifuwujs/core";
var __dirname = dirname(fileURLToPath(import.meta.url));
var distDir = join(__dirname, "..", "dist");
var cssContent = null;
var jsContent = null;
async function loadAssets() {
  if (!cssContent) {
    try {
      cssContent = await readFile(join(distDir, "weifuwu-ui.css"), "utf-8");
    } catch {
      cssContent = "";
    }
  }
  if (!jsContent) {
    try {
      jsContent = await readFile(join(distDir, "weifuwu-ui.js"), "utf-8");
    } catch {
      jsContent = "";
    }
  }
}
var _promise = loadAssets();
function weifuwuiAssets() {
  const r = new Router();
  r.get("/weifuwu-ui.css", async () => {
    await _promise;
    return new Response(cssContent, {
      headers: {
        "content-type": "text/css",
        "cache-control": "public, max-age=86400"
      }
    });
  });
  r.get("/weifuwu-ui.js", async () => {
    await _promise;
    return new Response(jsContent, {
      headers: {
        "content-type": "application/javascript",
        "cache-control": "public, max-age=86400"
      }
    });
  });
  return r;
}
export {
  Computed,
  Signal,
  batch,
  computed,
  each,
  effect,
  h,
  page,
  ref,
  serialize,
  shell,
  weifuwuiAssets,
  when
};
