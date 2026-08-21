# Portal 独立通道改造计划（2026-12 立项）

> 动机（用户决策）：popconfirm 开合 1→2 / confirm 2→3 的 A 级检测误报、
> Menubar 面板残留（diff 混合数组 portal）、开关浮层触发主树 children
> diff——根因同源：**portal 作为组件 children 数组项参与主树列表机制**。
> 目标：portal 不再进入组件 children——**纯 usePopup 内部管理的独立通道**
> （React createPortal 语义——独立渲染树）。

---

## 1. 现状架构（portal 经 children 槽）

```
组件 renderFn：
  return h('div', { ...wrapProps }, [
    children,                       // 业务子节点
    popup.portal(content, key),     // portal VNode（createPortal）
  ].filter(Boolean))
```

引擎处理（build/diff 的 portal case）：
- **主树插槽锚**：`createAnchor`（`pathId` 位置——槽位持有）
- **内容渲染**：`portal:key` 命名空间容器（`portalContainer` 惰性创建——
  `#__wf_portal` 下）
- **开关**：portal vnode 出现/消失 → **children 数组长度变化**（1↔2）→
  列表 diff（全 unkeyed 按位置——portal 项参与）

**问题清单**（全部实证过）：
| 问题 | 事件 |
| --- | --- |
| A 级检测误报（1→2/2→3——portal 项/条件尾部） | popconfirm/confirm 页 warn（已豁免+细化——**治标**） |
| diff 混合数组 unkeyed 含 portal 旧项从不移除 | Menubar 面板残留（核心修复 153c49e1） |
| 开关浮层触发主树 children diff（列表分类/位置复用） | 性能噪音 + 回归面 |
| portal 豁免逻辑散落（检测/列表分类/混合数组特判） | 维护成本 |

## 2. 目标架构（portal 独立通道）

```
组件 renderFn：
  return h('div', { ...wrapProps }, children)   // 纯业务 children——无 portal

usePopup（内部管理）：
  open/exit 状态 → portal 内容渲染到 #__wf_portal（独立通道）
  —— 不经过主树 children diff —— 开关零主树命令
```

**核心不变量**：
- 组件输出 = 业务 vnode（无框架插槽项——用户可推导性 §4.0）
- portal 生命周期（open→渲染 / exit→保持退场动画→卸载）由 usePopup 独占
- portal 内容共享 ctx（i18n/版本/事件代理）——与主树同语义
- SSR 兼容：服务端输出 portal 内容（HTML 尾部容器）——client 吸收

## 3. 关键设计决策

### D1 渲染通道（3 选项）
| 选项 | 机制 | 评估 |
| --- | --- | --- |
| A | 独立 CommandApplier（toast/confirm 命令式同款——独立 registry） | 隔离干净——但事件/ref 需共享代理（ctx 版本同步复杂） |
| B | 主 applier 的 portal 命名空间（client 侧直接 emit 命令——现有容器） | 复用现有——但 client 侧 gen 与流式命令混合（来源不统一） |
| C | **组件输出保留 portal vnode——引擎完全独立**（不参与列表/检测/长度） | **API 不变——组件零改动——低风险先行** |

**决策**：**分两步**——阶段 1 走 C（引擎独立化——消除全部问题——组件零改动）；
阶段 2 评估 A/B（usePopup 内部管理——组件 API 变更——28 组件迁移）。
C 已覆盖用户可见的全部问题（误报/残留/检测）——B/A 是引擎内部整洁度的
增量——**以 C 验收为里程碑**（若 C 后无可见问题——B/A 可延后或取消）。

### D2 渲染时机（阶段 2 若实施）
- usePopup 持有 portal vnode（hook 状态）
- open/exit 变化 → 渲染/卸载（组件 render 期触发——`env.scheduleAfterRender`
  或渲染期直接 emit——D1 选定后细化）

### D3 SSR 兼容（阶段 2 若实施）
- 服务端渲染 portal 内容到 HTML 尾部 `#__wf_portal` 容器（现状保持）
- client 吸收（`data-v3-id` 标记——现有吸收协议）
- 首帧打开状态（SSR 时 open——序列化——client 收养）

### D4 事件/ref/ctx
- portal 内容事件经全局代理（document 捕获——现状）——注册表共享
- ctx 版本（bumpCtxVersion——i18n 切换）——portal 内容重渲染同步
- ref（panelRef/portalPanelRef）——稳定回调（mount 定义——§5.1）

