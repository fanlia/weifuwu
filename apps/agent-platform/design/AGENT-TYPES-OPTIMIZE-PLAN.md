# AGENT-TYPES-OPTIMIZE-PLAN — 五类型全景优化计划

> 类型现状（探针 2026-09）：`agent_type` enum = **ai / user / webhook / knowledge_base /
> department**（五类）——历史 AGENT-TYPES-PLAN（4 类 × 15 项）已归档完成；
> 本轮覆盖新增的 **department**（2026-12 组织层级）与跨类型一致性。
> 方法：探针实证 → 波次闭环（红→绿契约测试）→ 判负登记。

## 1. 探针基线（起草时实测）

| 类型 | 创建 | 详情页 | 运行/路由 | 生命周期 | 现状 |
|---|---|---|---|---|---|
| ai | ✅ 向导+模板 | ✅ 全（skills/preview/logs/KB 绑定） | ✅ 自动+@ | ✅ 删除保护 | 完整 |
| user | 注册自动（UI 禁手动） | ✅ 只读+绑定账号 | 消息发送方 | ✅ 只读保护 | 完整 |
| webhook | ✅ 向导 | ✅ 端点/测试/日志 | ✅ 入站 API | ✅ | 完整 |
| knowledge_base | ✅ 向导 | ✅ chunk/检索/reindex | ✅ @ 定向 | ✅ | 完整 |
| **department** | ✅ 自动创建+向导 | ⚠️ **无专属视图** | ✅ @ + 消息中 `type IN ('ai','department')` | ⚠️ **孤儿泄漏** | **有缺口** |

**跨类型缺口（探针实证）**：

- **G1 经理提示词失步（主缺口）**：`departments.ts:178` 创建部门时把**成员名单快照**写死进
  department 经理的 `system_prompt`——此后部门增删 AI 成员（`agents.ts:291` PUT/POST 加入 ·
  `departments.ts:485` 移除）**没有任何刷新路径** → 经理不知道新成员（无法分派）/
  幻觉已移除成员。`agents.ts:173` 仅创建时写一次。
- **G2 孤儿部门经理**：部门删除（`departments.ts:391`）只删 departments 行 + 沙盒/工作目录，
  **不删 department 类型 agent** → /api/agents 列表残留孤儿（聊天路由已因成员行 FK
  cascade 不可见——列表脏数据 + 详情假经理）。
- **G3 department 详情零专属信息**：AgentDetail 无 department 分支——不显示代表部门/
  成员名单；**保存 body 只发通用四字段**（`if (type==='ai')` 特判）→ 创建时可配模型
  （hasAIConfig=true）但详情保存丢弃 model——**不对称假配置**。
- **G4 类型元数据双源**：`ui.tsx TYPE_META`（label/icon/color）vs `NewAgent.tsx AGENT_TYPES`
  （label/desc）——label/icon 重复两份，desc/color 各占一源。
- **G5 列表筛选白名单缺 department**：`agents.ts` type filter whitelist
  `['ai','user','webhook','knowledge_base']` 四类型——department 无法筛（当前 UI 无筛选，
  属埋雷）。

## 2. 波次（每波次独立可验收——4.2 纪律）

### W1 · G1 经理提示词同步（核心缺口）
- 提炼 `departments.ts:178` 提示词模板 → `refreshManagerPrompt(sql, appId, deptId)`（查经理
  agent + 成员名单 → UPDATE system_prompt；经理不存在则 no-op；`.catch` 容错不阻断主流程）
- 挂接点：`agents.ts` POST/PUT 部门成员变更（含 department_id 设置/变更）· `departments.ts`
  移除成员（DELETE member）
- **验收（契约 API 测试——红→绿）**：建部门 → 加 AI 成员 → 经理 system_prompt 含新成员名；
  移除成员 → 不含；刷新幂等（两次刷新结果一致）；成员变更失败不影响主流程

### W2 · G2 部门生命周期——孤儿歼灭
- 部门删除后补 `DELETE FROM agents WHERE type='department' AND department_id=该部门 AND app_id=...`
  （经理是派生资源——部门亡经理亡；department_members 行已 FK cascade 自动清）
- **验收**：建部门 → 删部门 → /api/agents 列表零 department 孤儿（契约测试）

### W3 · G3 department 详情视图
- AgentDetail 加 department 面板：代表部门（名称 + 「部门」入口链接）· 成员名单（只读——
  department_members join agents）+ 模型编辑
- 保存 body：department 特判补发 `model`（与创建对称——**消灭假配置**）
- **验收**：UI 测试——部门经理详情渲染「代表部门 X」+ 成员名单；改模型保存后
  GET /api/agents/:id 断言 model 变更

### W4 · G4/G5 类型单源
- `ui/lib/types.ts` 定义单源 `TYPE_META`（label/icon/color/desc/creatable——五类型全覆盖）
  ——`ui.tsx` 与 `NewAgent.tsx` 消费同一源（删双击重复数组）
- agents.ts 筛选白名单补 department + **派生自单源常量**（或契约断言两端一致）
- **验收**：契约测试——客户端元数据键集 == DB enum 五类型（新增类型漏 UI = 测试红）；
  筛选带 department 参数返回经理

### W5 · 走查回归（批次门——4.5）
- 全量 API 41 + UI 36 + tsc 零错；五类型各创建/查看一遍冒烟（部门经理视角重点）
- 全绿才提交

## 3. 判负登记（不建清单）

| 候选 | 判负原因 | 翻案条件 |
|---|---|---|
| 类型独立表（每类一张） | 单表 + enum 判别列是正解——类型是行为变体非独立实体；拆分 = 查询复杂度剧增 | 某类型字段 ≥10 个且互不重叠时再议 |
| type×capability 能力矩阵仪表盘 | 无用户/证据场景 | 走查发现用户困惑「某类型能干什么」 |
| 经理提示词运行时动态注入 | 每消息拼名单 = 每消息一次 DB 查——静态快照 + 变更刷新已足够 | 成员频繁变动（≥1 次/天）且分派失效证据 |
| 历史四类型再锦上添花 | AGENT-TYPES-RESULTS 15 项已验证完整——无新证据 | 走查发现新缺口 |

## 4. 参考锚点

- 历史：`docs/archive/AGENT-TYPES-PLAN.md` / `AGENT-TYPES-RESULTS.md`（4 类已完成）
- 角色矩阵：`design/ROLES.md`（五类员工模型——department = 组织节点实体化）
- 测试基建：`test/ui/shared.ts`（真实 server + playwright）· API 契约 test/*.test.ts
