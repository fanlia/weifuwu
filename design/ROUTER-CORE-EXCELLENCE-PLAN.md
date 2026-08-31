# ROUTER-CORE-EXCELLENCE-PLAN——后端内核（Router）全面优化（2027-10）

> **✅ 五波次全收官（2027-10）**：A `b4c5fdb5`（mount 展平双修 + Trie 对账
> fuzz——fuzz 驱动修复 3 轮 Trie 缺陷：精确匹配不回溯/fallback 同病/want
> 丢失）· B `ad79f218`（route 级 meta 检查一致性 + HEAD fallback mw 联动）
> · C `66775c86`（error-counter 移植——错误风暴去重/close 幂等/param 编码
> 400 语义）· D `92084f5c`（性能基线登记）· E（结构治理——纯移动拆解
> collect/chain/hub 三模块）
> 实证收益：2 个静默数据丢失级 bug（mount 通配丢失/Trie 精确回溯缺失）
> 波次内捕获修复；router.ts 563→429 行 + 零耦合模块 3 个
> 终态防线：server 163/163 · 契约+场景 123 · showcase 320 全绿

> **定位**：vdom 是前端核心，Router 是后端核心——对齐
> VDOM-CORE-EXCELLENCE 方法论（探针实证 → 波次推进 → fuzz/对账防线 →
> 判负文化 → 全量回归门）。
>
> **探针实证（2027-10）**——侦察即捕获 1 真缺陷 + 5 类缺口：
> - **P3 真 BUG**：mount 展平**丢失子路由通配路由**（`_collectAll` 只收集
>   `node.value` 不收集 `wildcardValue`——`sub.get('/files/*')` mount 后
>   `/s/files/a/b/c` 404；直接注册 200——展平路径丢失实锤）
> - 覆盖缺口：`_checkMiddlewareMeta`（depends/injects）零测试；mount 深水区
>   （双层/通配/ws 展平）仅 1 条测试；mountPath 叠加语义未锁
> - 防线缺口：Trie 无 fuzz 对账（**匹配语义无参考模型验证**）；性能无基线
>   （10k 注册 42ms / 匹配热身 5µs/req——读数健康但无防回归门）
> - 错误路径：handleError console.error 无去重（错误风暴——vdom
>   error-counter 同思想未移植）
> - 结构：router.ts 511 行单文件（mount/collect/handle/chain/ws 混杂）

---

## 方法论映射（vdom 内核优化同源）

| 阶段 | vdom 实践 | Router 对应 |
|---|---|---|
| 探针实证先行 | SIM-DBG dump | P1-P4 探针（P3 捕获真 BUG） |
| fuzz/对账防线 | D5 1310 对 + Sim 终态等价 | Trie fuzz × 线性扫描参考模型 |
| 缺陷模式哨兵 | audit:vdom 六红线 | audit:server（server 域 grep 红线） |
| 错误路径语义 | error-counter 去重 | handleError 去重计数 |
| 性能防线 | 10k build/diff 基线 | 10k 注册/匹配基线 |
| 结构治理 | E 波次纯移动拆解 | router.ts 分区拆解 |

---

## 波次 A：mount 展平修复 + Trie 对账 fuzz（真 BUG 先行）

### A1 wildcardValue 展平修复（P3 实证）
- `_collectAll`/`_collectAllWs` 收集 `node.wildcardValue`（path 加 `/*`）
- 契约：mount 子路由通配路由命中（P3 案例）+ 直接注册对照等价
- **回归门**：现有 router.test 28 it 全绿 + showcase serve 全绿

### A2 mount 深水区契约
- 双层 mount（P1：a.mount('/b', b.mount('/c', c))——leaf 命中）
- mountPath 叠加语义（ctx.mountPath 累积——锁读数）
- mount 后同路径注册抛错（P2 冲突检测——静默覆盖是违例）
- ws 路由 mount 展平（`_collectAllWs` + A1 修复联动）

