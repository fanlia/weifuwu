// src/index.ts
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
  return async (_req) => {
    const url = new URL(_req.url);
    const path = url.pathname;
    await _promise;
    if (path.endsWith("/weifuwu-ui.css") && cssContent) {
      return new Response(cssContent, {
        headers: {
          "content-type": "text/css",
          "cache-control": "public, max-age=86400"
        }
      });
    }
    if (path.endsWith("/weifuwu-ui.js") && jsContent) {
      return new Response(jsContent, {
        headers: {
          "content-type": "application/javascript",
          "cache-control": "public, max-age=86400"
        }
      });
    }
    return new Response("Not found", { status: 404 });
  };
}
export {
  weifuwuiAssets
};
