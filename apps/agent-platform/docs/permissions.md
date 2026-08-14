# 权限模型（R4）— 角色能力矩阵

> **状态**：2026-12 建立——viewer 只读角色 + 关键写操作门禁已实施

## 角色定义

| 角色 | 层级 | 定位 |
|------|------|------|
| `owner` | 应用成员（_weifuwu_app_members） | 租户所有者：全部权限 + 计费/邀请/删除 |
| `admin` | 部门成员（department_members） | 部门管理员：部门级管理 + 审批 |
| `member` | 应用成员 | 普通成员：对话 + 使用已授权 Agent |
| `viewer` | 应用成员 | 只读：查看全部，禁止写操作（合规/老板看板角色） |

## 能力矩阵

| 操作 | owner | admin* | member | viewer |
|------|:-----:|:------:|:------:|:------:|
| 查看 Dashboard/Agent/部门/消息 | ✓ | ✓ | ✓ | ✓ |
| 发消息（部门对话） | ✓ | ✓ | ✓ | **✗** |
| 建 Agent / 建部门 | ✓ | ✓ | ✓ | **✗** |
| 部门成员管理（加/移除成员） | ✓ | ✓ | ✗ | ✗ |
| 审批 / 编辑 AI 草稿 | ✓ | ✓ | ✗ | ✗ |
| 生成邀请 / 开通 Pro / 调配额 | ✓ | ✗ | ✗ | ✗ |
| 平台管理（跨租户 /admin） | — | — | — | —（ADMIN_EMAILS 白名单独立） |

\* admin 是部门级——admin 的部门管理权限限于其所在部门；审批同限。

## 实现位置

- **`src/services/permissions.ts`**：`appRoleOf`（查应用角色）/ `requireWriter`（viewer 拒写，403）/ `requireDeptManager`（部门 admin 或 owner）
- **门禁挂载**（R4 已加）：
  - `POST /api/departments/:id/messages`（发消息）→ requireWriter
  - `POST /api/agents`（建 Agent）→ requireWriter
  - `POST /api/departments`（建部门）→ requireWriter
  - 成员管理/审批/草稿编辑 → requireDeptManager（既有 + 收敛）
  - 邀请/计划 → owner（框架 createInvite + admin 路由既有）
- **邀请角色**：Settings 邀请卡片可选"成员/只读"（框架 createInvite role 参数）

## 边界与待做（诚实登记）

- 数据可见性：viewer 可看全部部门消息（未做"仅自己参与部门"过滤——member 同样全可见，登记待做）
- 前端按钮显隐：viewer 的写按钮（发消息框/新建按钮）未按角色隐藏——后端 403 已拦住，前端体验待优化
- `member` 建 Agent 当前允许（矩阵 ✓）——若产品需要"仅 admin 可建"，调整 requireWriter 即可
- 平台管理员（ADMIN_EMAILS）与租户角色正交——跨租户管理独立

## 验证

- 门禁单测/实测：viewer 发消息/建 Agent → 403「只读成员无权执行此操作」
- 隔离审计：新增 SQL 均含 app_id 或登记豁免（test/tenant-isolation.test.ts）
