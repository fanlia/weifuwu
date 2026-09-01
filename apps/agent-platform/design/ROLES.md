# ROLES · Agent Platform 角色模型（产品单一事实源）

> 2027-10 固化（角色走查 + 代码/DB 实证——非臆想）。本文档是角色体系的
> **单一事实源**：产品/开发/测试改角色相关逻辑前先读这里；改完必须同步
> §7 测试地图的对应防线（测试即文档——矩阵漂移即测试红）。
>
> 核心设计：**三层权限轴各自独立**——一个人在平台/租户/部门三层可以有
> 不同身份；AI Agent 是第五类「员工」（非人类参与者）。

---

## 1. 角色体系全景

```
平台层（跨租户）    系统管理员（ADMIN_EMAILS env 白名单）
                      └─ 运营所有租户/企业（计费/开通/停启）
租户层（_weifuwu_app_members.role）
                      owner → (admin*) → member → viewer
                        └─ 部门层（department_members.role）
                            manager / admin / member
参与者（agents.type） AI Agent / 部门 Agent / 知识库机器人 / Webhook
```

**角色正交关系（易混澄清）**：
- 租户 owner ≠ 系统管理员（租户 owner 的 `isAdmin=false`——两套体系互不继承）
- 部门 admin 是「部门级授权」，应用 role 仍可 member（`seedDeptAdmin` 先例）
- DB 实际分布（demo 库 2027-10）：app_members = owner 2638 / member 807 / viewer 1155；
  department_members = manager 725 / admin 710 / member 173

---

## 2. 人类角色详表

### 2.1 系统管理员（平台运营者）

| 项 | 内容 |
| --- | --- |
| 身份判定 | `ADMIN_EMAILS` env 白名单（admin.ts L4「简单安全，不引入角色表」） |
| 能力面 | `/api/admin/*`：平台概览、**企业开通**（建企业→建租户应用）、**租户套餐**（free/pro、月配额、试用期）、**停启租户**（G2 全租户 403，管理面豁免）、沙盒容量治理 |
| 商业化联动 | 套餐/试用期 → 付费墙（`planBlockReason` 拦 AI 回复——「试用已到期，请联系管理员开通 Pro」） |
| 核心旅程 | 租户管理页（/admin）→ 企业开通 → 设套餐 → 停启治理 |
| 测试锚点 | `test/ui/admin-journey.test.ts`（6 例——正向能力 + 付费墙联动 + 停用恢复） |

### 2.2 租户 owner / admin（团队创建者与管理者）

| 项 | 内容 |
| --- | --- |
| 身份判定 | 注册即建租户（owner）；app 级 admin 代码承认但无铸造入口（见 §6 含混点 1） |
| 能力面 | member 全部 + 建/删部门（组织树/子部门）、添加 AI 成员（prompt/工具/技能/知识库）、邀请成员（member/viewer，7 天）、**审批**（HITL：AI 草稿/产物批准发布）、运营报表、经理任命 |
| 核心旅程 | 工作台审批 CTA → 审批页四操作 → 批准发布（AI 产出经人工确认才对外） |
| 测试锚点 | `roles-journey` owner 旅程 · `approvals.test` · `departments.test` |

### 2.3 member（普通成员）——**产品日常主用户**

| 项 | 内容 |
| --- | --- |
| 身份判定 | 邀请（role=member）→ join |
| 能力面 | 聊天（单聊/群聊/@定向/附件）、**@AI 派活**（触发工具：文件读写/命令/知识库检索/抓网页）、建 AI Agent（writer 语义——合法）、上传资料、**下载交付物**、断点续跑/重新生成 |
| 核心旅程 | **「放文件、@AI 干活、拿交付物」**——产品核心主张（走查实测 <1 分钟闭环） |
| 边界 | 建部门 403 / 邀请 403（Owner only）/ 审批操作 403（requireDeptManager） |
| 测试锚点 | `roles-journey` member 旅程 · `roles.test` 边界 |

### 2.4 viewer（只读观察者）

