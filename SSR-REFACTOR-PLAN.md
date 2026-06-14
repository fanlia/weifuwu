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

1. **P1a** ✅ `setCtx()` snapshot 加上 `loaderData`
2. **P1b** ✅ 脚本移到 `</body>` 前
3. **P1c** ✅ dev 模式 cache 策略（无需改动）

### Phase 2：统一客户端上下文（setCtx 作为唯一入口）

4. **P2a** ✅ `addCtxRebuilder()` 机制
5. **P2b** ✅ 消除 `window.__LOCALE_DATA__`
6. **P2c** ✅ 消除 `window.__WEIFUWU_PROPS`
7. **P2d** ✅ `useCtx()` 只读 snapshot

### Phase 3：替换 hydration bundle

8. **P3a** ✅ `compileBrowser()` — 预编译页面组件为浏览器 ESM
9. **P3b** ✅ inline `<script type="module">` 替换 `buildClientBundle()`
10. **P3c** ✅ stream.ts 接收 `hydrationScript` 参数

### Phase 4：调整 HMR 机制

11. **P4a** ✅ `compileHotComponent` 适配新格式（externalize weifuwu 源码）
12. **P4b** ✅ 删除 `markClientBundleDirty()` 和 `bundleCache`

### Phase 5：已清理

13. ✅ 删除 `buildClientBundle()` 函数
14. ✅ 删除不再使用的全局变量引用
15. ✅ 更新测试
16. ❌ 更新 README（可选）

## 风险与注意事项

| 风险                                                       | 缓解                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| 编译产物和 vendor bundle 的 store 分离（上次失败主因）     | P3a 必须 externalize weifuwu 源码路径 + 用 plugin 映射到 `weifuwu/react` |
| `compileBrowser()` 输出路径与 `__ssr/:file` 路由路径不一致 | `ssr()` 工厂内缓存 `outDir` 绝对路径，编译和服务用同一个 `outDir`        |
| `t()` 函数在客户端重建后闭包过期                           | P2a 的 `addCtxRebuilder` 在每次 `setCtx()` 时重建                        |
| 浏览器缓存旧的 `__ssr/[hash].js`                           | hash 基于文件路径不变时，不设 immutable 缓存（dev）；或用 content hash   |
| 模板加载顺序（theme → i18n → ssr）影响 ctx 字段            | 保持当前顺序不变                                                         |

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
