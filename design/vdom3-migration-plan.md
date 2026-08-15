# vdom3 转正计划——vdom2 退役（2026-08）

> 目标：vdom3（vnode + stream 引擎）成为 weifuwu 默认前端引擎，vdom2 退出使用。
> 本文是迁移路线图：阶段、验收标准、关键决策、风险与退出标准。
> 前提：vdom3 已完成全部核心能力（22 commit/190 测试/浏览器端到端验证）——
> 差距在 **hooks 生态**（103/115 组件依赖）与**生产机制**（SSR/audit/motion）。

## 1. 资产盘点（迁移对象）

| 资产 | 规模 | 迁移策略 |
|------|------|---------|
| 组件库 | 115 组件 / 125 测试文件（1188+ 断言） | **零改动**（vdom3 提供兼容 ctx.ui 接口） |
| hooks | 27 种 ctx.ui 能力（hooks/ 9 个模块） | **源码复用**（与引擎解耦——shim ctx 注入） |
| 引擎 | vdom2/ 20 文件（build/diff 状态机/render/mount/ssr/hydrate/audit/transitions） | 退役（git 保留） |
| 应用 | agent-platform 33 文件 / 18 路由 | 入口切换 + 逐页验证 |
| 测试基建 | renderVNode/mountComponent/createTestCtx/createPopupMock | 换 vdom3 版（同 API） |
| 生产机制 | uiServe/SSR/hydrate/audit/transitions/motion/browser 三态 | 逐一移植（§4） |

**关键洞察**：agent-platform 应用层 ctx 依赖极小（render×50/onUnmount×2/useExternal×1）——
应用迁移容易；**难点在组件库的 hooks 依赖面**（usePopup×26/useScrollPosition×9/useInView×7…）。

## 2. 关键决策（D）

| # | 决策 | 理由 |
|---|------|------|
| D1 | **hooks 源码复用，vdom3 实现兼容 ctx.ui 接口**（shim——不重写 hooks） | hooks 是浏览器能力封装（定位/监听/动画）——与渲染引擎解耦；重写 27 种 = 数周且无收益 |
| D2 | **组件库零改动**（只换引擎入口） | 组件测试是最大资产（1188+）——迁移成本=0 是转正的前提 |
| D3 | **测试基建换 vdom3 实现（API 同形）** | 组件测试文件只改 import——断言语义保留 |
| D4 | **SSR 走 vdom3 事件流形态**（renderToEvents + replay——零 DOM 猜测） | vdom3 差异化价值；不回退 vdom2 游标收养 |
| D5 | **vdom2 冻结保留（不删）**——`src/ui-dom/vdom2/` 标记 DEPRECATED + 发布排除 | 回滚保险 + git 历史完整；退役≠删除 |
| D6 | **转正发布 = 大版本**（1.0）——默认入口切 vdom3 | 兼容性边界清晰；docs 同步更新 |

## 3. 阶段计划（每阶段：内容 / 验收 / 风险）

### 阶段 0：差距冻结（1 天）✅ 完成（依赖矩阵已实证）
- **hooks 依赖矩阵（实证结论）**：27 种 hooks 对 vdom2 引擎 import = **0**——只依赖 `HookEnv` 接口
  （12 字段：selfId/render/browser/onUnmount/registry/mediaRegistry/popupTrackers/scrollTrackers/
  isMounting/warned/uncontrolledValues/inputStates）+ 纯浏览器能力（clampToViewport/computeFixedPosRect）
  + `createPortal/h`（vnode.ts——**唯一引擎耦合点**——阶段 1 的 portal 等价物）
- **结论**：shim 面 = 实现 HookEnv 12 字段（多数已有或简单）+ vdom3 createPortal——hooks 零改动
- **验收**：能力矩阵冻结；无未识别差距
- **风险**：低（盘点工作）

### 阶段 1：vdom3 引擎补齐（3-5 天）
- **portal**（createPortal——组件库浮层基础；vdom3 事件流形态：PORTAL_CREATE 或远程容器 INSERT）
- **组件输出数组/多根**（build 当前假设单根 children[0]——数组项 = 隐式 Fragment 场景）
- **空洞对齐**（vdom2 占位法等价物：false/null 项在 DOM 中的位置保持——patchChildren 位置配对验证）
- **事件流能力扩展**：MOVE 已有；补 portal/文本数组场景
- **验收**：vdom3 核心测试全绿 + 新增 portal/多根/空洞测试；vdom2-matrix.test.ts 9×9 场景的 vdom3 等价矩阵
- **风险**：中（portal 与事件流执行器的集成——REMOVE 子树/undo 语义）

### 阶段 2：hooks 兼容层（5-7 天——最大工程）
- vdom3 ctx 实现 vdom2 ctx.ui 接口（render/onUnmount 已有 + selfId + 24 种 hooks）
- 实现顺序（按组件依赖排序）：useOpen → useControlled/useControlledInput → useExternal →
  usePopupPosition/usePopup（含 position/portal/escape/外部点击）→ useTween/useAnimationEnd/
  usePresence（动画退场）→ useScrollPosition/useInView/useGlobalKey/useDrag/useDragDrop →
  useMedia/useBreakpoint/useVisualViewport/useReducedMotion/useStableRef/useHoverCapable/
  useLongPress/useAsync/useChat