| 项 | 内容 |
| --- | --- |
| 身份判定 | 邀请（role=viewer）→ join |
| 能力面 | 看消息/看交付物/**下载交付物**（只读 ≠ 拿不到结果——设计意图）、看报表；**全写操作 403**（发消息/建 Agent/建部门/邀请——`requireWriter`） |
| 核心旅程 | 部门消息可读 → 交付物可下载（跟进不添乱） |
| 已知缺口 | 落地零引导 + 403 原因不透出（走查 P0——`roles-journey` viewer 旅程「现状锁定」注释处，改进落地时同步更新断言） |
| 测试锚点 | `roles.test` viewer 矩阵 · `roles-journey` viewer 旅程 · `chat/agents/departments/deliverables` 散点 |

### 2.5 部门层变体（同一人不同部门可不同身份）

| 部门角色 | 功能差异 | 测试锚点 |
| --- | --- | --- |
| `manager` 部门经理 | 建部门时任命——组织层级标识（数量最多的部门角色） | — |
| `admin` 部门管理员 | **部门成员管理** + **部门内审批**（`requireDeptManager`：owner/app-admin/部门 admin 三方放行） | `roles.test` 部门 admin 用例 · `approvals.test` |
| `member` | 普通部门协作 | — |

---

## 3. 非人类参与者（agents.type——本产品特色）

| 类型 | demo 分布 | 功能 | 备注 |
| --- | --- | --- | --- |
| **AI Agent**（`ai`） | 381 | 干活主体：LLM 对话 + 工具执行（文件/命令/KB 检索/抓网页）+ 沙盒 + 产物落工作区 + HITL 草稿；有记忆（群共识/个人）；可互派任务（语义路由「任务派给 X」） | 测试用 `/api/test/wf` 注入确定性事件（WF_TEST_HOOKS=1） |
| **部门 Agent**（`department`） | 754 | 组织节点实体化——子部门聚合层，任务可路由到「部门」 | 编排特性 |
| **知识库机器人**（`knowledge_base`） | 1 | 只检索不调 LLM——@KB 名 → 向量检索直接回（零 token 秒答） | answer-cache 之外的零成本应答面 |
| **Webhook**（`webhook`） | 1 | 外部系统接入：入站 webhook 触发 AI 回复 + 出站回推（签名 + SSRF 防护） | 系统集成面 |

---

## 4. 功能面总览（按导航分组 × 主要消费者）

| 组 | 功能 | 主要消费者 |
| --- | --- | --- |
| 工作台 | 总览（空间卡片/审批 CTA/交付物速览） | 全员 |
| 工作台 | 聊天（流式/@定向/附件/工具卡/HITL 审批卡/文件卡/答案缓存/断点续跑/呼吸灯） | member+（viewer 只读） |
| 工作台 | 审批待办（AI 草稿/产物批准发布） | owner/admin/部门 admin |
| 工作台 | 交付物中心（跨部门聚合/带鉴权下载） | 全员（viewer 只读） |
| 管理 | Agent（模板市场 9 模板/技能/知识库/webhook） | owner/member/admin |
| 管理 | 沙盒（持久化生命周期/容量池） | owner/admin |
| 管理 | 部门（组织树/子部门/经理/成员/共享工作区） | owner/admin |
| 管理 | 运营报表（部门用量/tokens 成本） | 全员可读（走查实证） |
| 平台 | 租户管理（企业/套餐/停启） | 系统管理员 |
| 横切 | 问卷 campaign（AI 代填问卷）/ 任务编排 / SSO 登录 | 特定场景 |

---

## 5. 权限矩阵（服务端防线——测试断言的口径）

| 操作 | 系统管理员 | owner | member | viewer |
| --- | --- | --- | --- | --- |
| 发消息（部门内） | — | 201 | 201 | 403 只读 |
| 建 AI Agent | — | 201 | 201（writer） | 403 只读 |
| 建/删部门 | — | 200 | 403 | 403 |
| 邀请成员 | — | 200 | 403 Owner only | 403 Owner only |
| 审批（批准/拒绝） | — | 200 | 403 requireDeptManager | 403 |
| 下载交付物 | — | 200 | 200 | **200（只读可下载——设计意图）** |
| 运营报表 | 200 | 200 | 200 | 200 |
| 租户套餐/停启 | 200 | 403 需管理员 | 403 | 403 |
| 停用后访问租户 | 豁免（可恢复） | 403 该团队已被停用 | 403 | 403 |

---

## 6. 设计观察（含混点与待改进——改动时先读）

1. **app 级 `admin` 是幽灵角色**：代码承认（auth.ts 多处 `role !== 'owner' && role !== 'admin'`），
   但 invite 白名单只产 member/viewer，DB 分布 **0 个**。建议：诚实裁剪——删分支或补铸造入口（当前倾向裁剪：租户级 owner + 部门级 admin 已覆盖管理场景）。
2. **「管理」导航组对 member/viewer 全量可见**：API 防线在（403），前端零遮蔽——按钮可点、点了失败。
   走查 P0 已登记（`roles-journey` viewer 旅程「现状锁定」处为改进落点）。
3. **owner 占比异常**（DB：owner 2638 vs member 807）：「注册即建租户」模型让每个新用户都是 owner。
   真实 SaaS 场景 member 应占绝对多数——邀请链路（owner → member/viewer）是规模化关键路径。
4. **角色样本勘误（走查教训）**：`user@demo.com`（李华）在 `_weifuwu_app_members` 实际是 **owner**——
   用演示账号测「member 视角」必须走 `seedRoleMember` 造号（API 全链路：邀请 → join → 角色响应双验证），
   不能凭邮箱猜角色。

---

## 7. 测试地图（改角色逻辑必同步）

| 测试文件 | 锁定面 | 角色 |
| --- | --- | --- |
| `test/ui/admin-journey.test.ts` | 平台运营线（身份正交/读面/企业开通/套餐↔付费墙/停启恢复/UI 冒烟） | 系统管理员 |
| `test/ui/roles-journey.test.ts` | 价值旅程（owner 审批 HITL / member 派活闭环 / viewer 只读现状锁定） | owner/member/viewer |
| `test/ui/roles.test.ts` | 能力矩阵（viewer 全写 403 / member 边界 / 部门 admin 提权 / 邀请 Owner only / 报表读面） | 全部租户角色 |
| `test/ui/approvals.test.ts` | 审批权限（member ✗——requireDeptManager） | member/admin |
| `test/ui/agents.test.ts` | viewer 建 Agent 403 | viewer |
| `test/ui/chat.test.ts` | viewer 发消息 403（requireWriter 红线） | viewer |
| `test/ui/departments.test.ts` | member 建部门 403 | member |
| `test/ui/deliverables.test.ts` | viewer 只读无写入口 + 下载 200 | viewer |
| `test/ui/regression.test.ts` | invite role 修复回归 / viewer 建部按钮禁用 / 非管理员概览 403 | 多角色 |
| `test/ui/settings.test.ts` | 邀请全链路（owner→member/viewer join 角色生效） | owner |

**维护纪律**：改权限判定（permissions.ts / requireWriter / requireDeptManager / ADMIN_EMAILS）或
新增角色 → ① 先跑 §7 全部文件 ② 矩阵口径变化 → 同步 §5 表 ③ 新角色 → 新增旅程文件（按
roles-journey 三段式：能力面 + 价值旅程 + 现状锁定）。
