# SSR Refactoring Plan (v2)

## 目标

去掉运行时 esbuild（`buildClientBundle()`），改为预编译 + inline module script。

## 当前架构问题

1. **运行时 esbuild**：每个页面首次请求都调用 `buildClientBundle()`，用 esbuild 打包页面 + hydration 代码
2. **多个全局变量**：`window.__WEIFUWU_CTX`、`window.__WEIFUWU_PROPS`、`window.__LOCALE_DATA__`
3. **脚本在 `</body>` 之后**：`buildBodyScripts` 在 stream 结束后追加，生成非法 HTML
4. **`store._snapshot` 缺失 `loaderData`**：`setCtx()` 的 snapshot 没有 `loaderData`
5. **编译产物和 runtime 模块边界不清**：esbuild inline 了 `tsx-context` 导致独立的 store

## 分步计划

### Phase 1：修复现有问题（不改变架构）

这些修复独立于重构，可以先做。

1. **P1a**: `setCtx()` snapshot 加上 `loaderData`
   - 文件：`tsx-context.ts`
   - 改动：`store._snapshot = { ..., loaderData: store._ctx.loaderData, ... }`

2. **P1b**: 脚本移到 `</body>` 前
   - 文件：`stream.ts`
   - 改动：stream 结束后收集完整 HTML，在 `</body>` 前注入脚本

3. **P1c**: `__ssr/[hash].js` 去掉 immutable cache（dev 模式）
   - 文件：`ssr.ts`（`__ssr/:path` 路由）

### Phase 2：统一客户端上下文（setCtx 作为唯一入口）

4. **P2a**: 添加 `addCtxRebuilder()` 机制
   - 文件：`tsx-context.ts`
   - 改动：注册函数列表，`setCtx()` 时遍历重建不可序列化的值（如 `t()`）

5. **P2b**: 消除 `window.__LOCALE_DATA__`
   - 文件：`stream.ts`、`i18n.ts`、`client-locale.ts`
   - 改动：翻译消息放 `ctx.i18n.messages`，通过 `addCtxRebuilder` 重建 `t()`

6. **P2c**: 消除 `window.__WEIFUWU_PROPS`
   - 文件：`stream.ts`、`ssr.ts`
   - 改动：loaderData 统一走 `ctx.loaderData` → `setCtx()`

7. **P2d**: `useCtx()` 只读 snapshot，不合并 `window.__WEIFUWU_CTX`
   - 文件：`tsx-context.ts`
   - 改动：`setCtx()` 同步更新 `window.__WEIFUWU_CTX`，`useCtx()` 只从 snapshot 读

### Phase 3：替换 hydration bundle

这是核心改动。分两小步：

8. **P3a**: `compile.ts` 新增 `compileBrowser()` 
   - 功能：把页面组件编译为浏览器可执行的 ESM 文件
   - 输出：`.weifuwu/ssr/[hash].js`
   - 注意：external 列表必须包含 `weifuwu/react` 以及 weifuwu 源码路径

9. **P3b**: `ssr.ts` 用 inline `<script type="module">` 替换 `buildClientBundle()`
   - 生成：
     ```html
     <script type="module">
     import { setCtx, TsxContext } from 'weifuwu/react';
     import { createElement } from 'react';
     import { hydrateRoot, createRoot } from 'react-dom/client';
     setCtx(ctxData);
     const { default: Page } = await import('/__ssr/[hash].js');
     // dev: createRoot → render;  prod: hydrateRoot
     </script>
     ```
   - Dev 模式定义 `window.__WFW_REFRESH` 用于 HMR
   - 脚本必须插在 `</body>` 之前

10. **P3c**: `stream.ts` 改为接收 `hydrationScript` 参数而非 `bundle` 对象
    - 删除 `buildBodyScripts` 中的 bundle script 逻辑
    - 通过之前 P1b 的脚本注入机制插入

### Phase 4：调整 HMR 机制

11. **P4a**: `live.ts` 热更新通道适配新 format
    - `compileHotComponent` 导入组件后调用 `__WFW_REFRESH(C)`
    - WebSocket handler 处理 `{ type: 'component', hash, entry }`
    - 客户端 `__WFW_REFRESH` 直接用新组件 `createRoot.render()`

12. **P4b**: 删除 `markClientBundleDirty()` 和 `bundleCache`
    - 不再有运行时 esbuild bundle，不需要缓存失效

### Phase 5：清理

13. **P5a**: 删除 `buildClientBundle()` 函数
14. **P5b**: 删除不再使用的全局变量引用
15. **P5c**: 更新测试
16. **P5d**: 更新 README

## 风险与注意事项

| 风险 | 缓解 |
|------|------|
| 编译产物和 vendor bundle 的 store 分离（上次失败主因） | P3a 必须 externalize weifuwu 源码路径 + 用 plugin 映射到 `weifuwu/react` |
| `compileBrowser()` 输出路径与 `__ssr/:file` 路由路径不一致 | `ssr()` 工厂内缓存 `outDir` 绝对路径，编译和服务用同一个 `outDir` |
| `t()` 函数在客户端重建后闭包过期 | P2a 的 `addCtxRebuilder` 在每次 `setCtx()` 时重建 |
| 浏览器缓存旧的 `__ssr/[hash].js` | hash 基于文件路径不变时，不设 immutable 缓存（dev）；或用 content hash |
| 模板加载顺序（theme → i18n → ssr）影响 ctx 字段 | 保持当前顺序不变 |

## 测试策略

- 每个 Phase 完成后跑完整测试套件（704 tests）
- Phase 3 完成后手动测试 `npm run dev`：
  - 页面 SSR 正确渲染
  - 客户端水合无报错
  - 语言切换正常（不刷新页面）
  - HMR 文件修改后生效
- 用真实浏览器查看 Network 面板确认请求链路正确

## 回滚方案

每个 Phase 独立提交，任何时候可以 reset 到上一个安全 commit。
