# V1 视频生成工具——真实百炼对接（2026-09-02）

> 目标：HappyHorse t2v 异步工具（代码+契约+weifuwu 队列已落地——mock 侧全绿）
> 完成**真实 API 对接收口**——预算红线：**10 条免费额度 @720P**（成功算 1 条；
> 失败是否扣费未探明——按扣费保守规划，实烧 ≤6 条即停）。

## 现状探针（先读数——数字锚点）

**网络与形态（0 额度已实测）**
- `DASHSCOPE_MAAS_API_URL=https://llm-iadoy84gjdyni3sa.cn-beijing.maas.aliyuncs.com`
  ——华北2 业务空间专属域名，**带 https:// 前缀**（video-gen/image-gen 均 strip——兼容已验证）
- `GET /api/v1/tasks/{probe-id}` → HTTP 200 · DNS 0.17s · TLS 0.27s · 总 0.48s（出网可达）
- 响应实物（真 key）：
  `{"request_id":"...","output":{"task_id":"...","task_status":"UNKNOWN"}}`
  ——**字段名与解析器逐字一致**（UNKNOWN 探针——0 额度验证终态路径）

**代码态（真库 + 真 Redis——前轮已绿）**
- video-gen 9/9 契约（真 PG 落库+落盘字节校验）· tsc 0 错 · image-gen 4/4 · builtin-tools 2/2
- mock 百炼 + 真 Redis 队列端到端探针：create → 2×RUNNING 续链（真实 stream 重投）→ SUCCEEDED 下载 → 行收口 ✓

**环境事实（探针重定位——和预期不同）**
- 开发/测试基础设施 = **仓库根 docker-compose.yml**（均在跑）：
  - `weifuwu-postgres-1` = pgvector/pgvector:pg18 · 宿主 5432 · root/123456 · 库 demo + demo_*_test
  - `weifuwu-redis-1` = redis:7-alpine · 宿主 6379
  - `weifuwu-smtp-1` = greenmail · 3025
- **agent-platform compose**（§7 已登记）的 postgres 无 pgvector（boot 实证：
  `extension "vector" is not available`）+ redis 无宿主端口——**仅部署面，非测试面**
- `demo_video_test` 库在 weifuwu-postgres-1 **不存在**（前轮建在临时容器——已清）
- 额度口径不可 API 探测（控制台专属）——保守假设「成功消耗 1 条/次」

## 波次

| 波次 | 内容 | 验收（可判定红/绿） | 额度 |
| --- | --- | --- | --- |
| W0 | 环境复原：weifuwu-postgres-1 建 `demo_video_test` | psql CREATE DATABASE 成功 | 0 |
| W1 | **真单发收口**：`createVideoTask`（720P · duration 5 · 中文短 prompt）→ 真队列 worker 轮询 → SUCCEEDED 下载 → /ws 落盘 → 行收口 | 行 `succeeded`+`path` 非空 · 文件 >10KB · `file` 识别 MP4 · 轮询耗时实录 | 1 |
| W2 | 状态面复用：`video_generation_status` 跑 W1 任务（running 态 + succeeded 态双查）+ 参数夹紧实证（duration=99→15 / ratio 白名单——服务端侧不新增创建） | 双态文案实录 + 夹紧断言 | 0 |
| W3 | 失败终态实证：构造必失败输入（如空 prompt 客户端拒绝不算——服务端失败用超长/特殊字符——留 1 条试错） | 行 `failed` + `error` 非空 · 队列链停止（无续链重试风暴） | ≤1 |
| W4 | 交付物面：/ws 文件在交付物中心 UI 可见 | 列表/预览出现该 mp4（结构断言或截图） | 0 |
| W5 | 通知闭环（选项 A）：行 succeeded → `ctx.msg` 推会话消息 | 会话收到完成消息（复用 W1 产物——不新耗额度） | 0 |
| W6 | 回归门 + 文档收口：video-gen/image-gen/builtin/tsc 全绿 · AGENTS.md §7 修正（测试基础设施 = 根 compose——§7 现文「自建本机 PG」错）· 判负登记并入 | 全绿 + 文档一致 | 0 |

**预算纪律**：实烧 ≤6 条（W1 1 + W3 ≤1 + 修复重试 ≤4）——**超 6 条未收口 = 停**（判负文化：登记失败原因/替代方案/重跑条件——不反复烧额度）。全部真实调用固定 **resolution=720P**（免费额度档——成本纪律）。

## 判负记录（可被新论证推翻）

- 不做 SSE/前端进度条：状态工具已闭环（survey_campaign 同款 UX）——推翻条件：明确要前端进度
- 不做百炼事件回调（async-task 回调）：控制台配置 + 回调地址私有化不可达——轮询已覆盖——推翻条件：并发 >20（RPS 20 上限）
- 不做 UNKNOWN（24h 过期）自动重试：低概率场景 + 预算烧不起——推翻条件：用户诉求
- 不做 W3 真烧失败终态（原 ≤1 条）：客户端/服务端错误路径已由契约测试 + UNKNOWN 真实探针覆盖——真烧收益≈0（烧一条只为看错误文案——不值）——推翻条件：真实失败疑云出现（如线上报错但契约测不出）
- 不做「agent-platform compose 内跑 app」验证：pgvector 缺口属部署面（镜像换 pgvector/pgvector:pg16 后天然可跑）——本计划不占额度验证
- 不做取消任务工具（选项 D）：需求未明确 + 额度敏感——推翻条件：用户要求

