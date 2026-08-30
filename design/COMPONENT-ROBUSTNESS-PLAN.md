# COMPONENT-ROBUSTNESS-PLAN — 内置组件测试补全与健壮性增强

> **✅ 已完成归档（2027-09）**：7/7 波次交付——波次 1（覆盖审计哨兵）
> `57fe3a5a` · 波次 2（8 缺口清零）`fc11d4cb` · 波次 3（弹窗组合矩阵 +
> mask+position 坐标不落地修复）`c2a2c3f2` · 波次 4（portal 零残留抽样
> ——审计定论）`c6dd6cee` · 波次 5（键盘 a11y + 必填校验拦截）
> `179638be` · 波次 6（冒烟全量描述对齐——定论不造代码）`295f432d`——
> audit-component-coverage 0 缺口 · 351 契约 + 120 场景 + 27 harness +
> tsc 0 + audit:semantics 0

> **发起动因（2027-09——三轮用户上报 bug 复盘）**：tour id 空间违例 /
> ContextMenu 左上角 / DatePicker 定位连锁——三个 bug 的共性不是"引擎
> 缺陷"而是 **验证面窄于行为面**：① 位置断言"在视口内"——(0,0) 也通过
> ② 组合矩阵缺失——position/mask/anchor 组合从未被测试触达 ③ 死路径
> 无觉察——position 分支零覆盖（死代码潜伏）。组件测试现状：134 组件
> 目录 × 三层测试（契约 harness 6 / showcase comp 121 文件 / 场景
> deep+cap 64 + 冒烟 40）——**13 个组件零专属测试**——现有断言以
> "功能可用"为主、"语义正确"稀薄。本计划 = 覆盖补齐 + 语义断言 +
> 组合矩阵 + 边界契约——机制化防复发。

## 0. 完成定义（波次 7 固化——audit 脚本三检查）

1. **覆盖哨兵**：`audit-component-coverage.mjs`——组件目录/registry 条目 ×
   三层测试（契约 harness / showcase comp / 场景）映射表——零豁免
   （未覆盖条目 = 违规——CI 可挂）——**死路径觉察机制化**（无测试文件的
   组件立即显红）
2. **语义断言达标**：弹窗类组件断言"在哪"（光标处/锚下方/坐标关系）——
   非"在白盒内"；表单类断言"值回流 + 受控回调"——非"能输入"
3. **错误零容忍**：全量组件渲染 + 点击扫描 console.error 零（冒烟面
   40 → 全量）
4. **边界在册**：每个组件 ≥1 条边界契约（空 props/非法值/长文本/键盘
   导航/aria 语义——按组件类别抽选）

**验收门**：现有全绿（351 契约 + 117 场景 + 27 harness + 121 comp）
+ 新增全绿 + tsc 0 + audit:semantics 0 + 双 observable audit 0 +
**showcase 层时长 ≤ 4min**（现 2.5min——预算内——R-01 纪律）

## 1. 波次规划

### 波次 1：覆盖基线审计（不造测试——建哨兵）

1. `scripts/audit-component-coverage.mjs`：
   - 输入：`src/client/components/` 目录清单 ×
     `apps/showcase/src/registry/components.ts` id 清单（含 v2 别名归并）
   - 三层映射：契约 harness（component-harness.ts 注册表）/
     showcase comp（`comp-<id>.test.ts`）/ 场景（registry.ts deep*/cap*）
   - 输出：覆盖矩阵 + 缺口清单（组件名/层/建议路径）——缺口 > 0 退出码 1
   - **别名归并**：tree-v2/tree 同源（主页面覆盖即可——既有纪律）
2. 缺口清单落 `design/component-coverage-gaps.md`（波次 2/3 的输入——
   admin 豁免登记制：npm 包/工具目录（Math/Icon/Label/Space 等纯展示）
   豁免需理由）

**验收**：audit 0 违规（当前基线即有 13 组件缺口——**先红后绿**——
补齐后转绿）· 现有测试全绿

### 波次 2：13 个零测试组件补齐

