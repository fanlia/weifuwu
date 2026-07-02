// src/ssr/tsx-context.ts
import { useSyncExternalStore, createContext } from "react";
var DEFAULT_CTX = {
  params: {},
  query: {},
  parsed: {},
  loaderData: {},
  env: {},
  user: {},
  flash: {}
};
var KEY = "__WEIFUWU_CTX_STORE";
function getStore() {
  if (typeof globalThis !== "undefined" && globalThis[KEY]) {
    return globalThis[KEY];
  }
  const s = {
    _ctx: DEFAULT_CTX,
    _snapshot: {
      params: DEFAULT_CTX.params,
      query: DEFAULT_CTX.query,
      user: DEFAULT_CTX.user,
      parsed: DEFAULT_CTX.parsed,
      theme: DEFAULT_CTX.theme,
      i18n: DEFAULT_CTX.i18n,
      loaderData: DEFAULT_CTX.loaderData,
      env: DEFAULT_CTX.env
    },
    _listeners: /* @__PURE__ */ new Set(),
    _rebuilders: [],
    _alsGetStore: null
  };
  if (typeof globalThis !== "undefined") {
    ;
    globalThis[KEY] = s;
  }
  return s;
}
var store = getStore();
function addCtxRebuilder(fn) {
  store._rebuilders.push(fn);
}
var subscribe = (cb) => {
  store._listeners.add(cb);
  return () => {
    store._listeners.delete(cb);
  };
};
var getSnapshot = () => store._snapshot;
function __registerAls(getStore2) {
  store._alsGetStore = getStore2;
}
function setCtx(value) {
  if (typeof window !== "undefined") {
    for (const r of store._rebuilders) {
      const rebuilt = r(value);
      if (rebuilt) Object.assign(value, rebuilt);
    }
  }
  store._ctx = { ...store._ctx, ...value };
  store._snapshot = {
    params: store._ctx.params,
    query: store._ctx.query,
    user: store._ctx.user,
    parsed: store._ctx.parsed,
    theme: store._ctx.theme,
    i18n: store._ctx.i18n,
    loaderData: store._ctx.loaderData,
    env: store._ctx.env
  };
  if (typeof window !== "undefined") {
    ;
    window.__WEIFUWU_CTX = { ...window.__WEIFUWU_CTX, ...value };
  }
  store._listeners.forEach((fn) => fn());
}
function useCtx() {
  if (typeof window !== "undefined") {
    return useSyncExternalStore(subscribe, getSnapshot);
  }
  const alsStore = store._alsGetStore?.();
  return alsStore ?? store._ctx;
}
function useLoaderData() {
  const ctx = useCtx();
  return ctx.loaderData;
}
var TsxContext = createContext(DEFAULT_CTX);