### A3 Trie 对账 fuzz（**匹配语义参考模型**）
- **生成器**：随机路由树（静态/`:param`/`*` 混合——TRICKY 路径池——
  特殊字符段/编码段）× 随机请求路径
- **参考模型**：线性扫描（按注册序——静态优先 > param > 通配优先级
  排序的独立实现）——**两实现终态等价**（命中的 handler 标识 + params +
  404/405 分类全等）
- 多种子（≥5 × 200 对）——**任何不等价 = 立即定位**（Trie or 模型 bug
  ——人工甄别后修复）
- **冲突检测对账**：param 冲突（:id vs :name 同位）抛错语义入 fuzz

## 波次 B：契约补全（meta 检查 + 405 面）

### B1 _checkMiddlewareMeta 契约（零测试→全分支）
- depends 未注册抛错（含报错文案定位 `app.use(xxx())` 引导）
- injects 登记后不再抛错（注册顺序语义）
- object middleware 形态（`{ middleware() }` 工厂——meta 透传）

### B2 405 / HEAD / all 语义锁定
- 405 Allow 头多方法完备 + 排序稳定
- 通配不产生 405（现状——锁死）
- HEAD→GET fallback（含 route-level mw 联动）
- all('*') 与通配 `*` 路径并存语义

## 波次 C：错误路径语义（自愈不可消音）

### C1 handleError 去重计数
- error-counter 思想移植：同错误（stack 指纹）风暴去重——恢复清出
- onError 自定义优先语义锁死（可覆盖 HttpError）
- HttpError → 状态码映射契约（400/401/403/404/409/422/500 全覆盖）

### C2 close/生命周期语义
- WS 1001 握手先行（S2 已实现——契约锁定 500ms 上限）
- closeables 顺序执行 + 单个失败不阻断 + 重复 close 幂等

### C3 输入防御
- 非法 URL（new URL 抛错——handler() 层）
- 编码路径段（%2E 前缀类——params decode 语义）

## 波次 D：性能基线（防回归）

### D1 基线登记（探针读数为锚——容差 2x）
- 10k 静态+param 路由注册 < 100ms（探针 42ms）
- 匹配热身 < 15µs/req（探针 5µs）+ miss < 15µs（探针 6µs）
- 契约层 timeout 纪律（≤10s）

### D2 常态快路径契约
- 空 route-mw 请求复用 globalMws 引用（S6——零数组分配锁死）
- runChain 空 mw 直调 finalHandler（零闭包）

## 波次 E：结构治理（纯移动拆解）

### E1 router.ts 511 行分区
- 纯移动拆解候选：mount/collect（mount 域）→ `core/mount.ts`；
  handle/chain（请求域）→ `core/dispatch.ts`；hub（ws 域）→ `core/hub.ts`
- **验收 = fuzz + 契约全绿**（结构不变语义不变——对账器保护）
- E2 语义重构一律判负（除非 fuzz 捕获新 bug——判负记录）

---

## 验收判据（红线）

1. **A3 fuzz 多种子全绿**（匹配语义对账——0 不等价）
2. P3 修复回归：mount 通配路由命中 + showcase serve 全绿
3. 契约面：server/core 测试全绿（现有 28 it + 新增 ≥30 it）
4. 性能基线登记（D1 三计数）
5. 全量回归门：npm run test 契约+场景 + audit:all exit 0

## 风险与回退

| 风险 | 缓解 |
|---|---|
| wildcardValue 展平改变现有挂载行为 | P3 是缺口（404 静默丢失）——修复后对照直接注册语义；全量回归门把关 |
| fuzz 参考模型自身 bug | 模型极简（线性扫描）+ 人工甄别不等价样本（vdom D5 同流程） |
| 结构拆解破坏 mount 闭包依赖 | 纯移动 + 先测后动（E1 验收 = 全绿） |