### D5 presence 退场
- exit 阶段 portal 保持（退场动画）——animationend 卸载（现状语义保持）
- 组件卸载（条件渲染移除）→ portal 清理（procUnmount——已修）

## 4. 分阶段实施

### 阶段 0：基线锁定（当前——全部绿）
- showcase 186 + 场景 110 + 契约 103 + tsc
- 位置断言 20 浮层（portal/fixed/对齐/视口——机制验收）
- **验收**：记录基线（提交 hash）——改造后逐项对比

### 阶段 1：引擎 portal 完全独立（C——组件零改动）
**改动**：
1. `childrenOf`/列表分类：portal 项**不参与列表机制**（listKind/hasKeyed/
   检测——统一入口收敛——单一规则源）
2. A 级检测豁免固化（portal 过滤 + 组件序列比较——契约测试锁定）
3. portal case 单测补齐（build/diff/apply 命令流——锚保持/开关零长度
   变化命令）
4. diff 混合数组的 portal 特判（评估——现有 removePortal 对齐保留）

**验收**：
- 全部契约/场景/showcase 绿
- **开关浮层零 children 长度变化命令**（命令流断言——新契约测试）
- 无 portal 相关 warn（probe popconfirm/confirm 0 警告）

### 阶段 2：usePopup 内部管理（B/A——组件 API 变更——28 组件迁移）
> 决策点：阶段 1 验收后评估是否必要——若 C 已消除全部可见问题——
> 此阶段为引擎内部整洁度增量——**用户确认后实施**

**改动**：
1. `popup.portal` 语义变更（不再要求放入 children——内部持有）
2. usePopup 渲染通道（D1 选定——afterRender/渲染期）
3. 组件迁移（28 文件 33 处：`[children, portal]` → `children`）
   ——每组件独立验证（位置断言 + 开关 + 无残留）
4. SSR/吸收适配（D3）
5. 事件/ref/ctx 共享（D4）——presence 退场（D5）

**验收**：
- 全量绿 + 位置断言 20 浮层 + 场景（portal 往返/退场/无残留）
- 组件输出 = 纯业务（grep 审计——无 portal vnode in children）
- 开关浮层主树命令量对比（before/after——bench 记录）

### 阶段 3：豁免/特判清理 + 文档
- A 级检测 portal 豁免（阶段 2 后不再需要——删除）
- diff 混合数组 portal 特判（评估保留——防御性）
- AGENTS.md 更新（§4.0.x/§5.4——portal 机制描述改版）
- design 归档（portal-channel 定稿——本计划完成归档删除）

### 阶段 4：性能验证
- 开关浮层命令量（阶段 1 后：锚保持——零 children 长度命令）
- 浮层开合交互延迟（真实浏览器测量——可选）
- 文档（docs/ 用户文档如有影响——§5.4 弹窗纪律保持）

## 5. 风险与回退

| 风险 | 缓解 |
| --- | --- |
| 阶段 2 组件迁移回归面大（28 组件） | 每组件独立验证（comp-<id> 位置测试全绿）——单组件提交 |
| SSR/吸收（portal 容器标记） | 现有吸收协议（data-v3-id）——ssr-adopt 场景回归 |
| presence 退场时序（动画未结束卸载） | 现状语义保持（animationend + fallback）——popup-presence 场景 |
| ctx 版本同步（i18n 切换 portal 内容） | bumpCtxVersion 机制——i18n 场景回归 |
| 阶段 2 风险高 | **回退策略**：git 回滚阶段 2——阶段 1（C）保留（已消除全部
  可见问题）——B/A 延后 |

## 6. 验收标准（最终）

- [ ] 全部测试绿（showcase 186+ / 场景 110+ / 契约 103+ / tsc）
- [ ] 位置断言 20 浮层（portal 归属 + fixed + 视口 + 对齐——全绿）
- [ ] 开关浮层零 children 长度变化命令（契约断言）
- [ ] 无 portal 相关 warn（probe 全浮层页）
- [ ] 组件输出无 portal vnode（grep 审计——阶段 2 后）
- [ ] AGENTS.md/design 文档同步

## 7. 工作量与提交链（预估）

| 阶段 | 提交 | 预估 |
| --- | --- | --- |
| 0 | 基线记录（无代码） | 0 |
| 1 | 引擎独立化 + 契约回归 | 1-2 提交 |
| 2 | usePopup 通道 + 28 组件迁移 | 5-8 提交（每组件/每批） |
| 3 | 清理 + 文档 | 1-2 提交 |
| 4 | 性能验证 + 归档 | 1 提交 |
