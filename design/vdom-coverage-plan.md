# vdom 引擎测试计划：覆盖度 100%

> 目标：`src/ui-dom/vdom/*` + `src/ui-dom/vnode.ts` 行/分支/函数覆盖 100%。
> 基线（node --experimental-test-coverage 实测，全量测试 2026-08）：

| 文件 | line % | branch % | funcs % | 缺口 |
|------|--------|----------|---------|------|
| hydration.ts | **21.79** | 100 | **0** | 游标收养全套（测试文件存在但不在 npm test glob）|
| scheduler.ts | 88.00 | 80.56 | 90.00 | 防重入/等待者/补跑链/onError/无参 render |
| vnode.ts | 94.97 | 100 | 55.56 | isNative/isComponent/isFragment/isPortal |
| build.ts | 95.27 | 94.44 | 100 | 工厂返回非函数 throw、未知类型尾分支 |
| registry.ts | 95.35 | 97.22 | 87.50 | ensureId 已有 id、safeCallRef catch |
| render.ts | 96.53 | 94.34 | 100 | innerHTML、enumerated（draggable 等）|
| ssr.ts | 96.53 | 86.44 | 53.16 | classToString 数组/对象、工厂 throw、enumerated |
| serve.ts | 98.65 | 87.50 | 81.82 | loading 模式不清空 root |
| diff.ts | 94.75 | 96.59 | 100 | 顶层数组 replaceChild 分支、patchProps 移除分支 |
| mount.ts | 93.23 | 88.89 | 76.60 | selfId 校验、createCommandContainer |

## 一、现状诊断

### 1.1 覆盖率测量命令（node 26 陷阱）

`--experimental-test-coverage` 默认 exclude **路径含 `test` 段的文件**（c8/jest 语义的
`**/test/**`）——本项目绝对路径 `/home/x/test/ai/weifuwu` 整个被排除 → 报告恒显
`all files 100%` 且无 per-file 行。必须：

```bash
node --experimental-test-coverage --test-coverage-exclude='!**' \
  --test-coverage-include='src/ui-dom/vdom/**' --test-coverage-include='src/ui-dom/vnode.ts' \
  --test --test-timeout=8000 --test-concurrency=8 '<测试文件 glob>'
```

`--test-coverage-exclude='!**'` 用取反 glob 清空默认排除（node 支持 `!` 前缀）。
验证：`--test-coverage-exclude='!**'` 后 per-file 行恢复、真实百分比出现。

### 1.2 最大缺口根因：测试文件不在 npm test glob

`src/ui-dom/vdom/test/hydration.test.ts` 有 5 个 hydration/SSR 测试，但
`package.json` test glob 只含 `src/test/**`、`src/components/**`、`src/db/**`——
**hydration 测试从未被全量执行**。这是纯工程问题：迁移到 `src/test/` 即可恢复
大部分覆盖（然后补缺口到 100%）。

## 二、实施步骤

### 步骤 0：scheduler 简化（架构决策——删除互斥锁/waiter/补跑链）

原 scheduler 有 4 套机制防「async 渲染竞态」：renderingIds 防重入、waiters 等待者、
pending 补跑链、globalRendering 全局互斥锁——但渲染本质按顺序执行（JS 事件循环
天然串行），这些是为不存在的并发问题过度设计，且 4 套机制互相叠加产生死代码
（补跑链调用带锁 renderByIds 而非 core，与「锁内绕过锁」注释矛盾）。

新模型（110 行 → 70 行）：
- **顺序队列**：render 调用按序排队（promise 链），前一个完成再执行下一个——
  恢复「用户操作顺序落地」；DatePicker 竞态（两个 render 同步连续触发读中间态）
  因串行执行自然消除，不再需要互斥锁
- **enqueue 时同步检查 `_render`**：未挂载/挂载中组件跳过（不等链内异步检查）——
  mountCommand 挂载期 add()→render() 时 `_render` 未设（跳过），若推迟到微任务
  执行，`_render` 已设但 `_parentNode` 未设 → patch 错位到 rootEl（toast 空壳事故）
- 每次 render 都完整执行 buildVNode + patchValue（无合并/补跑语义）

验证：DatePicker 竞态回归 + toast 10 测试 + 全量 1797 全绿；浏览器实测选中日期
4→4 不复制。

### 步骤 1：迁移 vdom 测试（工程修复）