- 复用 vdom2 hooks 源码——shim 提供其依赖的 env（render/registry/selfId/mediaRegistry/event bus）
- **验收**：每个 hook 的 vdom2 测试在 vdom3 ctx 下跑通（红→绿逐个）；hooks 测试组全绿
- **风险**：高（hooks 内部对 vdom2 registry/render 语义的隐含依赖——shim 需精确保留；
  缓解：先做依赖矩阵——识别"引擎耦合"hooks（usePopup 的定位刷新依赖 render 时序）单独处理）

### 阶段 3：组件库迁移（3-5 天）
- 测试基建 vdom3 版（renderVNode/mountComponent/createTestCtx/createPopupMock——同 API）
- 115 组件逐个：import 换 vdom3 → 测试红 → 修引擎/hooks 缺口 → 绿
- **验收**：组件库测试全绿（1188+）；components-demo 浏览器抽查（弹层/表单/列表核心组件）
- **风险**：中（长尾组件暴露引擎边缘场景——缓解：按依赖排序先核心后长尾）

### 阶段 4：生产机制（3-5 天）
- **SSR**：vdom3 事件流形态（renderToEvents 已有）——HTML 序列化（x2html 等价）+ 水合
  （replay 到已有 DOM——跳过已存在节点 or 全量重放——验证）
- **audit**：vdom3 等价开发期校验（不变量：事件流与 DOM 一致性/孤儿实例/非法 vnode）
- **motion/退场动画**：transitions 状态机 → vdom3 事件流形态（REMOVE 延迟——animationend 驱动）
- **browser 三态**：createClientBrowser 复用（已与引擎解耦）
- **验收**：SSR 应用端到端（服务端事件流 → 客户端水合 → 交互正常）；audit 抓出已知 bug 类别
- **风险**：中（水合语义——事件流重放 vs 已有 DOM 的协调；退场动画与事件流 REMOVE 的时序）

### 阶段 5：应用迁移（2-3 天）
- agent-platform：入口换 vdom3（uiServe 等价物——路由 + 挂载 + SSR 数据）
- 18 路由逐页 jsdom 自动化 + agent-browser 手动验证（交互/弹层/流式）
- **验收**：18 页面 violations=0/errs=0；核心交互（@提及/搜索/主题/流式/文件生成/审批）回归
- **风险**：中（真实应用长尾场景——缓解：A.1-A.6 真实 DOM 验证方法论）

### 阶段 6：vdom2 退役（1 天）
- 默认入口切 vdom3；vdom2 冻结标记（DEPRECATED 注释 + 发布排除）
- docs 用户文档更新（frontend/components/README 模块总览——引擎章节）
- 版本 1.0 发布（构建 + 发布 + git tag）
- **验收**：全量测试全绿；应用全页面通过；vdom2 无生产引用（grep 审计）；docs 无 vdom2 路径
- **风险**：低（前期已逐阶段消化）

## 4. 里程碑与总工期

| 里程碑 | 内容 | 估时 |
|--------|------|------|
| M1 | 阶段 0-1：差距冻结 + 引擎补齐 | 4-6 天 |
| M2 | 阶段 2：hooks 兼容层（最大项） | 5-7 天 |
| M3 | 阶段 3：组件库全绿 | 3-5 天 |
| M4 | 阶段 4：生产机制（SSR/audit/motion） | 3-5 天 |
| M5 | 阶段 5-6：应用迁移 + 退役 + 1.0 | 3-4 天 |
| **总计** | | **3-4 周** |

## 5. 风险与缓解

| 风险 | 缓解 |
|------|------|
| hooks 对 vdom2 内部机制的隐含依赖（shim 语义偏差） | 阶段 0 依赖矩阵先行；每 hook 红→绿测试；usePopup 类引擎耦合 hooks 单独攻坚 |
| x2y 状态机（9×9）与 vdom3 事件流 diff 的等价性 | vdom2-matrix.test.ts 场景在 vdom3 的等价矩阵（阶段 1 验收项） |
| 占位法三层一致性 vs vdom3 位置配对 | 阶段 1 空洞对齐验证（提交按钮消失事故场景在 vdom3 的回归测试） |
| 性能回归（jsdom 35ms/1000 节点 vs vdom2） | bench 对比（阶段 1 基线 + 阶段 3 组件库基准）——真实浏览器为准 |
| 测试基建双轨漂移 | 单轨迁移（组件测试只改 import）；vdom2 测试冻结不删 |

## 6. 退出标准（转正判定——全部满足才切默认）

1. 组件库 1188+ 测试在 vdom3 全绿（阶段 3 验收）
2. agent-platform 18 页面浏览器验证通过（violations=0/errs=0 + 核心交互回归）
3. SSR 端到端（事件流形态）通过
4. audit 等价物抓出已知 bug 类别（回归防线不弱于 vdom2）
5. 性能基准不劣于 vdom2（真实浏览器同场景对比）
6. vdom2 无生产引用（grep 审计清零）

## 7. 非目标（诚实裁剪）

- 不做 vdom3/vdom2 运行时共存（双引擎挂载）——迁移是入口切换（原子）
- 不重写 hooks/组件库（D1/D2——复用是转正前提）
- vdom2 保留但不维护（bug 修在 vdom3）
- 事件流观测 API（__vdom_render_trace 等 vdom2 版）不迁移——vdom3 有等价物（__v3_events/stream）
