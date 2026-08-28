# agent-platform UI 功能固化为测试计划（PLAYWRIGHT + UISERVE——角色视角 × 真实交互）

> 触发：用户要求「把每个页面的功能从不同用户角色角度固化成测试」——
> 复盘教训：**冒烟（打开页面零错误）覆盖不了「点击才暴露」的 bug**：
> ① /deliverables 空态（页面零错误——renderFn 读到 files=9 但 shown=0——
> 工厂捕获旧引用——**只有等数据/看 DOM 才发现**）② 工作区文件下载 401
> （`<a href>` 在页面无错误——**点击才触发**）。
> **计划核心：每个页面 = 真实交互点击 × 角色视角断言——不是打开检查**。

---

## 一、范围盘点（19 页面 × 4 角色）

### 页面清单（ui/router.ts）
| 分组 | 页面 | 核心交互（点击才暴露的） |
| --- | --- | --- |
| 认证 | /login /register | 表单提交/错误提示/邀请 join |
| 工作台 | / (Workspace) | 项目卡片点击进 chat · 新建项目空间按钮 · 交付物卡片 |
| 交付物 | /deliverables | **文件列表渲染（空态回归）** · 打开/下载（401 回归）· 搜索 |
| 报表 | /reports | 统计加载（部门用量/成本）· 漏斗 |
| Agent | /agents · /agents/new · /agents/:id | 创建表单提交 · 删除确认 · 从模板创建 · 详情编辑 |
| 模板 | /templates | 模板列表 · 从模板创建 Agent |
| 部门 | /departments · /departments/new · /departments/:id | 创建部门 · 成员管理 · 删除 · 部门详情/文件/聊天 |
| 聊天 | /chat/new · /chat/:id | **发消息（@ 定向）** · 工具条展开 · 文件下载 · 审批流 |
| 审批 | /approvals | 批准/拒绝 · 保存修改草稿 |
| 沙盒 | /sandboxes | 状态 · 启动/停止/重启 · debug |
| 设置 | /settings | 邀请链接生成（角色）· BYOK 保存 · 审计列表 |
| 管理 | /admin | 概览（管理员专属——isAdminEmail 平台管理员） |

### 角色矩阵（permissions.ts 能力矩阵）
| 角色 | 来源 | 能力（测试断言面） |
| --- | --- | --- |
| **owner** | 注册即 owner | 全部：建部门/Agent/审批/邀请（role=member/viewer）/成员管理 |
| **admin** | 部门管理员（department_members.role='admin'） | 部门级：建 Agent/部门/审批/成员管理 |
| **member** | 应用成员（role='member'） | 对话/使用授权 Agent——**无管理（建部门 403/审批隐藏）** |
| **viewer** | 邀请（role='viewer'） | 只读——**发消息 403/写操作按钮禁用或隐形** |

---

## 二、测试基建增强（test/ui/shared.ts）

**B1 · 角色种子 helper**（owner→invite→register 全链路——API 驱动——非 SQL 直插）：
```ts
/** 创建指定角色的已登录用户（owner 邀请→被邀人注册 join——registerInApp） */
export async function seedRoleMember(base, owner, role: 'member'|'viewer'|'admin', deptId?): Promise<TenantAuth>
```
- member/viewer：`POST /api/auth/invite`（owner 调）→ 新用户 `POST /api/auth/register` + inviteToken → 自动成为成员
- admin：member 注册后 owner 调 `POST /api/departments/:id/members` 设 role='admin'（或建部门时加）
- **admin 的部门级**：部门成员 role 独立于应用 role（department_members）——测试需同时造

**B2 · 交互断言 helper**（点击才暴露的观察面）：
```ts
/** 点击元素后等待 DOM 变化（数据渲染/错误提示/导航——替代 sleep） */
export async function clickAndWait(page, selector, expectText?: string)
/** 断言写操作被禁（viewer：403 toast / 按钮 disabled / 不可见） */
export async function expectWritableDisabled(page, selector)
```

**B3 · 页面功能基类**（每页一个测试文件——数据种子 + 交互 + 角色断言）：
```ts
// 每页测试文件统一结构：
// 1. 数据种子（API 造数据——部门/Agent/消息/交付物）
// 2. owner 视角交互（每页核心功能——真实点击）
// 3. viewer 视角只读断言（写操作被禁——403/disabled/隐形）
// 4. member 视角能力边界（无管理功能）
```

---

## 三、波次执行计划

### Wave 1 · 基建 + 高危页（吸取教训的直接对象）
| 任务 | 内容 | 验收 |
| --- | --- | --- |
| B1/B2 helper | 角色种子 + 交互断言 helper | 单测绿（角色注入成功——API 断言 role） |
| **P1 deliverables** | 文件渲染（空态回归）+ 下载（401 回归）+ 搜索 + viewer 只读 | **现有 deliverables.test.ts 扩展**——下载点击断言 |
| **P2 chat** | 发消息（@）→ AI 回复渲染 → 工具条展开/失败状态 → 文件卡片下载 | **工具失败 red 标注（Wave1 修复回归）** |
| **P3 workspace** | 项目卡片 → chat 导航 · 交付物卡片 → deliverables · 新建按钮 | 导航链路断言 |