现状缺口（波次 1 审计确认——2027-09 交付版）：avatargroup / checkboxgroup /
descriptions / field / jsonschemaform / layout / searchinput / togglegroup
（math/wave/videoplayer/officeeditor 被场景 cap- 覆盖——非缺口）——分两路：

- **有 registry 页面**（descriptions/field/form/jsonschemaform/layout/
  math/searchinput/videoplayer）：直写 `comp-<id>.test.ts`（能力面——
  先读 props 接口清单 → demo 覆盖 + 参数行为断言）
- **无 registry 页面**（avatargroup/checkboxgroup/officeeditor/togglegroup/
  wave）：① 补 registry 条目 + demo（组件库完整性——用户可发现）
  ② 或走场景层 cap-（轻量——参数行为）——**优先 ①**（组件目录存在即
  应可浏览）

**验收**：13/13 全覆盖（波次 1 审计红转绿）· 新增文件各自的零错误断言

### 波次 3：弹窗组合矩阵（2027-09 教训机制化——最高优先级）

**矩阵维度**（定位源 × 形态 × 关闭开关——现只测了 anchor×placement）：

| 定位源 | 形态 | 断言（**语义级——"在哪"**） |
| --- | --- | --- |
| anchor（已有） | × placement 四方向 + center:false + margin 夹紧 | 坐标关系（popup-placement 已锁定——保留） |
| **position（无 anchor）** | ContextMenu（光标）/ DatePicker（input 下方） | **在光标处（±4px）/ 在 input 下方（bottom+4）**——comp-contextmenu 已加——**推广** |
| **mask + position** | DatePicker range/time/datetime | 日历跟随 input + **mask 全屏（inset:0）** |
| mask 无 position | Modal/Drawer | 遮罩全屏 + 内容定位语义（center） |

**组件面**：Dropdown/Popover/Tooltip/HoverCard/ContextMenu/DatePicker/
ColorPicker/Menubar/Popconfirm/Mentions——补「position/mask 组合」场景
（场景层 e2e-popup-* 扩展——真实 DOM 坐标断言——**不是白盒**）

**验收**：弹窗矩阵场景全绿（含 mask 全屏断言——inset 语义）· 现有
popup 测试不回归

### 波次 4：语义断言增强（存量 121 文件扫描升级）

**方法**：波次 1 审计输出「断言面 vs 行为面」清单——对高频组件
（表单/列表/弹窗/数据展示——按 showcase 使用率选 30 组件）升级：

- **值回流**：受控组件 onChange → props 回流 → 显示同步（失焦/逐键语义
  ——A 类纪律：useControlledInput onInput 契约）
- **卸载清理**：组件卸载 → portal/监听/DOM 零残留（unmount-dispose
  模式推广到组件级）
- **位置语义**：波次 3 之外的弹窗（Slider marks/Tooltip 四方向——已有
  部分——补齐死角）
- **修复顺带**：升级过程中发现的组件 bug——**归类纪律**（核心层根因
  修核心——组件层补丁只挡当前断言）

**验收**：30 组件语义断言落地 · 发现 bug 修复 + 契约锁定（若核心层）

### 波次 5：边界契约

每组件 ≥1 条边界（按类别抽选——不全量 160 泛化）：

- **表单类**（Input/Select/DatePicker/JsonSchemaForm/Form/…）：空值/
  非法输入/超长文本/禁用态/必填校验错误显示
- **列表类**（Table/VirtualTable/List/VirtualList…）：空数组/千行数据/
  keyed 重排（复用不重跑——reuse-regression 模式）
- **弹窗/浮层类**：快速开合（连点）/竞态关闭（open→close→open）/Escape
  链/焦点陷阱（trapFocus+lockScroll——presence 退场）
- **键盘导航**：Menubar/ContextMenu/Tabs/Combobox（方向键/Enter/Escape
  ——ARIA 语义——role/aria-* 断言）

**验收**：边界契约 ≥80 条（30 组件 × 类别抽选）· 键盘/a11y 断言在册

### 波次 6：健壮性护城河