// src/ssr/ssr.ts
import { createElement as createElement3 } from "react";
import { createHash as createHash4 } from "node:crypto";
import { existsSync as existsSync6, readdirSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { dirname as dirname4, join as join4, resolve as resolve6, relative as relative3 } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";

// src/ssr/compile.ts
import * as esbuild2 from "esbuild";
import { existsSync as existsSync2, mkdirSync, readFileSync as readFileSync2 } from "node:fs";
import { join, resolve as resolve2, dirname as dirname2 } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { createRequire as createRequire2 } from "node:module";
import { isDev as _isDev, isBundled } from "@weifuwujs/core";

// src/ssr/server-registry.ts
import * as esbuild from "esbuild";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
var _userRequire = null;
function getUserRequire() {
  if (!_userRequire) {
    try {
      _userRequire = createRequire(resolve(process.cwd(), "package.json"));
    } catch {
      _userRequire = createRequire(import.meta.url);
    }
  }
  return _userRequire;
}
var _alias = null;
function resolveAliases() {
  if (_alias) return _alias;
  const configFiles = ["tsconfig.json", "jsconfig.json"];
  for (const file of configFiles) {
    const p = resolve(file);
    if (existsSync(p)) {
      try {
        const config = JSON.parse(readFileSync(p, "utf-8"));
        const paths = config.compilerOptions?.paths;
        if (paths) {
          const alias = {};
          for (const [key, values] of Object.entries(paths)) {
            const cleanKey = key.replace("/*", "");
            const val = values[0]?.replace("/*", "");
            if (val) alias[cleanKey] = resolve(dirname(p), val);
          }
          _alias = alias;
          return alias;
        }
      } catch {
      }
    }
  }
  _alias = {};
  return {};
}
function applyAlias(id2, _moduleDir) {
  const aliases = resolveAliases();
  for (const [prefix, target] of Object.entries(aliases)) {
    if (id2.startsWith(prefix)) {
      const rest = id2.slice(prefix.length);
      return target + rest;
    }
  }
  return null;
}
var exts = [".tsx", ".ts", ".jsx", ".js"];
function tryResolve(base) {
  if (existsSync(base)) {
    const stat2 = statSync(base);
    if (stat2.isFile()) return base;
    if (stat2.isDirectory()) {
      for (const ext of exts) {
        const p = resolve(base, `index${ext}`);
        if (existsSync(p)) return p;
      }
      return null;
    }
  }
  for (const ext of exts) {
    const p = base + ext;
    if (existsSync(p)) return p;
  }
  return null;
}
var registry = /* @__PURE__ */ new Map();
var _ctx = vm.createContext(Object.create(globalThis));
function transformToCjs(absPath, source) {
  const isTsx = absPath.endsWith(".tsx");
  const result = esbuild.transformSync(source, {
    loader: isTsx ? "tsx" : "ts",
    format: "cjs",
    jsx: isTsx ? "automatic" : void 0,
    jsxImportSource: isTsx ? "react" : void 0,
    sourcemap: false
  });
  return result.code;
}
function makeRequire(modulePath) {
  const moduleDir = dirname(modulePath);
  return (id2) => {
    if (id2.startsWith(".")) {
      const base = resolve(moduleDir, id2);
      const file = tryResolve(base);
      if (!file) {
        throw new Error(
          `[server-registry] Cannot resolve '${id2}' from '${modulePath}'. Tried: ${[base, ...exts.map((e) => base + e)].filter((p) => !p.endsWith(base)).join(", ")}`
        );
      }
      return getServerModule(file);
    }
    const aliased = applyAlias(id2, moduleDir);
    if (aliased) {
      const file = tryResolve(aliased);
      if (file) return getServerModule(file);
    }
    return getUserRequire()(id2);
  };
}
function evaluateModule(code, modulePath) {
  const mod = { exports: {} };
  const require2 = makeRequire(modulePath);
  const _dirname = dirname(modulePath);
  const _filename = modulePath;
  const wrapped = `(function(require,module,exports,__dirname,__filename){
${code}
})`;
  try {
    new vm.Script(wrapped).runInContext(_ctx)(require2, mod, mod.exports, _dirname, _filename);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error ? err : void 0;
    throw new Error(
      `[server-registry] Error evaluating '${modulePath}': ${msg}`,
      cause ? { cause } : void 0
    );
  }
  return mod.exports;
}
function getServerModule(absPath) {
  const normalized = resolve(absPath);
  if (registry.has(normalized)) return registry.get(normalized).exports;
  const source = readFileSync(normalized, "utf-8");
  const code = transformToCjs(normalized, source);
  const exports = evaluateModule(code, normalized);
  registry.set(normalized, { exports });
  return exports;
}
function clearServerModule(absPath) {
  if (absPath) {
    const normalized = resolve(absPath);
    registry.delete(normalized);
  } else {
    registry.clear();
    _alias = null;
  }
}

// src/ssr/compile.ts
var _userRequire2 = null;
var OUT_DIR = ".weifuwu/ssr";
var cache = /* @__PURE__ */ new Map();
var externals = [
  "react",
  "react-dom",
  "esbuild",
  "graphql",
  "ws",
  "zod",
  "@graphql-tools/schema",
  "ai"
];
var _alias2 = null;
function resolveAliases2() {
  if (_alias2) return _alias2;
  const configFiles = ["tsconfig.json", "jsconfig.json"];
  for (const file of configFiles) {
    const p = resolve2(file);
    if (existsSync2(p)) {
      try {
        const config = JSON.parse(readFileSync2(p, "utf-8"));
        const paths = config.compilerOptions?.paths;
        if (paths) {
          const alias = {};
          for (const [key, values] of Object.entries(paths)) {
            const cleanKey = key.replace("/*", "");
            const val = values[0]?.replace("/*", "");
            if (val) alias[cleanKey] = resolve2(dirname2(p), val);
          }
          _alias2 = alias;
          return alias;
        }
      } catch {
      }
    }
  }
  _alias2 = {};
  return {};
}
function id(s) {
  return createHash("md5").update(s).digest("hex").slice(0, 8);
}
function clearCompileCache() {
  cache.clear();
  clearServerModule();
  _alias2 = null;
}
async function compileTsx(path) {
  const absPath = resolve2(path);
  if (cache.has(absPath)) return cache.get(absPath);
  const outDir = resolve2(OUT_DIR);
  mkdirSync(outDir, { recursive: true });
  const hash = id(absPath);
  const outPath = join(outDir, hash + ".js");
  await esbuild2.build({
    entryPoints: { [hash]: absPath },
    outdir: outDir,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    jsxImportSource: "react",
    bundle: true,
    external: externals,
    alias: resolveAliases2(),
    write: true,
    allowOverwrite: true
  });
  const mod = await import(pathToFileURL(outPath).href);
  cache.set(absPath, mod);
  return mod;
}
function compileTsxDev(path) {
  const absPath = resolve2(path);
  const mod = getServerModule(absPath);
  cache.set(absPath, mod);
  return mod;
}
function compile(path) {
  return _isDev() ? Promise.resolve(compileTsxDev(path)) : compileTsx(path);
}
var vendorBundle = null;
var vendorHash = "";
async function compileVendorBundle() {
  if (vendorBundle) return vendorBundle;
  if (!_userRequire2) _userRequire2 = createRequire2(join(process.cwd(), "package.json"));
  const modules = {
    react: [],
    "react-dom": ["react"],
    "react-dom/client": ["react"],
    "react/jsx-runtime": ["react"]
  };
  for (const request of Object.keys(modules)) {
    const mod = _userRequire2(request);
    const keys = Object.keys(mod).filter((k) => !k.startsWith("_") && k !== "default");
    modules[request] = keys;
  }
  const baseDir = import.meta.dirname ?? __dirname;
  const reactAbsPath = isBundled() ? resolve2(baseDir, "react.js") : resolve2(baseDir, "ssr", "react.ts");
  const reactSrc = readFileSync2(reactAbsPath, "utf-8");
  const wfwKeys = [];
  if (reactAbsPath.endsWith(".ts")) {
    for (const line of reactSrc.split("\n")) {
      const m = line.match(/^export\s+\{[^}]+\}\s*from/);
      if (m) {
        const names = line.slice(line.indexOf("{") + 1, line.indexOf("}")).split(",").map((s) => s.trim()).filter(Boolean);
        for (const n of names) {
          if (!n.startsWith("type ") && !wfwKeys.includes(n)) wfwKeys.push(n);
        }
      }
    }
  } else {
    const exportMatch = reactSrc.match(/\bexport\s*\{([^}]+)\}\s*;/);
    if (exportMatch) {
      const names = exportMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
      for (const n of names) {
        if (!n.startsWith("type ") && !wfwKeys.includes(n)) wfwKeys.push(n);
      }
    }
  }
  const used = /* @__PURE__ */ new Set();
  const stmts = [""];
  for (const [request, keys] of Object.entries(modules)) {
    const unique = keys.filter((k) => !used.has(k) && used.add(k));
    if (unique.length > 0)
      stmts.push(`export { ${unique.join(", ")} } from ${JSON.stringify(request)};`);
  }
  const uidWfw = wfwKeys.filter((k) => !used.has(k) && used.add(k));
  if (uidWfw.length > 0)
    stmts.push(`export { ${uidWfw.join(", ")} } from ${JSON.stringify(reactAbsPath)};`);
  const result = await esbuild2.build({
    stdin: { contents: stmts.join("\n"), resolveDir: process.cwd() },
    format: "esm",
    bundle: true,
    write: false
  });
  vendorBundle = new TextDecoder().decode(result.outputFiles[0].contents);
  const hashBytes = new TextEncoder().encode(vendorBundle);
  const hashBuffer = await crypto.subtle.digest("SHA-1", hashBytes);
  vendorHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 8);
  return vendorBundle;
}

