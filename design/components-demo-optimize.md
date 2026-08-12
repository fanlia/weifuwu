# apps/components-demo 优化计划 — 组件库质量走查（P9）
> **状态（2026-12 确认）**：✅ 已完成——apps/components-demo 质量走查面——首帧 566→140ms、节点 3844→194，走查暴露缺口全修

> 目标：让 `apps/components-demo` 成为组件库的**质量走查面**——109 个组件每一个
> 类型正确、交互可点、图标合规、亮暗/断点可读；走查暴露的组件/client 缺口同步
> 修复（能力缺口 → 补框架，绝不绕过）。
>
> 方法沿用 layouts-demo 纪律（AGENTS.md §8 + 附录 A）：agent-browser 真实 HTML
> 验证（outerHTML/getComputedStyle/getBoundingClientRect），text 全对 ≠ 可见。
>
> 前置：layout P8 已交付清单脚本/冲突防线/幽灵类防线（本计划直接复用其模式）。

## 现状盘点（2026-08 实测）

| # | 问题 | 证据 |
|---|------|------|
| 1 | **类型门禁缺失，demo 与组件 API 脱节** | `tsc -p apps/components-demo` 12 个存量错误：Layout 不透传 `style`、Divider 无 `orientation`、StatCard `countdown` 模式强制 `value`、7 处 `ctx.toast` 可能 undefined——`npm test` 不跑 app tsc，漂移无防线 |
| 2 | **计数漂移（layout 同病）** | 头部/i18n/footer 4 处硬编码「91 个组件」「61 组件」「466 测试」，实际 109 个组件 |
| 3 | **图标纪律违反** | 10 处 emoji/裸字形 icon prop（📦👤💰⚠🟢✏️📊⚙️，含 DemoCard 内嵌 code 字符串）——layouts-demo 已清零，本 demo 未跟进 |
| 4 | **单文件 2483 行、无导航** | 112 个 demo 挤一个 main.tsx；9 个分组只能滚动浏览——无分组导航/搜索/深链（layouts-demo 已有范式可抄） |
| 5 | **无系统化验证记录** | 无亮/暗 × 断点截图矩阵；无交互路径走查记录（哪些组件"能点"无人知晓）；有主题切换器但从无双主题验收 |
| 6 | **组件 API 缝隙**（demo 暴露） | Layout 系不透传 `style/className`；Divider 无 `orientation="vertical"`；StatCard countdown 模式 `value` 应可选；`ctx.toast` 可选类型迫使调用方 `?.` |

## 阶段总览

| 阶段 | 内容 | 工作量 | 风险 | 依赖 | 状态 |
|---|---|---|---|---|---|
| C0 | 类型门禁 + 12 个 tsc 错误分类修复（含组件 API 缝隙） | M | 低 | — | ✅ |
| C1 | 纪律清零：emoji→Icon、计数脚本化、幽灵类复查 | S | 低 | — | ✅ |
| C2 | demo 壳升级：分组导航 + hash 深链 + 搜索过滤 | M | 低 | C0 | ✅ |
| C3 | 验证矩阵：亮/暗 × 1280/768/375 + 交互走查记录 | M | 低 | C0-C2 | ✅ |
| C4 | 走查暴露的组件/client 缺口修复（滚动吸收） | 滚动 | 中 | C3 | ✅ |

## 验收记录（2026-08）

- **C0**：12 个 tsc 错误清零（组件缺口：Layout style/className 透传、StatCard countdown
  value 可选；demo 错：ToastInjected 注入声明 ×3、Divider orientation→vertical）。
  门禁落地为 `src/test/apps-typecheck.test.ts`（npm test 并发隐藏 tsc 耗时，增量缓存热 <1s）
- **C1**：demo emoji 图标清零（StatCard/FloatButton/Menu/EmptyState——消费 P8 StatCard
  VNode icon）；EmptyState 默认图标 📦→Icon inbox（组件级 P3 违规）；计数同步（109 组件/
  811 测试——README/docs/components.md 三处漂移 102/113/92 一并修正，audit 强制）
