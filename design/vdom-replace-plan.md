# vdom 替换 ui-dom 计划（client/vdom → client/ui-dom 退役）

> 目标：新引擎 `src/client/vdom/`（本对话构建——四阶段管线/事件代理/
> RefRegistry/UIContext 类型增强/中转站架构——258 测试护航）替换老引擎
> `src/client/ui-dom/`（vdom3/vdom4/services/contracts/hooks/middleware/locale）。
>
> 公共面决策（用户）：值面只有 `h/jsx/uiServe/UIRouter` 三符号——
> `createRoot` 不导出（UIRouter 唯一应用入口）；`uiSsr` 不单独导出
> （uiServe 双端一体）。

---

## 0. 现状盘点（2026-XX 基线）

| 项 | 数据 |
| --- | --- |
| 组件库 | `src/client/components/` 132 组件 + 223 测试——`../../ui-dom` 导入 **700+ 处** |
| 布局/office | `src/client/layout/`（style-audit 仅测试引用）、`src/client/office/`（pptx/docx/xlsx 依赖 ui-dom） |
| apps | showcase 用 `weifuwu/ui-dom` **vdom3 面**（createRouter/h/stream/事件流/v3Toast/v3Confirm/v3Notification） |
| 构建 | `dist/ui-dom/index.js` + `jsx-runtime.js` + `vdom3.js` + `testing.js`（build.mjs） |
| 新引擎 | `src/client/vdom/`——h/jsx/uiServe/UIRouter + UIContext + 14 hooks + middlewares + 258 测试 |

## 1. 契约差异清单（迁移前置——逐项对齐）

### 1.1 ctx.ui hooks（组件库消费 17 个 vs vdom 现有 14 个）

| 组件使用 | 次数 | vdom | 动作 |
| --- | --- | --- | --- |
| render | 250 | ✅ | 签名对齐（ui-dom `render()` vs vdom `render(): Promise<void>`） |
| usePopup | 35 | ✅ | **options 形状比对**（placement/presence/maskCentered 等） |
| useScrollPosition / useInView / useGlobalKey / useControlledInput / useOpen / useChat / useDragDrop / useControlled / useStableRef | 34 | ✅ | 签名比对（受控参数形状/返回值） |
| **useTween** | 5 | ❌ | **P1 补**（StatCard 数值动画——rAF + ease-out） |
| **useDrag** | 2 | ❌ | **P1 补**（Resizable/ImageCropper——pointerdown 捕获拖拽） |
| **useVisualViewport** | 1 | ❌ | **P1 补**（viewport 响应） |
| **useReducedMotion** | 1 | ❌ | **P1 补**（偏好感知） |
| **usePopupPosition** | 1 | ❌ | P1 评估（vdom usePopup 已内化定位——组件处可能直接删） |

### 1.2 ctx 面（WfuiContext vs UIContext）

| ui-dom（WfuiContext） | vdom（UIContext） | 动作 |
| --- | --- | --- |
| `ctx.ui.render` | `ctx.render` + `ctx.ui.render` | 组件用 `ctx.ui.render`（250 处）——vdom 需提供同形状（或全局替换） |
| `ctx.browser` | ✅ 同形状 | 7 处——签名比对 |
| `ctx.data` | ✅ DataPipe | 形状比对（get/set/has vs 三场景） |
| `ctx.ui.onUnmount` | `ctx.onUnmount` | 1 处 |
| 语义 id（registerSemanticId） | `ctx.ui.selfId`? | vdom 无——组件用否（grep） |
| ensurePopupListeners | usePopup 内化 | 无组件直接用 |

### 1.3 组件导入面（700+ 处）

```
../../ui-dom/vnode.ts      → h/jsx（✅ vnode 形状兼容——Button 试点验证）
../../ui-dom/types.ts      → Component/WfuiContext（→ vdom Component<P, UIContext>）
../../ui-dom/store.ts      → vdom store（形状比对）
../../ui-dom/motion.ts     → animateOut（vdom 无？——组件用否）
../../ui-dom/middleware/*  → vdom middlewares
```

### 1.4 命令式 API（vdom 无——showcase 用了）

- `v3Toast/v3Confirm/v3Notification`（showcase 中间件装配）——**决策**：vdom 补命令式入口（`uiServe` 挂 toast/confirm/notification）或 showcase 改组件式用法——**P4 定**
- `aiStream`（ui-dom）vs vdom `useChat`——组件（AiChat 等）迁移对齐

### 1.5 office/layout

