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
- **W5a 完成（2026-09-03）**：表达式升级为 **JS 语义子集**（用户决策：LLM 对 JS 语义直觉 100% 准确；自造假值表会让 LLM 生成错码）。
  - 新增：算术（严格数字防 '1'+1='11'）/大小比较/`[*]` 投影（flat 1 展平）/.length/逻辑返回操作数/JS truthy 布尔语境/**裁剪 exists**（`!= null` 等价）
  - 两处安全偏差（文档化）：严格算术 + 非有限结果报错
  - fuzz 对账升级：值+错误双对账 400×5
- **W5b 完成**：compileWfjs 编译器——受限 JS 子集→DSL。
  - 语法：const/let/赋值/++//= //if(else)/while/for-of/return/内置调用/模板串（await/async 接受忽略）；静态检查：未声明/const 重赋值/重名/循环变量遮蔽/内置名冲突/裸块/链式赋值/
  - 绑定映射：步骤（data 解包 steps.<id>.data）/变量（vars.<name>）/循环（loop.item）
  - 实测：604 server 测试全绿（wfjs 26 + 语义升级后 82 workflow 契约）
- **W6a 完成（JS 对齐批次——LLM 直觉 100% 准确的硬理由）**：表达式层逐字对齐 JS。
  - `===`/`!==` 严格比较（与宽松 == 并存）· 三元 ?:（惰性）· **std 纯函数表达式内调用**（STD_FNS 注册表：sum/avg/clamp/count/pick/upper/lower/join/split——fns 参数贯穿 compile/evaluate/interpolate）
  - 复合赋值 *= /= %= · var 拒绝（提示 let/const）· 系统根（input/steps/vars/loop）路径放行
  - 副作用防线：内置名+对象参数两层挡住（http/email 表达式内语法层即报错）；checkExprCall 预留本地函数检查
- **W6b 完成（runner 重构——最大波次）**：递归子链执行器 + IR 类型对齐。
  - IR：set→**assign**{target,value} · forEach→**for**{items,step} · **stop 删除→return{}**（JS 顶层 return 终止语义——ASI 对齐）· if 分支（then/else 子链）
  - 语义迁移：if 截断→**分支**（无 else 跳过子链继续）· edge 静默→跳过子链**继续**（不再截断/status=success）· **skipped 状态删除**（RunStatus='success'|'error'）
  - ctx 扩展：vars 命名空间（assign 真跑）· loop 栈（嵌套恢复）· while/for maxIters 默认 1000 防死循环
  - **e2e 闭环**：compileWfjs → execute 真跑 5 景象（变量链/while 计数/for-of 模板/return 终止/库存监控 edge 发一次）——97 契约 + 619 server 全绿
- **W4 完成（2026-09-03）**：exports（package.json `./workflow` 子路径 + build.mjs 独立 bundle——零运行时外部依赖）+ docs/server.md §7 + 回归门。
  - 实测：test:server 568 pass（含 workflow 46）/ audit 七线全绿 / tsc 0 错 / dist 子路径 import 验证通过
  - 探针重定位：无。W1–W4 全部按计划交付；引擎已具备 runWorkflow 全语义
- **待第二批（平台接入——独立计划）**：agent-platform workflows/runs 表 + REST + queue/scheduler 接线 + 对话生成三 tool + 预览/确认 UI + 问诊
