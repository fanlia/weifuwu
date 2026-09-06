# components 健康度体检（2027-09）

> 一句话目标：**回答「哪些组件需要优化」**——全组件健康度体检 + 小面波次 + 哨兵补面。
> 结论先行（探针实证——/tmp/probe-health*.mjs 不提交）：**组件库整体健康**——
> 死组件 0 · a11y 面健康（原生 button 主导 + Esc 等价机制）· 重复实现 0 ·
> tree-shake 有效（22 重组件特征 4 残留=真使用）· 样式面已清（C1/C2 双防线）。
> 仅存两个小面：**as any 34 处**（类型推进）· **哨兵缺口**（a11y/JS 体积无防回退线）。

## 现状探针（2027-09 读数——全组件 133 组件 / 159 源文件）

| 面 | 读数 | 判定 |
| --- | --- | --- |
| 死组件 | 全库 import + showcase 引用 + index 导出三面交叉——**0 个真死**（7 个 `*-utils` 为内部模块——各自组件引用——非死） | ✅ 健康 |
| 文件规模 | Editor/Editor.ts **1053 行**（115 函数）次大 SlideCanvas 426 · FilePreview 413 | ⚠️ 唯一超大型——但已 12 文件模块化（toolbar/html/dom/history 等）——核心逻辑聚拢 | 
| as any | **34 处 / 8 组件**（Anchor×3 · Icon×3 · CodeEditor×2 · Img×2 · StatCard×2 · BackTop/Breadcrumb/Button×1） | ⚠️ 小面（类型推进） |
| a11y | aria/role 组件 **89/159** · 键盘/焦点 **51/159** · div/span onClick 无键盘语义 **8 处**（ActionSheet/Drawer/HoverCard/Modal 遮罩类——usePopup Esc 等价机制已覆盖）· **图标哑按钮 0 处** | ✅ 健康（遮罩=判负——有 Esc 等价） |
| 重复实现 | debounce/loadMore/hasMore/pagination/fetch——各 ≤1 组件 | ✅ 无重复实现大面 |
| 测试 | 契约 60 文件 · 薄文件(<40 行) 1 | ✅ 健康 |
| JS 体积 | 组件源码 730KB（minify 前）· 平台产物 app.js **511KB**（minify+tree-shake 后）——22 重组件特征探针：4 残留（Chart/Timeline/SortableList/Slider）**全部真使用**（Reports/Dashboard/AgentDetail）——**tree-shake 有效** | ✅ 无膨胀（审判负体积专项） |
| 样式面 | C1（px 四桶 0/0/477/8）· C2（line-height 19 · 弹层 10 · 零消费 83）——全部登记制 | ✅ 已清 |

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| **W0** | **防线先行（C3 组件健康哨兵——不改业务代码）**：新审计 `scripts/audit-component-health.mjs` 三线——① **a11y 静态违规**（`h('div'/span/a,{onClick})` 无 role/tabIndex/onKeyDown/href——豁免登记：遮罩类（usePopup Esc 等价）· ② **as any 基线**（34——只降不升——平台 audit:any 同款机制组件面版）· ③ **JS 体积基线**（app.js 511KB + tree-shake 特征探针 4 真使用登记——防回退：新增残留特征=红）· 负控三线各红 · 挂 audit:all（八线→**十一线**） | 新审计绿（基线 34/511KB/8 处 div onClick 全部登记或豁免）· 负控全验 · 现有测试零回归 |
| **W1** | **as any 34 → 0**（8 组件逐处类型推进——Anchor/Icon 领先——平台 audit:any 同款手法：行类型派生 RowOf / 判别联合收窄——禁止 `as never` 逃逸——判负登记留档的除外） | as any 34 → **0**（C3 二线绿）· tsc 0 · 契约全绿 |
| **W2** | **a11y 微修 + 哨兵豁免定案**：8 处 div onClick 甄别——① 遮罩类（ActionSheet/Drawer/Modal——usePopup Esc 关闭=键盘等价）→ 哨兵豁免登记 ② 真修面（HoverCard wrap 等非遮罩 onClick——补 role/tabIndex/onKeyDown 或改原生 button）· 图标哑按钮 0（无面）· docs/client.md §5.6 红线表补 **a11y 行**（div 交互=违规——机制化） | C3 三线全绿（a11y 8 处全定案——豁免/修复）· showcase 328 全绿 · tsc 0 |
| **W3** | **收尾**：负控复验 · 全量回归门（契约/场景/showcase/server/shared/平台/audit 十一线）· AGENTS 快照更新 · 计划归档 | 五域+平台全绿 · audit exit 0 · 计划按 §5 归档 |