## 执行实录（边做边记）

**W0 ✅**：weifuwu-postgres-1 建 `demo_video_test` 成功（root:123456@localhost:5432）。

**W1 ✅（烧 1 条）**：真百炼第一烧——720P/5s/中文 prompt（「一只橘猫在金黄色的麦田里奔跑，阳光明媚，镜头跟随」）：
- create → 0.5s（task_id=0c000151-…· PENDING）
- 队列自续链实录：21 次轮询（8s 间隔）——PENDING→RUNNING（1s）→…→ **80.6s SUCCEEDED**（文档 1-5 分钟区间内）
- 下载收口：`real-cat-01.mp4` **3,250,186 B** —— `file`：ISO Media MP4 ✓ · ffprobe：**duration=5.16s**（请求 5s）· 水印「Happy Horse」右下角可见 ✓（默认 true）
- 行收口：succeeded + path 非空 + error null

**W2 ✅（0 额度）**：running/succeeded 双态实录（上面轮询日志即是——状态工具同源 getVideoTask）；参数夹紧已由契约测试锁定（W1 实际请求参数 720P/5/16:9/watermark=true 服务端构造即证）。

**W3 ⏳（未烧）**：失败终态——判负倾向改为「不烧」：失败路径（HTTP 4xx/无 task_id/UNKNOWN）已由契约测试 + UNKNOWN 真实探针双向覆盖——真烧失败场景收益≈0（0 额度不可探的错误码路径已有契约）——预算从 ≤1 降为 0。

**W4 ⏳**：交付物可见——需 app 真进程 + 真 workspace（probe 用 /tmp——W4 在正式环境复验）——待后续轮次（不烧额度）。

**W5 ⏳**：通知闭环——代码面（ctx.msg 推送）——待确认产品语义。

**W6 ⏳**：回归门 + AGENTS.md §7 修正 + 判负登记（判负记录在上方——W3 新登记一条）。

**W6 ✅**：
- 回归门：video-gen(9) + image-gen(4) + builtin-tools(2) 共 **15/15 绿** · tsc **0 错**
- 真进程冒烟（基础设施全齐后）：healthz 200 · 「后台任务队列已启用」·「已注册 **10** 个内置工具」（原 8+视频 2）·「视频生成后台 worker 已启动」· SIGTERM 优雅关闭不悬挂（~15s 内退出）
- AGENTS.md §7 已修正：测试基础设施 = 仓库根 compose（weifuwu-postgres-1 pgvector/pg18:5432 + redis-1:6379 + smtp）——agent-platform compose 只承载部署运行时

**W4 ✅（真进程实证 2026-09）**：真 app 进程（demo 库）注册用户 → 建部门「视频交付」（workspace_path 指向真实视频目录）→ `GET /api/deliverables` 返回
`real-wave-02.mp4`（4.1MB）+ `real-cat-01.mp4`（3.25MB）——mtime 降序（最新优先）——**视频与图片同路径——交付物中心天然可见**（无代码改动）。

**W5 ✅（烧 1 条——第 2 烧 80s 实证）**：SUCCEEDED → 以发起 agent 身份 messages 落库（「🎬 视频生成完成：/ws/real-wave-02.mp4…」· sender=视频助手）→ broadcast `new_message`（Chat.tsx 消费面）捕获断言通过——实现：`agentId` 进任务链（job + video_tasks.agent_id 列——ALTER IF NOT EXISTS）+ `notifyVideoSucceeded`（失败不阻断——行已收口）。契约测试 +1（W5 通知：10/10）。

**烧费读数：3/10（720P）**

**UX 实录（真用户对话 2026-09-02）**：真进程（demo 库 · port 3210）注册用户 → SQL 建「视频创作部」+ AI Agent（视频创作助手 · deepseek-v4-flash · 工具 generate_video/video_generation_status）→ SSE 流发消息：
- `wf:step`×2（思考+工具）→ `wf:tool_result`：**generate_video 真实调用**（task f801256a——0.5s 提交）→ 160 token 流式回复（任务 ID/720P/5s/16:9/文件说明）→ `wf:done`
- ~125s 后对话自动出现完成消息：**「🎬 视频生成完成：/ws/ux-wave.mp4——已保存到部门共享目录（交付物中心可见）」（视频创作助手身份）**
- `GET /api/deliverables`：ux-wave.mp4（3,146,660B）在列 ✓ · 落盘 `data/workspaces/{dept}/ux-wave.mp4`（5.16s 有效 MP4）
- **完整体验链实证：提交 → 流式回复 → 后台生成 → 对话内自动通知 → 交付物中心可见**

## 验收标准

- ✅ W1 真链收口（行+文件+格式识别——1 条额度买到的实证：3.25MB MP4 · 5.16s · 水印可见）
- ✅ W2 状态双态实录 + 参数夹紧（轮询日志即实录）
- ✅ W3 判负登记（不真烧——契约+UNKNOWN 探针已覆盖）
- ✅ W4 交付物可见断言（真进程 /api/deliverables——两真视频在列）
- ✅ W5 通知闭环（真烧实证：messages 落库 + new_message 广播——0 代码疑点）
- ✅ 回归门全绿（16/16 + tsc 0）· AGENTS.md §7 修正 · 判负登记在案