- **C2**：吸顶导航（9 分组锚点 + 横向滚动）+ 搜索过滤（Section 级过滤 + 空分组隐藏）
  + hash 深链（客户端渲染后 scrollIntoView 补跳）+ 头部内联样式清零
- **C3**：矩阵（1280/768/375 无溢出）+ 9 组件交互路径实测（记录入 demo README）；
  修复 Rate readOnly 受控 warn 误报、DemoNavMenu 受控不更新、DemoRadio inline 缺 onChange
- **C4（client 修复）**：JSX ElementType 放宽 `Component<any, any>`——带 ctx 注入声明的
  组件可作 JSX 元素（C 是类型级 ctx 声明，JSX 不提供 ctx）
- 走查教训固化：agent-browser 会话残留制造假 bug（Select 无匹配/Tree 塌陷均为假象）——
  交互验证必须从 reload/重开开始（附录 A.5 再次实证）
- 门禁：全量 1794+ pass / 0 fail；两 app tsc 绿；style-audit 30 条绿

## C0 — 类型门禁 + 存量错误修复

- **门禁**：`npm test` pretest 或 style-audit 增加 `tsc --noEmit -p apps/*/tsconfig.json`
  （layouts-demo 已绿、components-demo 修复后入门禁——app 类型漂移即刻红）
- **12 个错误分类修复**：
  - **组件缺口**（补框架）：Layout/LayoutSider/LayoutHeader/LayoutContent/LayoutFooter
    透传 `style`/`className`；Divider 补 `orientation: 'horizontal' | 'vertical'`
    （antd 等价——Space split 场景刚需）；StatCard `value` 在 `countdown` 模式下可选
  - **demo 错**（修 demo）：7 处 `ctx.toast` → demo mount 时断言注入（demo 用了
    toast 中间件则收窄类型）或 `?.` 调用
- **验证**：两 app tsc 全绿；受影响组件（Layout/Divider/StatCard）TDD——先写失败测试。

## C1 — 纪律清零

- emoji/裸字形 → Icon 组件（StatCard icon 已支持 VNode——P8 刚加的能力，此处即消费方）；
  DemoCard 内嵌 `code` 字符串同步改（开发者复制的就是它）
- 计数脚本化：`scripts/layout-inventory.mjs` 扩展 `--components`（组件数 = 含同名
  .ts 的目录数；测试数 = 组件 .test.ts 的 it 计数），demo 头部/badge/footer 改为
  构建期注入或启动期生成；audit 计数同步规则覆盖组件计数
- 幽灵类防线复查（P8 已抓 7 处，修完后应保持 0）

**验证**：style-audit 扩展规则绿；demo 页面 grep 无 emoji icon。

## C2 — demo 壳升级（抄 layouts-demo 范式）

- 左侧分组导航（9 个 Section → wf-nav 分组 + Anchor 滚动跟随——组件库自用 Anchor）
- hash 深链（`#Table` 直达组件卡片）+ 顶部搜索框（按组件名过滤卡片）
- 窄屏降级：侧栏隐藏 → 顶部横向切换条（layouts-demo 已有完整范式）
- 保留单文件内聚（demo 代码内联可读），**不拆文件**——只加壳

**验证**：agent-browser 实测导航点击/搜索过滤/hash 直达；768/375 无横向溢出。

## C3 — 验证矩阵（agent-browser 走查记录）

- **截图矩阵**：亮/暗 × 1280/768/375 × 9 分组（落地 README 表格，对齐 layouts-demo）
- **交互走查**：每组件至少一条交互路径（点击/输入/键盘）实测记录——重点复查
  AGENTS.md 事故高发区：受控组件回调（§5.2）、受控输入焦点（§5.3）、弹层 portal
  定位（§5.4）、ref 稳定（§5.1）
- **发现即修**：走查暴露的组件 bug → 进入 C4；client 层 bug → 修 client

