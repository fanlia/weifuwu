# vdom core 健壮性第四轮：时序/异步与扩展边界歼灭

> 目标：前三轮已把**状态机化 + 静态/组件树 fuzz 归零**（结构正确性完备）——
> 本轮转向**时序健壮性**（异步竞态/错误自愈/资源生命周期）与**验证边界扩展**
> （fuzz 新维度/hooks 补齐）。以探针实证为基线——每缺口先红后绿。
>
> 方法：探针实证 → 核心层修复 → 契约测试锁定 → 场景 DOM 验证 → 全量回归。
> 归类纪律：全部为核心层（serve/component/data/diff/patch）——修核心不修组件。

---

## 0. 基线（2026-XX 实测）

| 项 | 状态 |
|---|---|
| 契约层 | 129/129 ✅（审计 S1-S7 + reconcile 14 + 全部域） |
| 场景层 | 112/112 ✅（含 e2e-reconcile 对账 + devVerify） |
| showcase | 198/198 ✅ |
| 状态机 | NodeState/CompState/AbsorbState/ServePhase/RenderPhase/EventRegistry/DataPipe/PopupPhase ✅ |
| fuzz | 静态树 1200 对 + 组件树 300 对**零不等价** ✅ |
| 类型面 | core `as any` 仅 12 处（cleanup 3 处——待审计） |

**结论**：结构正确性（终态等价/状态迁移/投影纪律）已完备——**但时序正确性
（异步竞态/错误自愈/挂起防御）零专门覆盖**——这是"健壮"的下一层。

---

## 1. 缺口清单（探针实证——按严重度排序）

### R1：组件 throw 无熔断——错误风暴 + 无限重试循环（🔴 高）

serve `catch → currentTree=null`（自愈重置）→ 下次 render 再 throw → 再重试。
组件工厂抛错是用户代码 bug——每次交互都整树重建风暴。无错误计数、无熔断、
无错误回退 UI（专业框架 ErrorBoundary 语义）。

### R2：异步 renderFn/工厂挂起——渲染队列饿死（🔴 高——冻结）

`createDataPipe` 缓存 pending promise——**无超时**——fetcher 永不 resolve →
`await factory/renderFn` 永不完成 → `runRender` 永不结束 → **队列全部饿死**
→ 应用冻结。`mounting` 占位永存（状态机违例连锁）。

### R3：serve 渲染时序零专门测试（🟠 中）

渲染中 `render()` 入队（FIFO）/ navigate 重定向 / drainPromise 精确语义 /
unmount 清 pending / afterRender 与渲染竞态——"间接覆盖"无时序断言。

### R4：fuzz 维度扩展（🟠 中）

组件树 fuzz 300 对 × 深度 ≤2，无：async 工厂（乱序 resolve）/ async renderFn /
throw 组件 / keyed 组件 × 输出组件混合（深度 3）。

### R5：hooks 层健壮性空白（🟠 中）

`stable.ts` 四个 hook 未测（useTween/useReducedMotion/useVisualViewport/
useDrag）+ `hooks/ai-stream.ts`——hook 是引擎外延（生命周期/清理/竞态）。

### R6：NDJSON 传输层合规（🟡 低）

`commandReader` JSON.parse 无 try-catch（畸形行——serve 外层 catch 已自愈
——但跨 chunk 半行/尾部无换行无专门测试）；`reviveFn` 的 `$fn` 无键静默
undefined。

### R7：消费端防御审计收尾（🟡 低）

proc* 14 处理器"防御性 return 标注 Reject 语义"全量审计（P2 条款）。

---

## 2. 修复计划（Phase——每阶段独立可交付）

### Phase 1：异步时序核心（R1 + R2）——✅ 已完成

**1.1 错误熔断（R1）**：
- 连续渲染错误计数（默认 3）→ **熔断**：渲染回退 UI（`opts.errorFallback`
  可配置——缺省内置"页面渲染失败 + 重试按钮"——inline style 零样式依赖）
  ——成功渲染重置计数（连续错误语义）。
