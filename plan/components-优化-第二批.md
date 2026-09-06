# 组件优化第二批 —— i18n 接线补漏 + CSS 死类卫生 + C4 哨兵

> 目标：weifuwu/components 第二批优化——探针读数——真实面 2 个（i18n 机制接线补漏 12 处 · CSS 死类卫生 51 处）+ C4 哨兵二线（机制化防回潮）。

## 探针实证（/tmp/probe-next*.mjs —— 不复用不提交）

| 面 | 读数 | 判定 |
| --- | --- | --- |
| CSS 颜色字面量 | hex **0** · rgb **0** · !important 0 · named 11（全 currentColor/transparent 合规） | ✅ 判负（已全 token 化） |
| CSS @media 断点 | 4 处（DatePicker/Drawer/Modal/Transfer）——全 `639.98px`/`767.98px` = `--wf-bp-sm/md - 0.02` | ✅ 判负（media query 不支持 var——注释单源锚定已是最优——Transfer `pointer: coarse` 为触屏功能面合规） |
| 双事件绑 | 1 候选（ImageCropper L149/151）——**两个不同按钮各一 onClick** | ✅ 判负（探针误报） |
| CSS 跨文件重复规则 | 126 组（`background: var(--wf-state-pressed)` 19 处等） | ✅ 判负（token 化后声明重复无害——维护点单源在 token——不合并是组件封装设计） |
| props 接口导出 | 0 缺失 | ✅ 判负 |
| 受控面粗筛 | 42 文件 onChange——19 真用 useControlled/useOpen | ✅ 判负（42 里绝大多数是简单转发非受控语义——粗筛误报） |
| 非 wf- 前缀类 | 9 候选（`css`/`style`/`top`/`left`） | ✅ 判负（噪声——选择器盘匹配误差） |
| 硬编码中文文案 | 1385 → 剥注释 25 → fallback 甄别后**真裸 12 处 / 3 组件** | ⚠️ **真面①** |
| CSS 死类 | 242 → 词干级 51 处 / 17 文件 | ⚠️ **真面②**（需动态拼接甄别） |

**i18n 真裸 12 处**（机制在——接线补漏——fallback 不变 = 行为恒等）：

| 组件 | 机制 | 真裸处 | 备注 |
| --- | --- | --- | --- |
| ThemeSwitch | `SL = ctx?.i18n?.components?.ThemeSwitch` ✓ | **4**：PRESETS 模式名（L26-29 默认/极简/紧凑/圆润）——渲染 L122 直用 | 该表是 preset 面（mode 表 L97-100 已走 SL.auto/light/dark）——preset 漏接 |
| Editor | `editorText`（`ctx?.i18n?.components?.Editor?.[key] ?? fallback`）✓ | **6**：commit 历史 label 输入×2（pushCommit tag）· title+aria 插入表格（L649-650）· title+aria 操作历史（L933-934） | AI ops label（L292-296）消费处已走 `editorText('ai-${a.id}', a.label)` ✓ |
| AppShell | ctx 签名有（`Component<AppShellProps>`）——但 `_ctx` 弃用 | **2**：Button title 设置（L112）/退出登录（L113） | 需 _ctx → ctx 启用 |

**i18n 判负登记**（无机制面——文案默认中文 fallback——locale 包面缺失——<3 处/组件 · 收益 < 成本）：AiChat（placeholder/empty——**labels prop 设计面已有**（ChatInput labels 覆盖 ✓））· ApprovalCard · CodeBlock（aria 复制/title 复制代码——无 props 面——登记）· ChatInput（**labels prop 覆盖机制已设计**——探针误报 ✓）· PromptTemplate · SessionList · SheetGrid（label `AI 润色 ${ai…` 动态模板——无机制）· SlideCanvas（双击编辑文本/AI 润色——无机制）。

**CSS 死类 51 处**（词干级——需要动态拼接甄别）：
- CodeBlock `wf-hl-*` ×7：**highlight.ts tokenize 运行时输出**（`wf-hl-${token.type}`）——活（验证后登记豁免）
- 其余 44 处 / 16 文件：**逐处甄别**（变体拼接误报已在词干级过滤——真死 = CSS 定义但运行时永不生成）