### Wave 2 · 管理页（owner/admin 视角 + member 边界）
| 任务 | 内容 | 验收 |
| --- | --- | --- |
| P4 agents | 创建表单（填写→提交→列表出现）· 删除确认 · 详情编辑 | 表单交互断言（**非仅渲染**）|
| P5 departments | 创建部门（选成员）→ 列表 · 删除 · 详情页文件 | 建删全链路 |
| P6 templates | 模板列表 → 从模板创建 Agent | 创建后跳 agent 详情 |
| P7 settings | 邀请链接生成（role=member/viewer 两种）· 角色 join 验证 | **角色种子全链路**（会员注册后进 chat 用）|
| P8 approvals | 审批流：AI 草稿 → 批准/拒绝 → 消息发布 | 需要 HITL agent + 消息种子 |

### Wave 3 · 角色权限矩阵（跨页）
| 任务 | 内容 | 验收 |
| --- | --- | --- |
| P9 viewer 只读 | 发消息 403 · 建 Agent/部门按钮禁用 · 审批隐藏 | **不做任何写操作**（试所有写入口）|
| P10 member 边界 | 建部门 403 · 审批隐藏 · 对话可用 | 能力边界精确 |
| P11 admin 管理 | 部门成员管理（加/删成员/设 admin）· 审批 | admin 部门级能力 |
| P12 reports/sandboxes/admin | 报表加载 · 沙盒操作（stop/start）· 平台管理员专属页 | admin 页仅 isAdminEmail 可见 |

### Wave 4 · 回归加固（防「点击才暴露」漏网）
| 任务 | 内容 |
| --- | --- |
| P13 全页交互扫描 | smoke 升级：每页**点一遍主要按钮**——console 零错误 + 无未捕获异常（**点击而非打开**）|
| P14 历史 bug 回归清单 | deliverables 空态 · 下载 401 · 工具失败标注 · 缓存毒化——**全部固化** |

---

## 四、测试文件规划（每页一文件——对齐 showcase 每组件一文件模式）

```
test/ui/
  shared.ts（增强：seedRoleMember/clickAndWait/expectWritableDisabled）
  smoke.test.ts（升级：点击扫描）
  pages.test.ts（现有基线保留）
  deliverables.test.ts（扩展：下载/搜索/viewer）    ← Wave 1
  chat.test.ts（消息/工具/审批链路）               ← Wave 1（核心）
  workspace.test.ts（导航/卡片）                   ← Wave 1
  agents.test.ts（创建/删除/详情）                 ← Wave 2
  departments.test.ts（建/删/详情）                ← Wave 2
  templates.test.ts（模板创建）                    ← Wave 2
  settings.test.ts（邀请/角色/BYOK）               ← Wave 2
  approvals.test.ts（审批流）                      ← Wave 2
  roles.test.ts（viewer/member/admin 矩阵——跨页） ← Wave 3
  reports-sandboxes-admin.test.ts                  ← Wave 3
```

每一个测试文件的结构（纪律）：
1. **种子**：API 造真实数据（部门/Agent/消息/文件——不 SQL 直插）
2. **owner 全交互**：每个按钮真实点击 + DOM 断言（等待而非 sleep）
3. **角色断言**：viewer/member 的写操作被禁（403 toast/disabled/隐形）
4. **零 console 错误**（页面红线——与场景层一致）

---

## 五、测试纪律（AGENTS 对齐）

- **timeout ≤ 10s**（clickAndWait 内部——超时即信号不无限等待）
- **等待变化而非固定 sleep**（waitForFunction/expect text——不睡）
- **角色种子 API 驱动**（不 SQL 直插——end-to-end 一致——API 形状漂移即失败）
- **每波收尾**：应用全量 + tsc 0（243 + 新增）
- **诚实裁剪**：
  - /admin 是**平台管理员**（isAdminEmail——与租户角色无关）——只测「非管理员 403/隐藏」
  - 真实 LLM 调用**只做最小**（chat 测试用 mock/或仅断言消息已发——不等待完整 AI 回复——测试不进真实 LLM 纪律）
  - AI 回复等待 >15s 的场景——**登记为慢测试**或裁剪（聊天流令牌/工具条——用短指令）

---

## 六、验收标准（计划完成定义）

1. **19 页面全覆盖**：每页 owner 视角至少 1 个真实交互断言（非仅渲染）
2. **角色矩阵覆盖**：viewer 只读 / member 边界 / admin 部门级——各至少 1 页断言
3. **历史 bug 固化**：deliverables 空态 / 下载 401 / 工具失败标注——全部进回归
4. **每页零 console 错误**（交互后——非仅打开）
5. **全量**：应用测试（243 + 新增~80-120 断言）全绿 · tsc 0