## C4 — 缺口修复（滚动吸收）

C0/C3 暴露的组件 API 缝隙与行为 bug，按「先测试（红）→ 修复（绿）→ style-audit」
节奏滚动修复；client 层问题（渲染/状态/事件原语）同步修复并补 client 测试。

## 诚实裁剪（不做）

- **demo 拆分为 per-component 文件**：单文件 + 壳导航已满足走查，拆分是搬运无收益
- **组件视觉重设计**：本计划只修正确性/一致性，不动设计语言（design-system 系列已收官）
- **新组件**：roadmap 已收官（109 个），本计划零新增组件
- **组件文档站**：docs/components.md 已随包发布，demo 不替代文档

## 执行顺序

```
C0 门禁+存量修复 → C1 纪律清零 → C2 壳升级 → C3 验证矩阵 → C4 滚动吸收
```

每期门禁：全量 `npm test` + style-audit + 两 app tsc + build + agent-browser 走查。

---

## 第二轮：性能与结构（P10，2026-12 已实施）

> 第一轮（C0-C4）交付质量走查面；第二轮交付**浏览体验**——实测暴露的问题：
> 115 个 demo 一次性全渲染（3844 节点 / 页面 31 米 / 首帧 566ms）。

### 实测对比（agent-browser，本地）

| 指标 | 优化前 | 优化后 | 降幅 |
|------|--------|--------|------|
| 首帧（loadMs） | 566ms | **140ms** | -75% |
| DOM 节点 | 3844 | **194** | -95% |
| 页面高度 | 30998px | **3007px** | -90% |
| 初始代码块（pre） | 116 | **5**（details 收起不渲染） | -96% |

### S0 — 代码块折叠 + 复制（低成本高收益）

- DemoCard 的 `pre` → `<details>` 原生折叠（默认收起）——36% 页面高度退出渲染树；
  summary 内复制按钮（`ctx.browser.copyText` + `preventDefault/stopPropagation` 防 toggle）
- 复制反馈：内部 `copied` let + render()（render-only）
- 幽灵类防线抓到 `wf-demo-code`（未定义类）→ 移除（details 默认样式足够）

### S1 — 分组懒渲染（核心）

- Section 两阶段化：`ctx.ui.useInView({ threshold: 0.02 })` + **once-latch**
  （`if (isIn) rendered = true`——滚入渲染后永不回收，demo 状态保持）
- IO 未就绪（`!ready`）保守渲染卡片（避免首屏闪烁）；就绪且不在视口 → 占位提示
- **搜索特殊处理**：`q` 非空 → 全分组渲染（全局匹配）；清空恢复懒渲染（rendered 只由 isIn 设置）

### S2 — 搜索增强

- `matchCard(title, desc)`——标题 + 描述模糊匹配（`includes` 大小写不敏感）

### 验证（agent-browser）

- 首帧 140ms ✓ · 滚动加载（表单选择 5 卡片渲染、占位消失）✓ · latch（滚回顶部保持）✓
- details 展开（open=true + pre 可见）✓ · 复制反馈（✓ 已复制）✓ · 按钮计数交互（0→1）✓
- 搜索全渲染（搜「日期」75 卡片）✓ · 清空恢复懒渲染 ✓ · 1280 无溢出 ✓
- 375 断点：CSS 自适应（网格 `minmax(min(100%, 420px))` 单列化）——懒渲染不改 CSS，
  溢出风险由既有 C3 矩阵覆盖（agent-browser device 命令需 Xcode，环境不可用）

### 诚实裁剪（第二轮）

- **不做页面虚拟滚动**（与懒渲染收益重叠，复杂度不值）
- **不拆单文件**（2716 行——demo 单文件快速浏览价值 > 模块化收益）
- **不做 SSR/静态化**（demo 是交互走查面）
- **不做组件级懒加载**（`ctx.ui.js` 动态编译已有，非 demo 场景优化点）