- `src/client/office/pptx/docx/xlsx` 依赖 ui-dom——P2 迁移（h/类型导入面）
- layout 仅测试引用——P5 清理

## 2. 分阶段执行

### P1 契约补齐（vdom 侧——不依赖组件迁移）

- [ ] 补 hooks：useTween（rAF + ease + reduced-motion 直落）、useDrag（pointerdown 捕获）、useVisualViewport、useReducedMotion——从 ui-dom 移植语义 + vdom 测试（覆盖度量不降）
- [ ] `ctx.ui.render` 兼容形状确认（组件 250 处调用的最小适配）
- [ ] 命令式 toast/confirm/notification 决策（补 or showcase 改造）
- [ ] **验证**：vdom 全量测试绿 + 新增 hooks 独立测试

### P2 组件库迁移（132 组件——依赖图谱分批）

- [ ] 依赖分析：按「无 ui-dom 依赖组件 → 依赖组件 → 复合组件」分批（grep 统计依赖图）
- [ ] 每批：导入面重定向（`../../ui-dom/*` → `../vdom/*`）+ 类型替换（WfuiContext → UIContext）+ hooks 签名适配
- [ ] 组件测试迁移：`ui-dom/testing.ts` → vdom 测试基建（renderVNode/mountComponent 等价物或映射）
- [ ] **验证**：每批组件测试全绿（223 测试）+ tsc 0

### P3 包面切换（weifuwu/client = vdom）

- [ ] build.mjs：`dist/ui-dom` → `dist/client`（或保留 ui-dom 名——决策）——vdom index + jsx-runtime + testing 构建
- [ ] tsconfig paths：`weifuwu/client` → src/client/vdom（dev 单图）
- [ ] package.json exports：`./client` 指向新面
- [ ] **验证**：组件库经新包面全量绿 + 覆盖度量

### P4 apps 迁移（showcase/agent-platform）

- [ ] showcase：vdom3 面 → 新 vdom 面（createRouter → UIRouter、stream → uiServe、事件流观测 → 对应物、v3Toast 族 → P1 决策结果）
- [ ] agent-platform：依赖清单（UIRouter/uiServe 契约已对齐——验证）
- [ ] **验证**：agent-browser 实测 showcase 全站（导航/组件页/交互）+ 平台自身跑通

### P5 退役（ui-dom 删除）

- [ ] 删除 `src/client/ui-dom/`（vdom3/vdom4/services/contracts/hooks/middleware/locale）
- [ ] build.mjs 清理 ui-dom bundle；package.json exports 清理
- [ ] 测试清理：ui-dom 相关测试组删除/迁移（vdom3 组、边界审计）
- [ ] AGENTS.md 文档同步（§4.0.x vdom3 引擎/§6/§7 的 ui-dom 引用——替换为 vdom）
- [ ] design 归档：vdom3/vdom4 设计文档标注退役
- [ ] **验证**：全量测试绿 + `grep -rn "ui-dom" src/ apps/` 归零 + showcase/agent-platform agent-browser 实测

## 3. 风险与对策

| 风险 | 对策 |
| --- | --- |
| hooks 签名差异（usePopup options/useOpen 受控形状） | P1 逐项比对清单——签名以组件消费为准（组件不改语义） |
| ctx 面差异（render 形状/语义 id/ensurePopupListeners） | 组件 250 处 ctx.ui.render 是最大面——先做兼容适配再迁移 |
| 命令式 API 缺位（toast/confirm/notification） | P1 决策——showcase 是自举验证场（平台必须全由 weifuwu 能力构成） |
| 组件测试基建迁移成本（223 测试用 ui-dom/testing） | vdom 已有 testing.ts（不变量 helper）——renderVNode/mountComponent 映射或适配 |
| office（pptx/docx/xlsx）隐藏依赖 | P2 依赖分析覆盖 office——非组件路径单独批 |
| 覆盖度量回退（迁移中测试缺失） | 每批跑 test:cov:vdom——缺口归零才进下一批 |

## 4. 验证标准（每阶段 gate）

- [ ] tsc --noEmit 0 错误
- [ ] vdom 全量测试绿（258+）
- [ ] 覆盖度量：行为代码缺口归零（test:cov:vdom）
- [ ] P2 后：组件库 223 测试全绿（迁移后）
- [ ] P4 后：showcase/agent-platform agent-browser 实测（导航/组件页/交互/命令式）
- [ ] P5 后：`grep -rn "ui-dom" src/ apps/` 归零
