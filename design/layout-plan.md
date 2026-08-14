# weifuwu/layout 优化计划（2026-12）

> ## ✅ 已归档（2026-12）——全部实施
> 58→66 原语 / 136→156 工具类：wf-self-*（align-self 4 个）、wf-items-*
> （--wf-align 4 个）、wf-ml/mr-*（xs~2xl+auto+none 共 16 个）、wf-mt/mb/mx-none、
> wf-text-danger、wf-flex@sm/@md。文档计数 8 文件同步（style-audit L0）。
> 消费侧原缺口类全部生效（agent-platform 8 处使用——无需清理）。

> 现状：58 布局原语 + 136 工具类 + 167 Token（1534 行 CSS）。
> 驱动：消费侧（agent-platform/components）使用的类 vs layout 定义——差异审计。

## 缺口清单（消费侧使用但 layout 未定义）

| # | 类 | 消费侧 | 类型 |
|---|---|---|---|
| P1-1 | `wf-self-center` / `wf-self-end` | agent-platform 2 处 | **align-self 工具缺失**（文档只有 align-items） |
| P1-2 | `wf-ml-*` 系列 | 1 处 | **间距不对称**（有 mt/mb/mx 无 ml/mr） |
| P1-3 | `wf-mt-none` 等 none 变体 | 1 处 | 间距 none 缺失（只有 m-0） |
| P1-4 | `wf-text-danger` | 1 处 | 语义文字色工具缺失 |
| P1-5 | `wf-flex@sm` / `@md` | 1 处 | **断点变体不一致**（flex 只有 @lg；row 有 @sm/md/lg） |
| P1-6 | `wf-items-center` / `wf-items-end` | 2 处残留 | 无效类（--wf-align 机制无工具类）——补类 + 清消费侧 |

## 实施方案

1. **_spacing.css**：补 `wf-ml-*`（xs~2xl + auto）+ `wf-mt-none/mb-none/ml-none/mr-none/mx-none`
2. **新增 _align-self.css**（或并入 _stretch.css）：`wf-self-start/center/end/stretch`（align-self）
3. **_row.css**：补 `wf-items-start/center/end/stretch`（设 `--wf-align`——与 wf-row 机制一致，替代 wf-top/bottom 语义的 items 命名）
4. **_text.css**：补 `wf-text-danger`（--wf-color-error-text——语义文字色）
5. **_flex.css**：补 `wf-flex@sm` / `wf-flex@md`（与 row 断点一致）
6. **消费侧清理**：agent-platform `wf-items-center/end` → 新类；`wf-mt-none`/`wf-ml-xs` 保持（补类后生效）
7. **文档同步**：docs/layout.md 原语/工具类计数 + 新类条目（style-audit L0 单一事实源强制）

## 验收

- style-audit 45 绿（计数同步）
- 消费侧无"使用未定义类"（审计脚本归零）
- 浏览器/组件测试不破