- **探针实证两个真实 bug**：① **mounting 占位残留**（async 工厂 reject 不在
  同步 try 内 → 占位不删 → "正在 mount"违例连锁）——同步 throw + async
  reject 统一清理；② **错误后队列遗留**（错误中断本轮后 queue 无人消费——
  3 连击只有 1 次计数）——runRender 重构为**请求级错误处理**（每请求独立
  catch——失败/熔断/继续队列——FIFO 不丢弃）。
- 验收：e2e-20（3 次 mount 失败 → fallback → 修复钩子 → 重试恢复）+ 契约
  async-robust。

**1.2 挂起防御（R2）**：
- `async-guard.ts`（零依赖）：`withTimeout` + 15s 默认。
- DataPipe：fetcher/默认 fetch 超时 reject（管道级放弃——失败缓存
  invalidate 语义不变）。
- renderComponent：mount 超时 → 显式 reject（整页失败→熔断链）；renderFn
  超时 → **组件级 hole 降级**（单组件失败不炸整树——下一拍重试自愈）。
- 验收：契约 async-robust 8 测试（挂起超时/缓存共享/hole 降级/mount reject/
  禁用路径）。

### Phase 2：serve 时序测试（R3 + R6）——✅ 已完成

- **R6 传输层合规**（契约 stream-robust 5 测试）：跨 chunk 半行（1 字节步进）/
  尾部无换行 + 空行容错 / 畸形行显式 throw / reviveFn $fn 无键违例报告 /
  encode↔reader 往返。
- **R3 时序**（场景 e2e-21/22）：FIFO 渲染队列（5 次连发串行全执行 [1..6]）/
  redirect 消费（302+Location→replaceState+渲染目标）；队列延续由 P1 提前
  捕获修复（e2e-20 内验证）。

### Phase 3：fuzz 扩展（R4）——✅ 已完成

新增 `src/test/contract/fuzz-robust.test.ts`（4 维度——**诚实裁剪**：Portal
vnode 已删除（2027-03 命令式弹窗改造）——"portal 输出"维度不适用）：
- **D1 async 工厂**（乱序 resolve——setTimeout delay 固定时序）——200 对零不等价
- **D2 async renderFn**（Promise 输出）——200 对零不等价
- **D3 throw 组件**（2 相位 × 多种子——错误传播/hole 降级/mount 清理/修复自愈
  ——P1 修复回归锁定）
- **D4 keyed 组件 × 输出组件混合（深度 3）**——600 对——**先红后绿**：
  **抓到 3 个真实 bug（全部核心层——fuzz 证明力再次验证）**：
  - ① **diffSame 组件分支 id 空间双实现偏差**（239/600 → 0）：组件声明
    key → 实例 id 必须 = keyedId（build 同源 .k{key} 空间）——diff 用槽位
    id 查 rec 落空 → 重 mount 到槽位 + 旧键实例残留 + 幽灵 id（seed=11
    i=2 实证）——修复：diffSame **keyed 感知**（kid = keyedId）+ **身份
    比较（type + key）**（key 变化 = 业务身份变化——卸载重建）+ diffStream
    root 转换 oldCompId 同源
  - ② **清理顺序 bug**：先 disposeComponent 再清理输出 → 嵌套实例已删
    → removeVNodeTree 的 registry 查询落空 → 输出区间 DOM 残留——修复：
    **先清理（实例必须存在）后 dispose**
  - ③ **key 空间变化容器级 unmount 缺失**：同空间 type 变化 id 复用
    （mount 覆盖——等价）但 key 变化旧 id ≠ 新 id——S_INST 面残留——
    修复：key 变化时显式发 unmount 旧 keyedId（幂等——前缀递归）

### Phase 4：hooks 外延补齐（R5）——✅ 已完成

