# 组件优化第三批 —— 文件头文档补全 + SVG 可访问性 + C5 哨兵

> 目标：weifuwu/components 第三批优化——探针 13 面读数——真实面 2 个（文件头注释 69 补全 · svg aria 4 处）+ C5-①/C3-svg 哨兵（机制化）。

## 探针实证（/tmp/probe-n3-*.mjs —— 不复用不提交）

| 面 | 读数 | 判定 |
| --- | --- | --- |
| props API（className/class 双面） | className 62 · class 134 · 双面 62 · Confirm 空面 | ✅ 判负（双面兼容层已建——Confirm 单例判负） |
| 受控缺口粗筛 | 17（checked/value 无 onChange）——全为数据面误报（Chart/JSONViewer 等 value=内容数据） | ✅ 判负（state 控件 19 组件已用 useControlled/useOpen） |
| 大文件 | 11 个 >300 行（SlideCanvas 426/56fn · SheetGrid 373/47fn） | ✅ 判负（工厂内闭包自然形态——Editor 拆分先例） |
| 薄测试 | 1（CommandsInjected 27 行——内部机制测试） | ✅ 判负（上轮已核） |
| docs 组件清单 | §2 分类速查（"源码目录即清单"声明——非枚举） | ✅ 判负（单源声明 + coverage 哨兵 134 权威） |
| hover/active 同体重复 | 7 组（state-hover ×10 · state-pressed ×16） | ✅ 判负（token 已单源——声明重复无害已定案） |
| font-family | 5 处全 inherit（合规） | ✅ 判负 |
| i18n t() 混用 | .t() 0 · .components 18（单一面） | ✅ 判负 |
| index 导出面 | 显式 export { 139 行（API 面可控） | ✅ 判负（覆盖 0 缺） |
| S6 字号 | 12 处 px（Avatar 11/13/16 等——warn 展示面） | ✅ 判负（头像/徽标登记类——不阻塞） |
| Icon svg | aria-hidden ✓ 已处理（探针误报——字符窗口小） | ✅ 判负 |
| 平台本地组件 | 11（AppLayout/CronPicker/ListScaffold/agent section×6） | ✅ 判负（平台层接线——ListScaffold 先例） |
| **文件头注释** | **66 有 · 69 真裸**（无任何模块/组件注释） | ⚠️ **真面①** |
| **svg aria** | Chart L89 分支 svg 无 role（其余分支 role:img ✓）· Pipeline/RelationGraph svg 全裸 · Tabs svg 无 aria（tab 有 role/label ✓） | ⚠️ **真面②** |

**真面①（69 文件）**：registry `desc` 字段是**完美单源**（每组件一句话描述——banner 生成源——与 showcase 文档零漂移）。

**真面②（4 处）**：Chart L89（早年渲染分支——同文件 L222/249/277 已 role:img——补一致）· Pipeline（svg 裸——补 role+aria-label）· RelationGraph（同）· Tabs（svg=图标装饰——aria-hidden——tab 容器 role/label 已有）。

## 波次计划

### W0 —— 哨兵（防线先行——两条）

1. **C5-① 文件头注释哨兵**：`export const X: Component`（或目录同名文件）文件无头注释 = 红；登记表（69 裸——W1 清 0）；**联动**：文件头注释必须含 registry desc 前缀（`/** <Name>：<desc>（showcase /components/<id>） */`——单源派生防漂移——desc 变更 → 注释变更 → 哨兵核）
2. **C3-① 扩展 svg 线**：`h('svg')` 无 role/aria-hidden/aria-label = 红（装饰/语义判定：role:img+label 或 aria-hidden 至少其一）；登记表（4 处——W2 清 0）
3. 负控：删头注释 → 红 · svg 裸 → 红

**验收**：C5-① 69 登记 · C3-svg 4 登记 · 负控红 · audit:all 十三线不变（五线含新子线）

### W1 —— 文件头 banner 补全（69 → 0）

1. 脚本：读 registry `desc` → 生成 `/** <Name>：<desc>（showcase /components/<id>） */` 头——69 文件批量
2. **人工甄别**：desc 质量审核（无 desc 的补——registry desc 缺失的面（≥3 依赖——判负/补注册）
3. **哨兵终态**：C5-① 69→0 · 审计读 registry desc 数 == 文件头注释数（双面单源认证）

**验收**：C5-① 0 · 69 文件头统一格式 · 注册 desc 变更联动可测（负控：改 desc → 红）

### W2 —— svg aria 补全（4 → 0）

1. Chart L89 分支：补 role:img（同文件其他分支一致）
2. Pipeline/RelationGraph：svg 补 `role: 'img'` + `'aria-label'`（aria-label 中文 = 裸文案面 → **C4_I18N_EXEMPT 补登记**（无机制组件——同 CodeBlock 案）
3. Tabs：svg 补 aria-hidden（图标装饰——tab role/label 已在容器）

**验收**：C3-svg 4→0 · C4-① 不改红（豁免登记先行）· showcase 328

### W3 —— 收尾

1. docs/client.md §5.6 红线 +1（文件头注释纪律——C5-①）+ §5.2（三件套补 banner 规则）
2. AGENTS 快照（C5 · svg 线 · 69 banner）
3. 全量回归门：test:client + showcase + 场景 + server + 平台 + audit 全绿——**任何红 = 不 commit**
4. 计划归档

## 判负记录（探针实证——可推翻）

| 面 | 判负理由 | 推翻条件 |
| --- | --- | --- |
| props API 单面化 | className 双面兼容层 62 已建（React 兼容面）——统一为 class = 破坏兼容 | 双面向客户广泛使用后（v2 API 面梳理） |
| 受控面扩 | 17 粗筛全数据面误报——state 控件受控已全（useControlled 19） | 具体控件发现缺 onChange 双侧（契约证据） |
| 大文件拆分 | 工厂内闭包自然形态（SlideCanvas/SheetGrid 函数全用工厂状态——拆 = 接口泄漏） | 纯函数层占比 >40%（提取收益实证） |
| hover 声明重复合并 | token 已单源（state-hover 等一处定义）——同体重复声明无害 | >20 处同规则 + 可抽公共类（体积实证） |
| 平台本地组件迁移 | 平台层服务端接线（非通用——ListScaffold 先例） | 第二消费仓库出现 |
| JSDoc 组件级补全 | 文件头 banner（W1）已覆盖用途面——组件级 JSDoc 大补（88）收益中 | 公开 API 类型级文档需求出现 |
| S6 字号 | warn 展示面（头像/徽标登记类）——非阻塞 | 正文类字号残留实证 |
