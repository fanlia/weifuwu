# 2026-10 workflow 平台接入（agent-platform 垂直切片）

> **更新（2026-10）**：用户拍板存储/CRUD **纳入框架**（对齐 messager 模式）——
> `weifuwu/workflowSystem`（`_weifuwu_workflows`/`_weifuwu_workflow_runs` + migrate + routes + ctx.wf）；
> agent-platform 收编为薄消费方（只管 UI + 权限路由）。下述"服务层/REST"已由框架系统承接。

> 目标：引擎首个真实消费者——「定义 → 存储 → 执行 → 展示」全链打通。
> 原则：DSL 是枢纽真相（def_json 存储）；wfjs 是源码视图（审计/编辑历史——非执行依据）。

## 既有模式借力（探针实证）

| 模式 | 出处 | 复刻 |
|---|---|---|
| 表结构 | `db/schema.sql`（23 表——app_id + UUID + JSONB + NOW() 时间戳 + 跨边界不 FK） | workflows / workflow_runs |
| Route 注册 | `routes/agents.ts`（`register*Routes(protectedRoutes)` + `ctx.sql` tagged template + appId 隔离） | routes/workflows.ts |
| 后台任务 | server.ts `queue({ redis })` + `createVideoPollWorker`（QueueClient worker + visibilityTimeout） | workflow 执行 worker |
| UI 页面 | `ui/pages/Surveys.tsx` + `ui/router.ts`（`page(Comp)` SSR + client 同构） | pages/Workflows.tsx |
| 上下文 | `middleware/ctx.ts`（AppCtx：sql/auth/appId/ai/msg） | 直接用 |

## 1. 数据表（schema.sql 追加）

```sql
workflows:   id/app_id/name/description/def_json(JSONB 真相)/src_wfjs(TEXT 审计)/
             status(active/archived)/created_at/updated_at
workflow_runs: id/app_id/workflow_id(FK CASCADE)/trigger(manual)/status(queued→running→success/error)/
             args_json/result_json(RunResult)/error/started_at/finished_at/created_at
```

## 2. 服务层（src/services/workflow.ts）

- `compileAndSave(workflowInput)`：wfjs 源码 → compileWfjs（**v0 不注入 remoteFetch——远程导入编译错**——出网策略安全线）→ validate → 通过才入库（LLM 生成/用户编辑共用闸门）
- `executeWorkflowRun(workflow, args)`：`workflow({ store: redisStore, fetch })` → execute —— v0 同步执行（http 步骤自带 10s 超时；长任务由 runs 状态承载；queue worker 为 v1 升级点）
- `toRunResult`：RunResult → result_json（stepResults/status/error）

## 3. REST（routes/workflows.ts）

```
GET    /api/workflows                列表
POST   /api/workflows                { name, wfjs? } 或 { name, def }（compile+validate 门）
GET    /api/workflows/:id            详情（def + 元数据）
PUT    /api/workflows/:id            { wfjs? } 重编译
DELETE /api/workflows/:id
POST   /api/workflows/:id/runs       { args } → 执行 → result
GET    /api/workflows/:id/runs       执行历史
GET    /api/workflows/step-schemas   stepSchemas()（UI 表单视图元数据）
```

## 4. UI（ui/pages/Workflows.tsx + router `/workflows`）

- **列表页**：Table（name/status/updated_at）+ 新建（wfjs 文本输入 → 创建）
- **详情页**三视图 Tabs：
  - 流程：`<Pipeline nodes edges>`（workflowToDag）
  - 步骤：`<JsonSchemaForm schema>`（toJsonSchema——步骤参数/执行输入）
  - 源码：`<CodeEditor readOnly>`（toJs）
  - 操作：执行按钮 → POST run → 结果展示（Timeline 步骤状态 + stepResults）
  - 历史：runs 列表（状态/耗时/error）

## 5. 波次实录

- **A ✓（框架化重定位）**：存储/CRUD **纳入框架**（用户拍板对齐 messager）——`workflowSystem`（`src/server/workflows/`）——migrate/routes/ctx.wf/crud + 引擎公开面补全（compileWfjs/toJs 导出）——agent-platform 收编 3 行接线——HTTP 全链 7 项实测 + 658 server 全绿（df1e872f / 970962e6）
- **B ✓（UI）**：pages/Workflows.tsx（列表+新建 wfjs 门）+ WorkflowDetail.tsx（Tabs 三视图：Pipeline DAG / JsonSchemaForm / CodeEditor + 执行 + runs 历史）+ router/NAV/SPA 白名单——playwright 实测：列表→详情 DAG（子链折叠标签）→执行成功
  - 踩坑实证：Tabs API 是 `items[].content`（非 children）；SPA 路径白名单两处（生产/dev）需登记；mount 快照收集（路由须在 mount 前注册）；JSONB 反序列化层
- **C（剩余）**：路由层契约（HTTP fixture）+ docs §7 更新 + audit 回归

## 裁剪（诚实）

- v0 不做：workflow 编辑器（拖拽/画布）——只读三视图 + wfjs 文本创建/编辑；cron 定时触发；queue worker 异步化；远程导入（出网策略）；函数库管理页（functions 已存储——管理 UI v2）