## 波次计划

### W0 —— C4 哨兵二线（防线先行）

**audit:health 扩展二线**（C3 三线 → C4 五线）：

1. **C4-① i18n 裸文案**：组件 TS（剥注释/剥 test）扫描 children 位/文案属性面（placeholder/title/aria-label/label/empty/text…）中文无 fallback 信号（`??`/editorText/SL./labels——**豁免**：编辑器 prompt 模板（AI 协议）· 注释 · fallback 形态 · 无机制组件登记 C4_I18N_EXEMPT 表）
2. **C4-② CSS 死类**：词干级检测（`--` 拆分取基底——变体拼接豁免）+ 动态拼接豁免登记（C4_CLASS_DYNAMIC：CodeBlock `wf-hl-*` token 面等）
3. **负控**：新增裸文案（编辑代码加 `h('span','你好')`）→ 红 · 新增死类（加 CSS 类不引用）→ 红
4. `npm run audit:all` → **十三线**

**验收**：C4-① 12 处登记（待修——**红区可见**——W1 清 0）· C4-② 51 处甄别完成（豁免/真死清单）· 负控红 · 契约不变（452）

### W1 —— i18n 接线（12 处 → 0）

**目标**：机制在——接线补漏——fallback 不变（行为恒等——**全量回归必绿**）：
1. **ThemeSwitch**：PRESETS 渲染走 SL（`SL.presetDefault ?? '默认'` 等 4 键）
2. **Editor**：commit 历史 label 接 editorText（`editorText('history-input', '输入')`）· title/aria 插入表格/操作历史接 `editorText('insertTable', ...)`（title+aria 同键）
3. **AppShell**：`_ctx` → `ctx` + `ctx?.i18n?.components?.AppShell?.['title-settings' | 'title-logout'] ?? '设置'/'退出登录'`
4. **判负登记**（docs/client.md §5.6 + C4_I18N_EXEMPT）：无需机制 8 组件（原因/推翻条件——locale 包面料进下一阶段）

**验收**：C4-① 12 → **0** · tsc 0 · test:client 452 · showcase 328 · 行为恒等（fallback 相同）

### W2 —— CSS 死类甄别清理（51 → 0）

1. **CodeBlock `wf-hl-*`**：验证 tokenize 输出域（`wf-hl-${type}` 枚举）→ 登记 C4_CLASS_DYNAMIC（活——豁免）
2. **其余 44 处逐一甄别**（每个文件 grep 变体拼接/动态形态——真死删 CSS 规则 + 注释登记；误报改豁免）
3. 修后 C4-② **51 → 0**（活豁免 + 真死删除后无损计数）

**验收**：C4-② 0 · dist CSS 体积只降不升 · 组件视觉零变化（死类不影响渲染）· showcase 328

### W3 —— 收尾

1. docs/client.md §5.6 红线表 +2（i18n 机制接线纪律（有机制必接线）· 死类红线（CSS 类必须有生成者））
2. AGENTS 快照（audit:all 十三线 · C4 基线）
3. 全量回归门：test:client + showcase + 场景 + server + shared + 平台 + audit:all **任何红 = 不 commit**
4. 计划归档（plan/plan.md §5——完成不物理保留）

## 判负记录（探针实证——全部可被推翻）

| 面 | 判负理由 | 推翻条件 |
| --- | --- | --- |
| CSS @media 断点接线 | media query 不支持 var()——639.98 字面量 + 注释单源锚定已是最优 | CSS 引擎支持 CSS 变量 media query（未来标准变更） |
| ImageCropper 双事件 | 两按钮各一 onClick（探针正则误报） | — |
| CSS 重复规则合并 | token 化后声明重复无害（维护单源在 token）——不合并是组件封装设计 | 出现 >20 处完全同规则且可抽公共类（需要视觉/体积实证） |
| i18n 无机制组件 8 个 | 每组件 <3 处 · locale 包面缺失 · 中文 fallback = 默认 | locale 包采购需求出现（第二消费者） |
| 受控面/非 wf- 类/颜色面 | 探针误报或体检健康 | — |