## 判负记录（探针实证——可被新论证推翻）

- **a11y 专项波次（大规模补 aria）**：不做——89/159 已覆盖 + 原生 button 主导（键盘语义自带）+ 图标哑按钮 0 + 遮罩类有 usePopup Esc 等价——收益 < 风险（组件 API 噪音）；推翻：WCAG 审计报告或真实用户可达性缺陷
- **Editor 1053 行拆分**：不做——已 12 文件模块化（toolbar/html/dom/history/diff 独立）——主文件是编辑器核心逻辑聚拢（命令/选区/渲染路由）——拆分=高风险低收益；推翻：Editor 新增第 N 个功能域（>1 新文件域时按域拆）
- **JS 体积专项（按需/split chunks/懒加载）**：不做——tree-shake 实证有效（22 重组件 18 被剔除·4 残留全真使用）——平台 511KB 无膨胀；推翻：minify 后产物增速 >20%/版本 或新增重依赖
- **重复实现收口（search/loadMore/pagination 组件化）**：不做——各 ≤1 消费者（单消费者=平台层/组件内聚——§4.1 判别）；推翻：第二消费者出现
- **死组件清理**：无死——不清理；推翻：三面交叉出现未引用组件

## 执行实录（边做边记）

| 波次 | commit | 结果 |
| --- | --- | --- |
| W0 | | **防线先行（C3 三线审计——未改业务代码）**：`scripts/audit-component-health.mjs`——① **a11y 静态违规**（div/span/a onClick 无键盘语义——豁免登记遮罩类（usePopup Esc 等价）· **待修登记 4 处**（Modal content 点击 · Popconfirm wrap · **StatCard clickable div**（卡片可点击无 role）· **Tooltip wrap 缺键盘显示面**——W2 修）· ② **as any 基线 34**（只降不升——平台 audit:any 组件面版）· ③ **JS 体积 511KB + tree-shake 特征探针**（22 重组件——4 真使用登记——残留 0——**tree-shake 有效实证**）。**探针修正**：`h('div'` 单引号形态盲区（双引号 h() 漏检）+ showcase 引用检测 walk 数组 endsWith 恒 false（死组件 145 误报根因）。**负控三线全验**（双引号 div onClick · as any 35 > 34 各红）。**audit:all 八线→十一线**（+health）· 全绿。 |

---

## 波次交付实录（W3 收尾——2027-xx）

| 波次 | commit | 交付 |
| --- | --- | --- |
| W0 | `9845e1fa` | C3 三线审计（a11y/as any 34/app.js 511KB+tree-shake）+ audit:all 十一线 |
| W1 | `ad196b60` | **as any 34 → 0**（i18n 类型链清理 ×12 + 零散最小接口 ×9） |
| W2 | `e4f18fd3` | **a11y 键盘可达**（Dropdown/Popover trigger 三件套 · FileUpload zone · VirtualTable row + 豁免 8 类 + 审计平衡扫描修正） |
| W3 | （本 commit） | docs §5.6 红线表 +5 · AGENTS 快照（十一线/C3 基线）· 全量回归门 exit 0 |

**终态判定**：大优化面全判负（a11y 专项/Editor 拆分/JS 体积/重复实现/死组件）——唯一动手术面 = as any（清 0）+ a11y 键盘可达（3 处真修 + 8 豁免定案）。医嘱：组件面 0 死代码/as any 已锁死——下次体检窗口 = 新组件入库时（C3 自动化守卫已就位）。

**归档**：计划完成——按 plan/plan.md §5 不物理保留（本文件删除——历史由 git log 承接——本 commit 前的文件内容即计划本体）。