新增 `src/test/contract/hooks-robust.test.ts`（14 测试——mock 环境直跑）——
**修复 2 个真实缺口（先红后绿）**：
- **useDrag pointercancel 缺失**（拖拽竞态）：触摸中断/系统手势抢占 →
  无 pointerup → 监听残留（active 永真——window 监听不释放——泄漏 +
  后续 move 持续回调）——修复：pointercancel 显式清理 + onEnd；
  **多指 pointerId 匹配**（非起始指 up/cancel 不结束）
- **useTween duration≤0 除零 NaN**——修复：直落终值（无 rAF 循环）

测试锁定：useTween（duration 边界/目标变化补间/unmount 取消 rAF/reduced
直落）/ useDrag（完整生命周期/pointercancel 清理/多指/拖拽中卸载释放）/ 
useVisualViewport（vv 监听更新+清理/窗口 fallback）/ useReducedMotion
（matchMedia 直落——变化响应记录为已知限制：mount 期一次判定）/
ai-stream（**真实 HTTP fixture**——SSE 事件分发 token 累积+done / HTTP 500
映射 provider_error / abort 静默取消 / malformed 事件跳过不中断 / events
记录环）。

验收：契约 177 / 场景 115 / showcase 198（重跑零失败——首跑偶发 server
启动竞态）/ typecheck。

### Phase 5：审计收尾（R7）——✅ 已完成

新增 `scripts/core-audit.mjs` + `src/test/contract/core-audit.test.ts`：
- **C1 防御标注**：proc* 处理器裸 return 必须带语义标注（防御/审计/幂等/
  合法/违例/静默/兜底/Reject——上方注释窗口）——人工审计结论：proc*
  全部已有标注（P2 条款已贯彻）——脚本化防回潮。
- **C2 as-any 登记制**：core `as any` 11 处豁免登记（debug 门控读全局
  ×8——标准做法；el.style 动态键写 ×2、DOM property 通道 ×1——TS 索引
  面不足——运行时正确）——**1 处改进**（keyed.ts v.type.name 类型面收紧
  → `{ name?: string }`）——白名单外新增 = 报错（登记理由或重构）。

验收：契约 178（+core-audit）/ 场景 115 / typecheck。

---

## 3. 验收（累计——**全部完成 2027-XX**）

| 阶段 | 状态 | 验收 |
|---|---|---|
| P1 | ✅ | 错误熔断 + 挂起防御（e2e-20 + async-robust 8） |
| P2 | ✅ | NDJSON 合规 + serve 时序（stream-robust 5 + e2e-21/22） |
| P3 | ✅ | fuzz 4 维度 1000+ 对零不等价（**3 个真实核心 bug 歼灭**） |
| P4 | ✅ | hooks 外延 14 测试（**useDrag pointercancel / useTween NaN 修复**） |
| P5 | ✅ | 审计 C1/C2（防御标注脚本化 + as-any 登记制） |

**final 基线：契约 178 / 场景 115 / showcase 198 / typecheck 全绿——
共修复 8 个真实 bug**（mounting 占位残留 / 错误后队列遗留 / diffSame
keyed 空间偏差 / 清理顺序 / key 空间 unmount 缺失 / useDrag 监听残留 /
useTween NaN / 注释吞声明——P1-P5 各 1-3 个）。

## 4. 不做清单（诚实裁剪）

- 不做渲染并发（FIFO 用户决策保留——串行是确定性来源）
- 不改命令集（13 种命令是契约——新增命令 = 主版本决策）
- 不做 SSR commandToHtml 管线重构（现有流式已验证）
- 不做 hook API 变更（只补测试与清理缺陷——接口面稳定）
- 不引入运行时依赖（Zero-dep 纪律——超时用原生定时器）
- **不做 Portal vnode"输出"fuzz 维度**（Portal vnode 机制已删除——命令式
  弹窗唯一形态——vnode 层无 portal 输出）
