# agent-platform 优化计划（2026-08 第二波）

> 现状基线（诊断完成——2026-08）：server 1700 行 / src 9.2k / ui 5.4k——
> 171 测试 **4 红**；tsc **75 错误**；build script **断链**（ui/main.tsx 已改名
> v3-main.tsx——esbuild 入口解析失败）；根目录 20+ 计划文档碎片。

## 诊断结论（先修根因——非表面）

| # | 失败/缺口 | 根因（已定位） | 等级 |
| --- | --- | --- | --- |
| F1 | 并发 chunk 测试红 | **agent-runner.ts emit 拦截器 token 降频提前 return**——`if (lastTokenText !== '') return` 跳出整个 emit——跳过 onChunk/fullContent 累积 → DB 只存首个 token（`'今天是'`）——**刷新后 AI 回复截断——生产级 bug**（WS 前端完整但持久化截断） | **P0** |
| F2 | SQL 隔离审计红 | 新增 SQL 未按 app_id 隔离（测试登记检测——跨租户泄漏风险）——执行时定位具体语句 | **P0** |
| F3 | ai.test.ts 加载失败 | 陈旧 import `src/ai/sse.ts`（框架 ai() 迁移后文件删除——测试未跟进）——按新意图重写（ctx.ai 注入契约）或裁剪 | P0 |
| F4 | T-M5-2 池内存预算 | docker 依赖测试——驱逐逻辑未生效（A 未 terminated）——执行时复现定位 | P0 |
| B1 | `npm run build` | script 引用 `ui/main.tsx`——实际入口 `ui/v3-main.tsx`（改名后未同步）——**构建断路** | P1 |
| T1 | tsc 75 错误 | UI 层 any 泛滥——Chat.tsx 24 / FilesSection 13 / AgentDetail 10（最大户） | P2 |
| D1 | 文档碎片 | 根目录 20+ PLAN/RESULTS.md（大多完成态）——归档统一 | P3 |

## 执行顺序

### P0 — 正确性（红测试清零——一项一 commit）
1. **F1 修复**：agent-runner token 降频改为「只跳过 aiEmit——业务回调必须继续」
   （fullContent/onChunk/DB 串行链完整——降频意图=AI 事件流不刷屏——不牺牲持久化）
   ——services.test.ts 锁定 + agent-runner 全测试回归
2. **F2 隔离**：定位未隔离 SQL → 补 app_id 条件（或登记豁免+理由）
3. **F3 ai.test.ts**：按新框架契约重写（ctx.ai.embed/agent 注入验证——agent-platform
   实际用到的面：embed + agent stream）——陈旧断言删除
4. **F4 T-M5-2**：复现（docker 环境）——驱逐条件/预算判定修正——锁测试

### P1 — 构建断链
5. **B1**：package.json build script → `ui/v3-main.tsx` + esbuild 产物加载验证
   （冒烟：dist/app.js 注入页面——点击导航无报错）

### P2 — 类型清零（75 → 0）
6. **T1-Chat**（24）：chat 消息/工具卡片状态类型化（ui/lib/types.ts 已有实体类型——
   接入即可——`Record<string, any>` → 判别联合）
7. **T1-FilesSection**（13）：`FileItem[]` 类型化（unknown 数组）
8. **T1-其余**（38）：AppLayout props 接口 / AgentDetail / Settings / DepartmentDetail …
9. 复跑 tsc → **0 错误红线**（agent-platform 也挂语义审计纪律——与根仓库一致）

### P3 — 运行时基线
10. 全量测试（177+）+ playwright 冒烟 18 页（登录 → 建 Agent → 聊天流→ 沙盒页）
11. 框架对齐：workspace 源（v0.87.0 同步开发模式）——ui：ai 事件三端通验证

### P4 — 文档归档
12. 根目录完成态 PLAN/RESULTS → `docs/archive/`（保留可检索——根目录只留 README/
    IDEA.md/OPTIMIZE-PLAN.md（活文档））

## 验收
- 测试 4 红 → 0 红（全量）
- `npm run build` 通过 + dist 可加载
- tsc 0 错误
- 18 页冒烟零 console.error（dev 审计——沿用根仓库 audit-showcase 模式）