// src/ssr/stream.ts
import { TextDecoder as TextDecoder2, TextEncoder as TextEncoder2 } from "node:util";
function concatUint8(chunks) {
  const len = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
async function readStream(stream) {
  const chunks = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return new TextDecoder2().decode(concatUint8(chunks));
}
var _publicEnv = null;
function getPublicEnv() {
  if (_publicEnv) return _publicEnv;
  _publicEnv = {};
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("WEIFUWU_PUBLIC_")) {
      _publicEnv[key] = process.env[key];
    }
  }
  return _publicEnv;
}
function buildHeadPayload(opts) {
  const { ctx, base, tailwind } = opts;
  let result = "";
  result += `<script>window.__wfw={_cache:{},_k:function(u){return u.split('?')[0]},h:async function(u){var k=this._k(u);if(this._cache[k])return this._cache[k];var m=await import(u);this._cache[k]=m;return m},_update:function(u,mod){var k=this._k(u);this._cache[k]=mod}}</script>
`;
  const vUrl = `${base}/__wfw/v/bundle?h=${vendorHash}`;
  result += `<script type="importmap">{
  "imports": {
    "react": "${vUrl}",
    "react-dom": "${vUrl}",
    "react-dom/client": "${vUrl}",
    "react/jsx-runtime": "${vUrl}",
    "weifuwu/react": "${vUrl}"
  }
}</script>
`;
  if (ctx.theme?.value) {
    result += `<script>!function(){var t=(document.cookie.match(/(?:^|;\\s*)theme=([^;]+)/)||[])[1]||'system';if(t==='system'){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}()</script>
`;
  }
  if (tailwind?.css) {
    result += `<link rel="stylesheet" href="${tailwind.url}" />
`;
  }
  const loaderData = opts.loaderData || {};
  const ctxData = {
    params: ctx.params,
    query: ctx.query,
    parsed: ctx.parsed,
    theme: ctx.theme,
    i18n: ctx.i18n,
    flash: ctx.flash,
    loaderData
  };
  const rawUser = ctx.user;
  if (rawUser && typeof rawUser === "object") {
    const safeUser = {};
    for (const k of ["id", "name", "email", "role", "avatar"]) {
      if (k in rawUser) safeUser[k] = rawUser[k];
    }
    ctxData.user = safeUser;
  }
  const publicEnv = getPublicEnv();
  if (Object.keys(publicEnv).length > 0) {
    ctxData.env = publicEnv;
  }
  result += `<script>window.__WEIFUWU_CTX=${JSON.stringify(ctxData)}</script>
`;
  return result;
}
function buildBodyScripts(opts, hydrationScript) {
  const parts = [];
  if (hydrationScript) parts.push(hydrationScript);
  return parts.join("\n");
}
function streamResponse(reactStream, opts, hydrationScript) {
  const decoder = new TextDecoder2();
  const encoder = new TextEncoder2();
  const output = new ReadableStream({
    async start(controller) {
      try {
        const reader = reactStream.getReader();
        let html = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          html += decoder.decode(value, { stream: true });
        }
        html += decoder.decode();
        const headTmpl = html.match(/<template id="__wfw_head">([\s\S]*?)<\/template>/);
        if (headTmpl) {
          const extractedHead = headTmpl[1];
          html = html.replace(headTmpl[0], "");
          const headIdx2 = html.indexOf("</head>");
          if (headIdx2 !== -1) {
            html = html.slice(0, headIdx2) + "\n" + extractedHead + html.slice(headIdx2);
          }
        }
        const headPayload = buildHeadPayload(opts);
        const headIdx = html.indexOf("</head>");
        if (headIdx !== -1) {
          html = html.slice(0, headIdx) + headPayload + html.slice(headIdx);
        }
        let bodyScripts = "";
        const built = buildBodyScripts(opts, hydrationScript);
        if (built) bodyScripts += built;
        if (opts.isDev) {
          const wsUrl = `${opts.base}/__weifuwu/livereload`;
          bodyScripts += `
<script>
(function(){
var ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'${wsUrl}');
var t=0;
var _w=window;
ws.onmessage=function(e){
  try{
    var m=JSON.parse(e.data);
    if(m.type==='update'&&m.url&&m.code){
      var blob=new Blob([m.code],{type:'application/javascript'});
      var blobUrl=URL.createObjectURL(blob);
      import(blobUrl).then(function(mod){
        if(_w.__wfw) _w.__wfw._update(m.url,mod);
        var pageUrl=_w.__WFW_PAGE_URL;
        if(pageUrl&&_w.__WFW_REFRESH){
          import(pageUrl.split('?')[0]+'?t='+Date.now()).then(function(pageMod){
            if(pageMod.default) _w.__WFW_REFRESH(pageMod.default);
            if(m.css){
              var s=document.querySelector('style[data-lr]')||function(){
                var x=document.createElement('style');
                x.setAttribute('data-lr','');
                document.head.appendChild(x);
                return x
              }();
              s.textContent=m.css
            }
          });
        }else{location.reload()}
      }).catch(function(){location.reload()});
      return
    }
    if(m.type==='css'){
      var s=document.querySelector('style[data-lr]')||function(){
        var x=document.createElement('style');
        x.setAttribute('data-lr','');
        document.head.appendChild(x);
        return x
      }();
      s.textContent=m.css
      return
    }
  }catch(_){}
  if(e.data==='reload'&&Date.now()-t>1e3){t=Date.now();location.reload()}
};
ws.onclose=function(){
  if(Date.now()-t>1e3){
    t=Date.now();
    setTimeout(function(){location.reload()},500)
  }
};
})();
</script>`;
        }
        if (bodyScripts) {
          const bodyIdx = html.lastIndexOf("</body>");
          if (bodyIdx !== -1) {
            html = html.slice(0, bodyIdx) + bodyScripts + html.slice(bodyIdx);
          }
        }
        controller.enqueue(encoder.encode(html));
      } catch {
        const fallback = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>500</title></head><body><h1>500 - Internal Server Error</h1></body></html>';
        controller.enqueue(encoder.encode(fallback));
      } finally {
        controller.close();
      }
    }
  });
  return new Response(output, {
    status: opts.status ?? 200,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

// src/ssr/ssr.ts
import { Router as Router4, isDev as _isDev2 } from "@weifuwujs/core";

// src/ssr/ssr-entries.ts
var ssrEntries = /* @__PURE__ */ new Map();

// src/ssr/tailwind.ts
import { createHash as createHash2 } from "node:crypto";
import { existsSync as existsSync3, mkdirSync as mkdirSync2, readFileSync as readFileSync3, writeFileSync } from "node:fs";
import { join as join2, relative, resolve as resolve3 } from "node:path";
import { Router } from "@weifuwujs/core";
var extraSources = /* @__PURE__ */ new Set();
var cssCache = /* @__PURE__ */ new Map();
function addTailwindSource(dir) {
  extraSources.add(resolve3(dir));
}
function tailwindContext(dir) {
  const cssDir = resolve3(dir);
  const cssPath = join2(cssDir, "app", "globals.css");
  return async (req, ctx, next) => {
    if (!cssCache.has(cssPath)) {
      await compileTailwindCss(cssPath, cssDir);
    }
    const entry = cssCache.get(cssPath);
    if (entry) {
      const base = (ctx.mountPath || "").replace(/\/$/, "");
      const url = base ? `${base}/__wfw/style/${entry.hash}.css` : `/__wfw/style/${entry.hash}.css`;
      ctx.tailwind = { css: entry.css, url };
    }
    return next(req, ctx);
  };
}
function tailwindRouter(dir) {
  const cssDir = resolve3(dir);
  const cssPath = join2(cssDir, "app", "globals.css");
  const r = new Router();
  r.get("/__wfw/style/:hash.css", async (_req, _ctx2) => {
    if (!cssCache.has(cssPath)) {
      await compileTailwindCss(cssPath, cssDir);
    }
    const entry = cssCache.get(cssPath);
    if (!entry) return new Response("", { status: 404 });
    return new Response(entry.css, {
      headers: { "content-type": "text/css; charset=utf-8" }
    });
  });
  return r;
}
async function compileTailwindCss(cssPath, cssDir) {
  try {
    if (!existsSync3(cssPath)) {
      mkdirSync2(cssDir, { recursive: true });
      writeFileSync(cssPath, '@import "tailwindcss"\n', "utf-8");
    }
    const { default: tailwindPlugin } = await import("@tailwindcss/postcss");
    const { default: postcss } = await import("postcss");
    let src = readFileSync3(cssPath, "utf-8");
    src = `@source "./";
${src}`;
    for (const srcDir of extraSources) {
      const rel = relative(cssDir, srcDir) || ".";
      src = `@source "${rel.startsWith(".") ? rel : "./" + rel}";
${src}`;
    }
    const result = await postcss([tailwindPlugin()]).process(src, { from: cssPath });
    const hash = createHash2("md5").update(result.css).digest("hex").slice(0, 8);
    cssCache.set(cssPath, { css: result.css, hash });
    return result.css;
  } catch (err) {
    console.warn("Tailwind CSS processing failed:", err.message);
    return "";
  }
}

// src/ssr/live.ts
import chokidar from "chokidar";
import { existsSync as existsSync5 } from "node:fs";
import { join as join3, resolve as resolve5 } from "node:path";
import { Router as Router3 } from "@weifuwujs/core";

// src/ssr/module-server.ts
import * as esbuild3 from "esbuild";
import { existsSync as existsSync4, readFileSync as readFileSync4 } from "node:fs";
import { resolve as resolve4, dirname as dirname3, relative as relative2 } from "node:path";
import { createHash as createHash3 } from "node:crypto";
import { Router as Router2 } from "@weifuwujs/core";
var moduleCache = /* @__PURE__ */ new Map();
var hashCache = /* @__PURE__ */ new Map();
function clearModuleCache(filePath) {
  if (filePath) {
    const abs = resolve4(filePath);
    for (const key of moduleCache.keys()) {
      if (key.endsWith(abs)) moduleCache.delete(key);
    }
    hashCache.delete(abs);
  } else {
    moduleCache.clear();
    hashCache.clear();
  }
}
var _importRoots = [];
function _setImportRoots(roots) {
  _importRoots = roots;
}
function fileHash(absPath) {
  const cached = hashCache.get(absPath);
  if (cached) return cached;
  try {
    const content = readFileSync4(absPath);
    const h = createHash3("md5").update(content).digest("hex").slice(0, 8);
    hashCache.set(absPath, h);
    return h;
  } catch {
    return "00000000";
  }
}
function rewriteImports(code, absPath, mountPath) {
  const prefix = mountPath ? `${mountPath}/__wfw/m` : "/__wfw/m";
  let varCounter = 0;
  return code.replace(
    /^(import|export)\s+(.+?)\s+from\s+['"]([^'"]+)['"];?\s*$/gm,
    (_match, keyword, clause, modPath) => {
      if (!modPath.startsWith(".")) return _match;
      const isReexport = keyword === "export";
      const imports = clause.replace(/^type\s+/, "");
      const resolved = resolve4(dirname3(absPath), modPath);
      for (const root of _importRoots) {
        const rel = relative2(root, resolved);
        if (!rel.startsWith("..") && !rel.startsWith("/")) {
          const v = fileHash(resolved);
          const url = `${prefix}/${rel}?v=${v}`;
          const defaultMatch = imports.match(/^\s*(\w[\w$]*)\s*$/);
          const namedMatch = imports.match(/^\s*\{\s*([\w$,\s]+)\s*\}\s*$/);
          const mixedMatch = imports.match(/^\s*(\w[\w$]*)\s*,\s*\{\s*([\w$,\s]+)\s*\}\s*$/);
          if (defaultMatch) {
            const name = defaultMatch[1];
            if (isReexport) {
              return `const { default: ${name} } = await __wfw.h("${url}");
export { ${name} as default }`;
            }
            return `const { default: ${name} } = await __wfw.h("${url}");`;
          }
          if (namedMatch) {
            const names = namedMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
            if (isReexport) {
              const tmp = `__wfw$${varCounter++}`;
              const lines = [`const ${tmp} = await __wfw.h("${url}");`];
              for (const n of names) lines.push(`export const ${n} = ${tmp}.${n};`);
              return lines.join("\n");
            }
            const decl = names.map((n) => `${n}`).join(", ");
            return `const { ${decl} } = await __wfw.h("${url}");`;
          }
          if (mixedMatch) {
            const defaultName = mixedMatch[1];
            const namedNames = mixedMatch[2].split(",").map((s) => s.trim()).filter(Boolean);
            const varName = `__wfw$${varCounter++}`;
            const lines = [
              `const ${varName} = await __wfw.h("${url}");`,
              `const ${defaultName} = ${varName}.default;`
            ];
            for (const n of namedNames) lines.push(`const { ${n} } = ${varName};`);
            return lines.join("\n");
          }
          return _match;
        }
      }
      return _match;
    }
  );
}
async function transformModule(absPath, root, mountPath) {
  const mp = mountPath || "";
  const cacheKey = mp + absPath;
  const cached = moduleCache.get(cacheKey);
  if (cached) return { url: `${mp}/__wfw/m/${relative2(root, absPath)}`, code: cached };
  const source = readFileSync4(absPath, "utf-8");
  const isTsx = absPath.endsWith(".tsx");
  const result = await esbuild3.transform(source, {
    loader: isTsx ? "tsx" : "ts",
    jsx: isTsx ? "automatic" : void 0,
    jsxImportSource: isTsx ? "react" : void 0,
    sourcemap: false
  });
  let code = result.code;
  code = rewriteImports(code, absPath, mp);
  moduleCache.set(cacheKey, code);
  const url = `${mp}/__wfw/m/${relative2(root, absPath)}`;
  return { url, code };
}
function moduleServer(opts) {
  const roots = Array.isArray(opts.root) ? opts.root : [opts.root];
  _setImportRoots(roots);
  const router = new Router2();
  router.get("/__wfw/m/*", (async (req, ctx) => {
    const filePath = (ctx.params["*"] || "").split("?")[0];
    const ext = filePath.split(".").pop();
    if (ext !== "tsx" && ext !== "ts") {
      return new Response("Not Found", { status: 404 });
    }
    const mountPath = ctx.mountPath || "";
    for (const root of roots) {
      const absPath = resolve4(root, filePath);
      if (existsSync4(absPath)) {
        try {
          const { code } = await transformModule(absPath, root, mountPath);
          return new Response(code, {
            headers: { "content-type": "application/javascript; charset=utf-8" }
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return new Response(`/* Error: ${msg} */`, { status: 500 });
        }
      }
    }
    return new Response("Not Found", { status: 404 });
  }));
  return router;
}

// src/ssr/live.ts
var clients = /* @__PURE__ */ new Set();
function broadcastReload() {
  for (const ws of clients) {
    try {
      ws.send("reload");
    } catch {
      clients.delete(ws);
    }
  }
}
function broadcastCss(css) {
  const msg = JSON.stringify({ type: "css", css });
  for (const ws of clients) {
    try {
      ws.send(msg);
    } catch {
      clients.delete(ws);
    }
  }
}
function liveWs() {
  return {
    open(ws, _ctx2) {
      clients.add(ws);
      ws.on("close", () => clients.delete(ws));
      ws.on("error", () => clients.delete(ws));
    }
  };
}
function liveRouter(_dir) {
  const r = new Router3();
  compileVendorBundle().catch(() => {
  });
  return r;
}
function liveWatcher(dir) {
  const resolved = resolve5(dir);
  const watcher = chokidar.watch(dir, {
    ignored: /(^|[/\\])\.|node_modules|[/\\]\.weifuwu[/\\]/,
    ignoreInitial: true
  });
  watcher.on("change", async (filePath) => {
    if (/\.tsx?$/i.test(filePath)) {
      if (filePath.endsWith("layout.tsx")) {
        return broadcastReload();
      }
      clearCompileCache();
      clearModuleCache();
      try {
        await compileTsxDev(filePath);
      } catch (e) {
        console.error("server-side recompile failed:", e);
        return broadcastReload();
      }
      let css;
      const cssPath = join3(resolved, "app", "globals.css");
      if (existsSync5(cssPath)) {
        css = await compileTailwindCss(cssPath, resolved);
      }
      try {
        const absPath = resolve5(filePath);
        const { url, code } = await transformModule(absPath, resolved);
        const msg = { type: "update", url, code };
        if (css) msg.css = css;
        const str = JSON.stringify(msg);
        for (const ws of clients) {
          try {
            ws.send(str);
          } catch {
            clients.delete(ws);
          }
        }
      } catch (e) {
        console.error("module transform failed for HMR:", e);
        broadcastReload();
      }
    } else if (/\.css$/i.test(filePath)) {
      const cssPath = join3(resolved, "app", "globals.css");
      if (existsSync5(cssPath)) {
        const css = await compileTailwindCss(cssPath, resolved);
        if (css) broadcastCss(css);
      }
    }
  });
  return {
    close: () => {
      watcher.close();
      clients.clear();
    }
  };
}

// src/ssr/layout.ts
function layout(path) {
  return async (req, ctx, next) => {
    const mod = await compile(path);
    const Component = mod.default;
    if (!Component) throw new Error(`Layout ${path} has no default export`);
    ctx.layoutStack = [...ctx.layoutStack || [], { path, component: Component }];
    return next(req, ctx);
  };
}

// src/ssr/error-boundary.ts
import { createElement as createElement2 } from "react";
import { isDev } from "@weifuwujs/core";

// src/ssr/html-shell.ts
import { createElement } from "react";
function buildHtmlShell(title, bodyElement, layoutComponents) {
  if (layoutComponents.length === 0) {
    return createElement(
      "html",
      { lang: "en" },
      createElement(
        "head",
        null,
        createElement("meta", { charSet: "utf-8" }),
        createElement("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
        createElement("title", null, title)
      ),
      createElement("body", null, bodyElement)
    );
  }
  let element = bodyElement;
  for (const L of layoutComponents.toReversed()) {
    element = createElement(L, { children: element });
  }
  return element;
}

// src/ssr/error-boundary.ts
function errorBoundary(errorPath) {
  return async (req, ctx, next) => {
    try {
      return await next(req, ctx);
    } catch (err) {
      const mod = await compile(errorPath);
      const ErrorComponent = mod.default;
      if (!ErrorComponent) throw err;
      const ctx2 = ctx;
      const layouts = (ctx2.layoutStack || []).map((l) => l.component);
      const base = (ctx2.mountPath || "").replace(/\/$/, "");
      let element = createElement2(ErrorComponent, {
        error: err instanceof Error ? err : new Error(String(err)),
        reset: () => {
        }
      });
      element = buildHtmlShell("500", element, layouts);
      const { renderToReadableStream } = await import("react-dom/server");
      const stream = await renderToReadableStream(element);
      return streamResponse(stream, {
        ctx: ctx2,
        base,
        isDev: isDev(),
        tailwind: ctx2.tailwind,
        status: 500
      });
    }
  };
}

// src/ssr/ssr.ts
var isDev2 = _isDev2();
var als = new AsyncLocalStorage();
__registerAls(() => als.getStore());
function hashId(s) {
  return createHash4("md5").update(s).digest("hex").slice(0, 8);
}
function serializeLoaderData(ctx) {
  const ld = ctx.loaderData;
  return ld && typeof ld === "object" ? ld : {};
}
function errorPage(title, detail, stack) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;max-width:900px;margin:40px auto;padding:0 24px;color:#1a1a2e}
  h1{color:#e53e3e;font-size:24px;margin-bottom:8px}
  .info{color:#718096;font-size:14px;margin-bottom:24px}
  pre{background:#1a1a2e;color:#a0ffa0;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
  .trace{color:#e0e0e0}
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<p class="info">${escapeHtml(detail)}</p>
${stack ? `<pre><span class="trace">${escapeHtml(stack)}</span></pre>` : ""}
</body></html>`;
  return new Response(html, {
    status: 500,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
async function resolveRoute(ssrDir, segments, routeCache) {
  const cacheKey = segments.join("/") || "/";
  if (!isDev2) {
    const cached = routeCache.get(cacheKey);
    if (cached !== void 0) return cached;
  }
  const appDir = join4(ssrDir, "app");
  let dir = appDir;
  let catchAll = null;
  let segIdx = 0;
  for (; segIdx < segments.length; segIdx++) {
    const seg = segments[segIdx];
    const literal = join4(dir, seg);
    try {
      const s = await stat(literal);
      if (s.isDirectory()) {
        dir = literal;
        continue;
      }
    } catch {
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      routeCache.set(cacheKey, null);
      return null;
    }
    const paramDir = entries.find(
      (e) => e.isDirectory() && e.name.startsWith("[") && e.name.endsWith("]") && !e.name.startsWith("[...")
    );
    if (paramDir) {
      dir = join4(dir, paramDir.name);
      continue;
    }
    const catchAllDir = entries.find(
      (e) => e.isDirectory() && e.name.startsWith("[...") && e.name.endsWith("]")
    );
    if (catchAllDir) {
      catchAll = segments.slice(segIdx).join("/");
      dir = join4(dir, catchAllDir.name);
      break;
    }
    routeCache.set(cacheKey, null);
    return null;
  }
  const pageFile = join4(dir, "page.tsx");
  if (!existsSync6(pageFile)) {
    routeCache.set(cacheKey, null);
    return null;
  }
  const consumed = catchAll !== null ? segIdx : segments.length;
  const routeParams = [];
  for (let i = 0; i < consumed; i++) routeParams.push(segments[i]);
  const layoutFiles = [];
  let d = dir;
  while (d.startsWith(appDir)) {
    const lf = join4(d, "layout.tsx");
    if (existsSync6(lf)) layoutFiles.unshift(lf);
    if (d === appDir) break;
    d = dirname4(d);
  }
  const errorFiles = [];
  d = dir;
  while (d.startsWith(appDir)) {
    const ef = join4(d, "error.tsx");
    if (existsSync6(ef)) errorFiles.unshift(ef);
    if (d === appDir) break;
    d = dirname4(d);
  }
  let notFoundFile = null;
  d = dir;
  while (d.startsWith(appDir)) {
    const nf = join4(d, "not-found.tsx");
    if (existsSync6(nf)) {
      notFoundFile = nf;
      break;
    }
    if (d === appDir) break;
    d = dirname4(d);
  }
  const result = {
    routePath: "/" + routeParams.join("/"),
    pageFile,
    layoutFiles,
    errorFiles,
    notFoundFile
  };
  routeCache.set(cacheKey, result);
  return result;
}
function buildHydrationScript(pageUrl, ctxJson) {
  return `
<script type="module">
import { setCtx, TsxContext } from '@weifuwujs/react';
import { createElement } from 'react';
import { hydrateRoot, createRoot } from 'react-dom/client';

const _ctx = ${ctxJson};
setCtx(_ctx);

const _root = document.getElementById('__weifuwu_root');

async function init() {
  const { default: Page } = await import('${pageUrl}');
  ${isDev2 ? `
  window.__WFW_PAGE_URL = '${pageUrl}';

  const _pageImpl = { current: Page };
  const _pageProxy = new Proxy(function __wfw_page(){}, {
    apply(_target, _thisArg, args) {
      return Reflect.apply(_pageImpl.current, _thisArg, args);
    },
  });

  const reactRoot = createRoot(_root);
  let _tick = 0;
  function renderPage() {
    reactRoot.render(createElement(TsxContext.Provider, { value: _ctx },
      createElement(_pageProxy, { __t: _tick })));
  }
  renderPage();

  window.__WFW_RERENDER = () => {
    _tick++;
    reactRoot.render(createElement(TsxContext.Provider, { value: _ctx },
      createElement(_pageProxy, { __t: _tick })));
  };

  window.__WFW_REFRESH = async (NewComponent) => {
    const store = globalThis.__WEIFUWU_CTX_STORE?._ctx || _ctx;
    _pageImpl.current = NewComponent;
    __WFW_RERENDER();
  };
  ` : `
  const app = createElement(TsxContext.Provider, { value: _ctx },
    createElement(Page));
  hydrateRoot(_root, app);
  `}
}

init();
</script>`;
}
function renderPage(pageFile, projectDir) {
  const absPath = resolve6(pageFile);
  const entryId = hashId(absPath);
  ssrEntries.set(entryId, { path: absPath });
  return async (req, ctx) => {
    let pageMod;
    try {
      pageMod = await compile(absPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ssr] compile failed: ${pageFile} \u2014 ${msg}`);
      return errorPage("Compilation failed", `${pageFile}: ${msg}`);
    }
    const Component = pageMod.default;
    if (!Component) return errorPage("Missing default export", pageFile);
    const layouts = ctx.layoutStack || [];
    const layoutComponents = layouts.map((l) => l.component);
    const base = (ctx.mountPath || "").replace(/\/$/, "");
    const loaderData = serializeLoaderData(ctx);
    const ctxValue = {
      params: ctx.params,
      query: ctx.query,
      user: ctx.user ?? {},
      parsed: ctx.parsed ?? {},
      theme: ctx.theme,
      i18n: ctx.i18n,
      flash: ctx.flash,
      loaderData,
      env: ctx.env ?? {}
    };
    const pageRelative = relative3(projectDir, absPath);
    const pageUrl = `${base}/__wfw/m/${pageRelative}`;
    return als.run(ctxValue, async () => {
      setCtx(ctxValue);
      let element = createElement3(
        "div",
        { id: "__weifuwu_root" },
        createElement3(TsxContext.Provider, { value: ctxValue }, createElement3(Component, null))
      );
      element = buildHtmlShell("weifuwu", element, layoutComponents);
      const { renderToReadableStream } = await import("react-dom/server");
      const stream = await renderToReadableStream(element);
      return streamResponse(
        stream,
        {
          ctx,
          base,
          isDev: isDev2,
          loaderData,
          tailwind: ctx.tailwind
        },
        buildHydrationScript(pageUrl, JSON.stringify(ctxValue))
      );
    });
  };
}
function runChain(mws, handler, req, ctx) {
  let idx = 0;
  const dispatch = (r, c) => {
    if (idx < mws.length) return mws[idx++](r, c, dispatch);
    return handler(r, c);
  };
  return Promise.resolve(dispatch(req, ctx));
}
function discoverRoutes(dir) {
  const appDir = join4(dir, "app");
  if (!existsSync6(appDir)) return [];
  const result = [];
  function walk(currentDir, routePath) {
    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        let segment = entry.name;
        if (entry.name.startsWith("[...") && entry.name.endsWith("]")) {
          segment = "*";
        } else if (entry.name.startsWith("[") && entry.name.endsWith("]")) {
          segment = ":" + entry.name.slice(1, -1);
        }
        walk(join4(currentDir, entry.name), routePath + "/" + segment);
      } else if (entry.name === "page.tsx") {
        result.push({
          path: routePath || "/",
          file: relative3(appDir, join4(currentDir, entry.name))
        });
      }
    }
  }
  walk(appDir, "");
  return result;
}
function ssr(opts) {
  const r = new Router4();
  const dir = resolve6(opts.dir);
  const routeCache = /* @__PURE__ */ new Map();
  const wfwRoot = resolve6(import.meta.dirname ?? __dirname);
  r.mount("/", moduleServer({ root: [dir, wfwRoot] }));
  compileVendorBundle().catch(() => {
  });
  r.get("/__wfw/v/bundle", async () => {
    const code = await compileVendorBundle();
    return new Response(code, {
      headers: { "content-type": "application/javascript; charset=utf-8" }
    });
  });
  if (existsSync6(join4(dir, "app", "globals.css"))) {
    r.mount("/", tailwindRouter(dir));
  }
  let devWatcher;
  if (isDev2) {
    r.mount("/", liveRouter(dir));
    r.ws("/__weifuwu/livereload", liveWs());
    devWatcher = liveWatcher(dir);
  }
  r.all("/*", async (req, ctx) => {
    const prefix = ctx.mountPath || "";
    const pathname = new URL(req.url).pathname;
    const relativePath = pathname.replace(prefix, "") || "/";
    const segments = relativePath.split("/").filter(Boolean);
    const resolved = await resolveRoute(dir, segments, routeCache);
    if (!resolved) {
      if (isDev2) {
        const pages = discoverRoutes(dir).map((p) => p.path).sort();
        return Response.json(
          {
            error: "Not Found",
            path: "/" + segments.join("/"),
            method: req.method,
            hint: "Available SSR pages",
            pages
          },
          { status: 404 }
        );
      }
      return new Response("Not Found", { status: 404 });
    }
    const mws = [
      ...resolved.errorFiles.map((f) => errorBoundary(f)),
      ...resolved.layoutFiles.map((f) => layout(f)),
      tailwindContext(dir)
    ];
    const handler = (req2, ctx2) => renderPage(resolved.pageFile, dir)(req2, ctx2);
    return runChain(mws, handler, req, ctx);
  });
  const mod = r;
  mod.pages = () => discoverRoutes(dir);
  if (devWatcher) mod.close = devWatcher.close.bind(devWatcher);
  return mod;
}

// src/ssr/head.tsx
import { createElement as createElement4 } from "react";
function Head({ children }) {
  return createElement4("template", { id: "__wfw_head" }, children);
}

// src/ssr/use-websocket.ts
import { useEffect, useRef, useCallback, useState } from "react";
var RECONNECT_DELAY = 3e3;
var MAX_RETRIES = 10;
function resolveUrl(url) {
  return typeof url === "function" ? url() : url;
}
function useWebsocket(url, options) {
  const { onMessage, reconnect: reconnectOpt = true, protocols, enabled = true } = options ?? {};
  const [lastMessage, setLastMessage] = useState(null);
  const [readyState, setReadyState] = useState(WebSocket.CLOSED);
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const timerRef = useRef(void 0);
  const mountedRef = useRef(true);
  const shouldReconnectRef = useRef(true);
  const urlRef = useRef(url);
  const optsRef = useRef({ onMessage, reconnectOpt, protocols });
  urlRef.current = url;
  optsRef.current = { onMessage, reconnectOpt, protocols };
  const cleanup = useCallback(() => {
    clearTimeout(timerRef.current);
    wsRef.current?.close();
    wsRef.current = null;
  }, []);
  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;
    const resolved = resolveUrl(urlRef.current);
    if (!resolved) return;
    wsRef.current?.close();
    const ws = new WebSocket(resolved, optsRef.current.protocols);
    wsRef.current = ws;
    setReadyState(WebSocket.CONNECTING);
    ws.addEventListener("open", () => {
      if (!mountedRef.current) return;
      retryRef.current = 0;
      setReadyState(WebSocket.OPEN);
    });
    ws.addEventListener("message", (e) => {
      if (!mountedRef.current) return;
      const data = typeof e.data === "string" ? e.data : String(e.data);
      setLastMessage(data);
      optsRef.current.onMessage?.(data);
    });
    ws.addEventListener("close", () => {
      if (!mountedRef.current) return;
      setReadyState(WebSocket.CLOSED);
      const ro = optsRef.current.reconnectOpt;
      if (ro && shouldReconnectRef.current && mountedRef.current) {
        const maxRetries = typeof ro === "object" ? ro.maxRetries ?? MAX_RETRIES : MAX_RETRIES;
        const delay = typeof ro === "object" ? ro.delay ?? RECONNECT_DELAY : RECONNECT_DELAY;
        if (retryRef.current < maxRetries) {
          retryRef.current++;
          timerRef.current = setTimeout(() => connect(), delay);
        }
      }
    });
  }, [enabled]);
  useEffect(() => {
    mountedRef.current = true;
    shouldReconnectRef.current = true;
    if (enabled) connect();
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [enabled, connect, cleanup]);
  const send = useCallback((data) => {
    wsRef.current?.send(data);
  }, []);
  const close = useCallback(() => {
    shouldReconnectRef.current = false;
    cleanup();
    setReadyState(WebSocket.CLOSED);
  }, [cleanup]);
  const reconnectFn = useCallback(() => {
    retryRef.current = 0;
    shouldReconnectRef.current = true;
    cleanup();
    connect();
  }, [cleanup, connect]);
  return { send, close, readyState, lastMessage, reconnect: reconnectFn };
}

// src/ssr/use-action.ts
import { useState as useState2, useCallback as useCallback2, useRef as useRef2 } from "react";
function getCsrfToken() {
  if (typeof document === "undefined") return void 0;
  const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : void 0;
}
function useAction(url, options) {
  const { method = "POST", headers, onSuccess, onError } = options ?? {};
  const [data, setData] = useState2(null);
  const [error, setError] = useState2(null);
  const [pending, setPending] = useState2(false);
  const mountedRef = useRef2(true);
  const submit = useCallback2(
    async (body) => {
      setPending(true);
      setError(null);
      try {
        const csrfToken = getCsrfToken();
        const hdrs = { ...headers };
        if (csrfToken) hdrs["x-csrf-token"] = csrfToken;
        if (body && typeof body === "object" && !(body instanceof FormData)) {
          hdrs["content-type"] = "application/json";
        }
        const res = await fetch(url, {
          method,
          headers: hdrs,
          body: body instanceof FormData ? body : body !== void 0 ? JSON.stringify(body) : void 0
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        const result = res.status === 204 ? void 0 : await res.json();
        if (mountedRef.current) {
          setData(result);
          onSuccess?.(result);
        }
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        if (mountedRef.current) {
          setError(e);
          onError?.(e);
        }
        return void 0;
      } finally {
        if (mountedRef.current) setPending(false);
      }
    },
    [url, method, headers, onSuccess, onError]
  );
  const reset = useCallback2(() => {
    setData(null);
    setError(null);
  }, []);
  return { submit, data, error, pending, reset };
}

// src/ssr/client-router.ts
import { createElement as createElement5, useCallback as useCallback3, useState as useState3, useEffect as useEffect2 } from "react";

// src/ssr/client-pref.ts
var interceptors = [];
function addInterceptor(fn) {
  interceptors.push(fn);
}
async function runInterceptors(url) {
  for (const fn of interceptors) {
    if (await fn(url)) return true;
  }
  return false;
}

// src/ssr/client-router.ts
var _navigating = false;
var _listeners = [];
function onNavigate(fn) {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}
function setNavigating(v) {
  _navigating = v;
  for (const fn of _listeners) fn(v);
}
async function navigate(href) {
  if (typeof document === "undefined") return;
  const url = new URL(href, location.origin);
  if (url.origin !== location.origin) {
    location.href = href;
    return;
  }
  if (await runInterceptors(url)) return;
  const scrollPos = [window.scrollX, window.scrollY];
  setNavigating(true);
  try {
    const html = await fetch(url.pathname + url.search, {
      headers: { accept: "text/html" }
    }).then((r) => r.text());
    const doc = new DOMParser().parseFromString(html, "text/html");
    const rootEl = doc.getElementById("__weifuwu_root");
    if (!rootEl) {
      location.href = href;
      return;
    }
    const newHtml = rootEl.innerHTML;
    const bundleMatch = html.match(/src="(\/__ssr\/[^"]+\.js)"/);
    const bundleUrl = bundleMatch ? bundleMatch[1] : null;
    const ctxMatch = html.match(/window\.__WEIFUWU_CTX=(.+?)<\/script>/);
    if (ctxMatch) {
      try {
        const ctx = JSON.parse(ctxMatch[1]);
        window.__WEIFUWU_CTX = ctx;
        setCtx(ctx);
      } catch {
      }
    }
    const currentRoot = document.getElementById("__weifuwu_root");
    if (!currentRoot) {
      location.href = href;
      return;
    }
    history.pushState(null, "", url.pathname + url.search);
    currentRoot.innerHTML = newHtml;
    if (bundleUrl) {
      try {
        await import(
          /* @vite-ignore */
          `${bundleUrl}`
        );
      } catch (e) {
        console.error("[weifuwu/router] hydration failed:", e);
        location.href = href;
      }
    }
    window.scrollTo(scrollPos[0], scrollPos[1]);
  } finally {
    setNavigating(false);
  }
}
function useNavigate() {
  return useCallback3((href) => navigate(href), []);
}
function useNavigating() {
  const [v, setV] = useState3(false);
  useEffect2(() => onNavigate(setV), []);
  return v;
}
var prefetchCache = /* @__PURE__ */ new Map();
var PREFETCH_TTL = 6e4;
function Link({ href, children, onClick, prefetch, ...props }) {
  const doNavigate = useNavigate();
  useEffect2(() => {
    if (!prefetch) return;
    let el = document.querySelector(`a[href="${CSS.escape(href)}"]`);
    if (!el) {
      for (const a of document.querySelectorAll("a")) {
        if (a.getAttribute("href") === href) {
          el = a;
          break;
        }
      }
    }
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) prefetchPage(href);
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [href, prefetch]);
  const handleMouseEnter = useCallback3(() => {
    if (prefetch) prefetchPage(href);
  }, [href, prefetch]);
  const handleClick = useCallback3(
    (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      doNavigate(href);
      onClick?.(e);
    },
    [href, onClick, doNavigate]
  );
  return createElement5(
    "a",
    {
      href,
      onClick: handleClick,
      onMouseEnter: handleMouseEnter,
      ...props
    },
    children
  );
}
async function prefetchPage(href) {
  const cached = prefetchCache.get(href);
  if (cached && Date.now() - cached.fetched < PREFETCH_TTL) return;
  try {
    const html = await fetch(href, { headers: { accept: "text/html" } }).then((r) => r.text());
    prefetchCache.set(href, { html, fetched: Date.now() });
  } catch {
  }
}

// src/ssr/client-state.ts
import { useSyncExternalStore as useSyncExternalStore2, useCallback as useCallback4, useEffect as useEffect3, useRef as useRef3, useState as useState4 } from "react";
function createStore(initial) {
  let state = { ...initial };
  const listeners = /* @__PURE__ */ new Set();
  const getState = () => state;
  const setState = (partial) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...next };
    listeners.forEach((fn) => fn());
  };
  const subscribe2 = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const useStore = ((selector) => useSyncExternalStore2(subscribe2, () => selector ? selector(state) : state));
  useStore.getState = getState;
  useStore.setState = setState;
  useStore.subscribe = subscribe2;
  return useStore;
}
var dataCache = /* @__PURE__ */ new Map();
var inflight = /* @__PURE__ */ new Map();
var CACHE_TTL = 6e4;
function useFetch(url, options) {
  const ttl = options?.ttl ?? CACHE_TTL;
  const [state, setState] = useState4({
    data: options?.fallback,
    loading: !options?.fallback && !!url
  });
  const urlRef = useRef3(url);
  urlRef.current = url;
  useEffect3(() => {
    if (!url) {
      setState({ data: void 0, loading: false });
      return;
    }
    if (typeof window === "undefined") return;
    const u = url;
    let cancelled = false;
    const cached = dataCache.get(u);
    if (cached && Date.now() - cached.timestamp < ttl) {
      if (!cancelled)
        setState({
          data: cached.data,
          error: cached.error,
          loading: false
        });
      return;
    }
    async function doFetch() {
      if (!inflight.has(u)) {
        inflight.set(
          u,
          fetch(u).then((r) => {
            if (!r.ok) throw new Error(r.statusText || `HTTP ${r.status}`);
            return r.json();
          })
        );
      }
      const promise = inflight.get(u);
      try {
        const data = await promise;
        dataCache.set(u, { data, error: null, timestamp: Date.now() });
        if (!cancelled) setState({ data, loading: false });
      } catch (err) {
        dataCache.set(u, { data: null, error: err, timestamp: Date.now() });
        if (!cancelled) setState({ error: err, loading: false });
      }
    }
    doFetch();
    return () => {
      cancelled = true;
    };
  }, [url, ttl]);
  const mutate = useCallback4(async (data) => {
    const u = urlRef.current;
    if (!u) return;
    const uStr = u;
    if (data !== void 0) {
      dataCache.set(uStr, { data, error: null, timestamp: Date.now() });
      setState({ data, loading: false, error: void 0 });
      return;
    }
    inflight.delete(uStr);
    try {
      const res = await fetch(uStr);
      if (!res.ok) throw new Error(res.statusText || `HTTP ${res.status}`);
      const newData = await res.json();
      dataCache.set(uStr, { data: newData, error: null, timestamp: Date.now() });
      setState({ data: newData, loading: false, error: void 0 });
    } catch (err) {
      setState({ error: err, loading: false });
    }
  }, []);
  return { data: state.data, error: state.error, loading: state.loading, mutate };
}
function useQueryState(key, defaultValue = "") {
  function getSnapshot2() {
    if (typeof window === "undefined") return defaultValue;
    const params = new URLSearchParams(window.location.search);
    return params.get(key) ?? defaultValue;
  }
  const value = useSyncExternalStore2(
    (cb) => {
      if (typeof window === "undefined") return () => {
      };
      window.addEventListener("popstate", cb);
      return () => window.removeEventListener("popstate", cb);
    },
    getSnapshot2,
    () => defaultValue
  );
  const setValue = useCallback4(
    (val) => {
      if (typeof window === "undefined") return;
      const resolved = typeof val === "function" ? val(getSnapshot2()) : val;
      const url = new URL(window.location.href);
      if (resolved === defaultValue || resolved === "") {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, resolved);
      }
      window.history.replaceState(null, "", url.toString());
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    [key, defaultValue]
  );
  return [value, setValue];
}

// src/ssr/client-locale.ts
function buildT(messages) {
  if (!messages || Object.keys(messages).length === 0) {
    return (key, _p, fb) => fb ?? key;
  }
  return (key, params, fallback) => {
    const msg = key.split(".").reduce((o, k) => o?.[k], messages);
    if (msg === void 0 || msg === null) return fallback ?? key;
    if (!params) return String(msg);
    let result = String(msg);
    for (const [k, v] of Object.entries(params)) result = result.replace(`{${k}}`, v);
    return result;
  };
}
addCtxRebuilder((value) => {
  if (value.i18n?.messages) {
    return { i18n: { ...value.i18n, t: buildT(value.i18n.messages) } };
  }
  return null;
});
addInterceptor(async (url) => {
  const m = url.pathname.match(/^\/__lang\/([\w-]+)$/);
  if (!m) return false;
  try {
    const res = await fetch(url.pathname, {
      headers: { accept: "application/json" }
    });
    const data = await res.json();
    setCtx({ i18n: { locale: data.locale, messages: data.messages || {} } });
  } catch {
    location.href = url.href;
  }
  return true;
});
function useLocale() {
  const ctx = useCtx();
  return {
    locale: ctx.i18n?.locale,
    setLocale: (locale) => navigate("/__lang/" + locale),
    t: ctx.i18n?.t ?? ((key, _p, fb) => fb ?? key)
  };
}

// src/ssr/client-theme.ts
import { useEffect as useEffect4 } from "react";
function resolveTheme(theme) {
  if (theme === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}
var _mqListener = null;
function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  if (theme === "system") {
    if (!_mqListener) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", (e) => {
        if (window.__WEIFUWU_CTX?.theme?.value === "system") {
          document.documentElement.dataset.theme = e.matches ? "dark" : "light";
        }
      });
      _mqListener = mq;
    }
  }
}
addInterceptor(async (url) => {
  const m = url.pathname.match(/^\/__theme\/([\w-]+)$/);
  if (!m) return false;
  try {
    const res = await fetch(url.pathname, {
      headers: { accept: "application/json" }
    });
    const data = await res.json();
    window.__WEIFUWU_CTX = {
      ...window.__WEIFUWU_CTX,
      theme: { value: data.theme }
    };
    setCtx({ theme: { value: data.theme } });
    applyTheme(data.theme);
  } catch {
    location.href = url.href;
  }
  return true;
});
function useTheme() {
  const ctx = useCtx();
  const theme = ctx.theme?.value ?? "system";
  useEffect4(() => {
    applyTheme(theme);
  }, [theme]);
  return {
    theme,
    resolvedTheme: resolveTheme(theme),
    setTheme: (t) => navigate("/__theme/" + t)
  };
}