1. **冒烟全量化**：component-smoke 40 → **全量**（registry 条目全陈列——
   渲染 + 点击扫描 console.error 零）——场景层新增文件（播放独立——
   e2e-smoke-full）
2. **守卫扫描**：事件非函数 warn（non-function props）/ 受控缺回调 warn
   ——组件级扫描（style-update/event-guard/open-guard 模式推广）
3. **SSR ≡ SPA**：全量组件首帧（SSR 吸收 vs SPA 重建——DOM 等价/聚焦
   ——抽 10 核心组件：SSR 吸收成功 + 输入值焦点保持）
4. **竞态防护**：快速切换/卸载中的异步回调（useAsyncData 退订语义——
   switchMap 取消——组件级验证：卸载后无 setState 警告）

**验收**：冒烟全量绿（零错误）· SSR 抽测绿 · 竞态防护契约在册

### 波次 7：验收 + 归档

1. 波次 0 三检查 audit 全过（覆盖哨兵/语义达标/错误零容忍/边界在册）
2. AGENTS.md §2 组件测试总表更新（三层覆盖现状 + 断言纪律——
   "语义断言：断言在哪而非在白盒内"——机制化教训）
3. 计划归档 `design/`（头部完成标记——交付范围/验收基线/实录指针——
   与既有三计划同格式）
4. 全程 R-03 纪律：类名断言精确/批量命名反查测试——**断言不得用
   `[class*="子串"]` 宽松选择器**（定位器精确类名——wf-padding 教训）

**验收**：audit 三检查 0 · 全量回归绿 · 时长预算内 · AGENTS 同步

## 2. 依赖图

```
波次 1（审计哨兵——先立标尺）
  └─ 波次 2（缺口补齐——审计红转绿）
  ├─ 波次 4（语义升级——依赖 1 的断言面清单）
  ├─ 波次 5（边界契约——依赖 1 的类别清单）
  └─ 波次 6（护城河——独立——冒烟面扩展）
波次 3（弹窗矩阵——独立——教训机制化——并行）
波次 7（验收——依赖全部）
```

## 3. 风险表

| 风险 | 缓解 |
| --- | --- |
| showcase 层时长超预算（121→150+ 文件） | 每文件 1-3 测试（不泛化）· 单测试超时 8s 不变 · 基线滚动记录 |
| 断言升级误伤（现有测试语义过时） | 逐文件升级（非批量替换）· 每波独立验收可回退 |
| 无 registry 页面组件（5 个）补 demo 工作量大 | OfficeEditor/Wave 等重组件走场景层 cap-（轻量参数行为）——registry 补条目与 demo 分开交付 |
| 全量冒烟引发既有组件 bug 暴露 | **归类纪律**：核心层根因修核心（引擎修复惠及所有组件）——组件层补丁只挡断言（记录在案——AGENTS §3 历史修复表追加） |
| 测试是"白盒假绿"（断言 DOM detail 而非语义） | 波次 3 的坐标断言/波次 4 的值回流——**行为级断言纪律**写入 AGENTS |

## 4. 收益预期

- **覆盖**：13/13 缺口清零（160 条目全在册——audit 哨兵常驻 CI）
- **语义**：弹窗类"在哪"断言 + 表单类"值回流"断言——**同类 bug
  复现即红**（ContextMenu 左上角类 = 坐标断言直击）
- **组合矩阵**：position/mask/anchor 三定位源 × 形态——**组合空间点亮**，
  死路径显式化（position 分支被测试引用——不再潜伏）
- **护城河**：全量冒烟零错误——渲染/事件面健康常驻

## 5. 执行策略

- **小步快跑**：每波独立验收（新增绿 + 现有不回归 + tsc/audit 0）——
  可回退
- **先红后绿**：波次 1 audit 先红（暴露全部缺口）——波次 2/3/4 逐波
  转绿——**红色清单 = 进度仪表**
- **优先级**：波次 3（弹窗矩阵——教训直接机制化）与波次 2（缺口——
  审计红转绿）优先——波次 4/5/6 按验收节奏推进