`src/ui-dom/vdom/test/hydration.test.ts` → `src/test/vdom-hydration.test.ts`
（import 路径相对调整：`../../../test/client/setup.ts` → `./client/setup.ts` 等）。

### 步骤 2：新建 `src/test/vdom-coverage.test.ts` —— 补全引擎缺口

按缺口逐项构造场景（jsdom + mountRoot + createClientBrowser，测试原语
`src/ui-dom/testing.ts` 已有 mountToDom/patchToDom/buildToDom）：

| # | 目标行 | 场景 |
|---|--------|------|
| 1 | build.ts 78-82 | 工厂返回非函数（`async () => 'x'`）→ buildVNode 抛错「must return a render function」 |
| 2 | build.ts 146-147 | buildVNode 传未知类型（如 Symbol('x')）→ 原样返回 |
| 3 | registry.ts 29-34 | ensureId 重复调用（已有 id 不再分配） |
| 4 | registry.ts 62-66 | safeCallRef 抛错 → console.error 不中断（ref 清理隔离） |
| 5 | render.ts 64-66 | `innerHTML` prop → el.innerHTML 设置 |
| 6 | render.ts 68-71 | `draggable={true}` → setAttribute('draggable','true')（enumerated 显式）|
| 7 | render.ts 95-97 | 数组渲染 → DocumentFragment（buildToDom + renderValue）|
| 8 | render.ts 109-110 | body 不存在 → Portal 返回 null（browser mock bodyElement null）|
| 9 | ssr.ts 30-36 | classToString：数组/对象（truthy 过滤）→ 'a b' |
| 10 | ssr.ts 69-73 | SSR 工厂返回非函数 → throw |
| 11 | ssr.ts 98-100 | SSR enumerated 显式 true/false 字符串 |
| 12 | serve.ts 110-111 | uiServe loading:true 不清空 root（骨架屏保留→原子替换）|
| 13 | scheduler.ts 64-70 | 渲染中再次触发 render() → pending 补跑（await 等最终 DOM）|
| 14 | scheduler.ts 54-56 | render 未注册 id → notifyWaiters 立即 resolve |
| 15 | scheduler.ts 104-105 | 渲染抛错 → onError 回调（不吞）|
| 16 | scheduler.ts 112-113 | 补跑链：渲染中多次触发合并一次补跑 |
| 17 | scheduler.ts 142-145 | `ctx.ui.render()` 无参 → 当前 selfId 渲染 |
| 18 | diff.ts 112-125 | 顶层数组 patch：patchValue(parent, oldNode, oldArr, newArr) |
| 19 | diff.ts 250-257 | patchProps 移除：class/on/ref/value/普通属性 delete |
| 20 | mount.ts 118-128 | selfId：空字符串 throw / 重复 id throw / 正常注册 |
| 21 | mount.ts 245-250 | createCommandContainer → body 下 div |
| 22 | vnode.ts 118-131 | isNative/isComponent/isFragment/isPortal 四断言 |

### 步骤 3：跑覆盖报告验证

```bash
timeout 100 node --experimental-test-coverage --test-coverage-exclude='!**' \
  --test-coverage-include='src/ui-dom/vdom/**' --test-coverage-include='src/ui-dom/vnode.ts' \
  --test --test-timeout=8000 --test-concurrency=8 $(ls src/test/*.test.ts ...) 
```

逐文件到 100%（含 branch）。若个别分支因 jsdom 环境不可达（如 `b.createDocumentFragment`
返回 null 的防御分支），评估：是真实防御（mock 注入验证）还是死代码（诚实裁剪——
CS-05 不强行凑覆盖）。

### 步骤 4：测试时长预算

全量总时长 ≤15s（AGENTS.md §7.1）。新增测试全部同步断言 + 事件驱动（无 sleep 长按），
预计 +20 测试 ~ +0.5s。迁移 hydration 5 测试原样带过。

## 三、纪律约束

- 测试只放 `src/test/**`（npm test glob 已含）
- 用 `src/ui-dom/testing.ts` 原语（mountToDom/patchToDom/buildToDom/createTestCtx）
  ——禁手抄（audit R-INFRA）
- jsdom 测试：`setupJsdom()` + `createClientBrowser()`；`dispatchEvent` 必须用 jsdom Event
- 事件级测试 container 必须 `document.body.appendChild`（未连接 DOM 的 focus 无效）
- 防御分支（try/catch、null guard）用 mock 注入验证，不删代码凑覆盖
