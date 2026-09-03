# workflow 引擎（2026-09-03）

> 框架声明式执行引擎：WorkflowDef（触发 + 线性步骤链）→ 确定性执行（ctx 数据流 + 短路 + edge 去重 + dry-run）。
> 动机：任何产品都需要"定时/事件 → 确定性步骤链"能力；agent-platform 是第一个消费者（对话式生成 + 多租户挂靠为其第二阶段）。框架已有 queue/scheduler/ai/email——引擎只做"给定定义执行并返回逐步结果"，不发明调度装配。

## 现状探针（先读数）

- `src/server/` 无 workflow 模块（grep 0 命中）；agent-platform 的 orchestration 为 LLM 动态规划（agent-runner），非声明式执行器——不重叠，互补（agent 建造 / workflow 执行）
- 可复用：scheduler.cron（HASH 持久化、重启恢复）/ queue worker（retry/DLQ）/ ai()/email()（模块即客户端，worker 直调）
- 表达式求值器 + edge 状态机为**引擎唯一新核心逻辑**——纯函数设计，契约测试 + fuzz 对账

## 语义红线（写进 docs/server.md）

1. 短路：if 不通过 → 后续不执行，status=`skipped`（非错误）
2. edge：假→真放行一次；真持续静默；变假解除武装；at-least-once 重投窗口最多重复一次（SET NX 抢占，不引锁）
3. dry-run：副作用步骤打桩 `{dry:true}`；http 真跑（用户要看数据）
4. 表达式安全：无 eval/无函数调用/无算术——v1 = path + `==`/`!= null`/`exists`/`&&`/`||`/`!` + `{{}}` 插值
5. ai 步骤无 client → 报明确错误（不静默跳过）
6. 每步输出统一 `{ ok, data?, error? }` 落 `steps.<id>`

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W1 | contracts + expression（parse/compile/eval/interpolate） | 契约测试 + fuzz 对账（AST→源码→编译→求值 vs 参考求值器） |
| W2 | validate + 内置步骤（http/template/log）+ runner（短路/dry/ctx） | 契约：固定步骤链 → 断言 ctx/RunResult（全部内存 fixture，零网络） |
| W3 | if + edge 状态机（redis 适配）+ ai/email 适配器 | 契约：edge 四态（首次/静默/解除/再触发）+ 降级路径 |
| W4 | exports（./workflow）+ docs/server.md + 回归门 | test:server 全绿 + tsc 0 错 + audit 七线 exit 0 |

## 判负记录（可被新论证推翻）

- 不做 DAG/分支/循环/子 workflow（结构化可编程为 v2 候选；forEach 出现消费证据再立）——推翻条件：平台真实场景撞墙
- 不做帧内调度装配（cron/queue 由消费方组合）——推翻条件：出现重复装配模式
- 框架不提供 REST/UI/对话生成（平台第二阶段）——推翻条件：第二个消费方出现

## 执行实录（边做边记）

- **W1 完成（2026-09-03）**：contracts.ts（引擎类型单一来源）+ expression.ts（手写递归下降——零依赖）+ expression.test.ts。
  - 语义定版（测试锁定）：宽松 `==`（'200'==200）、exists=值!==undefined（JSON null 存在）、裸值布尔语境=「存在且非空」（0→true）、逻辑只产 boolean、字符串支持单/双引号+\\/'/n/t 转义，无效转义报错
  - fuzz 对账：AST→toSrc→parse→求值 vs 参考求值器——300 样本×5 种子 1500 对全等价
  - 实测：23 测试 pass / tsc 0 错 / 无外部依赖（node strip-only 拒绝 parameter properties——已改显式字段）
- **W4 完成（2026-09-03）**：exports（package.json `./workflow` 子路径 + build.mjs 独立 bundle——零运行时外部依赖）+ docs/server.md §7 + 回归门。
  - 实测：test:server 568 pass（含 workflow 46）/ audit 七线全绿 / tsc 0 错 / dist 子路径 import 验证通过
  - 探针重定位：无。W1–W4 全部按计划交付；引擎已具备 runWorkflow 全语义
- **待第二批（平台接入——独立计划）**：agent-platform workflows/runs 表 + REST + queue/scheduler 接线 + 对话生成三 tool + 预览/确认 UI + 问诊