// src/ssr/use-flash-message.ts
import { useState as useState5 } from "react";
function useFlashMessage() {
  const [flash] = useState5(() => {
    if (typeof window === "undefined") return null;
    const raw = window.__WEIFUWU_CTX?.flash?.value;
    if (raw === void 0 || raw === null) return null;
    return raw;
  });
  return flash;
}

// src/ssr/use-agent-stream.ts
import { useState as useState6, useCallback as useCallback5, useRef as useRef4 } from "react";
function useAgentStream(opts) {
  const { wsPath, onStreamEnd, onError } = opts;
  const [streams, setStreams] = useState6({});
  const activeRef = useRef4(/* @__PURE__ */ new Set());
  const streamsRef = useRef4({});
  const getAgentText = useCallback5((agentId) => streams[agentId] || "", [streams]);
  const isAgentStreaming = useCallback5((agentId) => activeRef.current.has(agentId), []);
  const streaming = activeRef.current.size > 0;
  useWebsocket(wsPath, {
    onMessage: (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type !== "agent_stream" && msg.type !== "agent_stream_end" && msg.type !== "agent_error")
          return;
        const agentId = msg.data?.agent_id;
        if (agentId === void 0 || agentId === null) return;
        switch (msg.type) {
          case "agent_stream": {
            activeRef.current.add(agentId);
            const token = msg.data?.token || "";
            streamsRef.current[agentId] = (streamsRef.current[agentId] || "") + token;
            setStreams({ ...streamsRef.current });
            break;
          }
          case "agent_stream_end": {
            activeRef.current.delete(agentId);
            const fullText = streamsRef.current[agentId] || "";
            onStreamEnd?.(agentId, fullText);
            break;
          }
          case "agent_error": {
            activeRef.current.delete(agentId);
            delete streamsRef.current[agentId];
            onError?.(agentId, msg.data?.error || "Unknown error");
            break;
          }
        }
      } catch {
      }
    },
    reconnect: { maxRetries: 10, delay: 3e3 }
  });
  return {
    stream: { streams, streaming, activeAgents: activeRef.current },
    getAgentText,
    isAgentStreaming
  };
}
export {
  Head,
  Link,
  TsxContext,
  addCtxRebuilder,
  addInterceptor,
  addTailwindSource,
  applyTheme,
  clearCompileCache,
  clearServerModule,
  compile,
  compileTsx,
  compileTsxDev,
  compileVendorBundle,
  createStore,
  errorBoundary,
  getServerModule,
  layout,
  liveRouter,
  liveWatcher,
  liveWs,
  moduleServer,
  navigate,
  readStream,
  setCtx,
  ssr,
  streamResponse,
  tailwindContext,
  tailwindRouter,
  transformModule,
  useAction,
  useAgentStream,
  useCtx,
  useFetch,
  useFlashMessage,
  useLoaderData,
  useLocale,
  useNavigate,
  useNavigating,
  useQueryState,
  useTheme,
  useWebsocket
};
