# USERSYSTEM-V3 —— 系统域定案（_builtin = 系统容器·四层角色跨域复用）

> 定案：不引入 sysadmin——统一四层角色（owner/admin/member/viewer），
> 层级决定权力，域（appId）决定语义。系统管理员 = `_builtin` 应用的
> owner（超级管理员·唯一）/ admin（系统管理员·多人）。

## 状态：完成

| 项 | 内容 |
| --- | --- |
| 角色定案 | owner（1·最高——应用所有者 / `_builtin`=超级管理员）· admin（N·委派——应用管理员 / `_builtin`=系统管理员）· member（注册用户）· viewer（**显式委派**只读——方案 A：匿名=无角色） |
| 框架 | `BUILTIN_APP_ID` 导出 · registerWithApp **不再自动挂** `_builtin` 成员（系统域纯净）· addMember 系统域只收 owner/admin · createInvite 系统域 403（任命制）· **seedBuiltinOwners(emails)**（幂等：首邮箱 owner·余 admin·账号缺失自动建无密码——ADMIN_EMAILS 引导） |
| 平台 | admin.ts 常驻判定 ADMIN_EMAILS → **系统域判定**（ctx.session appId+role——零查库）· server.ts 启动 seed（ADMIN_EMAILS → _builtin 任命）· `isSystemAdmin(ctx)` 导出 |
| 契约 | seed 幂等/owner 唯一 · 系统域 addMember member/viewer 403 · _builtin 邀请 403 · 注册不挂 _builtin（41 契约） |
| 回归 | 框架 server 740/740 · 平台 449/449 · tsc 0 · build ✓ |

## 关键设计决策

- **不新增 sysadmin 角色**——一套四色跨域复用（判定 = appId + role 组合）
- **viewer=匿名**落点采用方案 A（显式委派只读）——匿名访问面由应用白名单路由决定（登录/公开页），不建模为角色
- **ADMIN_EMAILS 降级为引导**（seed 一次性）——常驻鉴权全走系统域（token payload——零查库零 env 依赖）
- **_builtin 无普通用户**（member/viewer 无意义——系统域只装 owner/admin）
- 登录闭环：管理员 = 已注册账号（密码）→ `apps/_builtin/login` 得系统域 token → 前端 Admin 导航

## 诚实边界

- 初始管理员必须账号已存在（seed 可建无密码账号——但密码登录需预建/IdP）——平台 seed.mjs 预置 admin@demo.com
- `_builtin` 的成员管理 UI 未建（任命走 addMember API/契约——管理界面后续）
- 前端 Admin 导航仍走 `/api/admin/me`（后端判定面切换——前端零改动）
