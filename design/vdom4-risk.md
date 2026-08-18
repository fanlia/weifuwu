# vdom4 潜在 bug 源审查（2026-12）

> 前瞻性风险审查（非历史盘点）——引擎实现中可能潜伏的 bug 来源。
> 每项标注：状态（已修/已验证安全/已知限制/待验证）。

## 已修复（本轮审查抓出）

| # | bug 源 | 症状 | 修复 |
|---|--------|------|------|
| R1 | **commitOutput 不处理「输出变 null」**——nextOutput null 时 lastOutput 保持旧树——但 DOM 已 clearSlot——**lastOutput 与 DOM 失配** | 组件输出 null 后再次输出内容——**恢复失败**（内容不渲染——tmpdbg5 验证） | **outputNull 显式标记**（本次渲染明确输出 null 才清 lastOutput）——初版「nextOutput null 且 lastOutput 非 null 即清」误伤未重渲染组件（commitAll 遍历全部实例——12 测试回归）——教训：**null 状态必须区分「未重渲染」与「输出 null」**（契约 X-G4 锁定） |
| R2 | **apply insert 的 `cmds.find` O(n²)**——每个 insert 扫描全部命令找 create | 大列表性能（VirtualList 100 项 = 1 万次扫描） | 预建 createVn Map（O(1) 查找） |
| R3 | **ctx.data 失败缓存**——fetcher/fetch 失败后 reject 的 promise 留在缓存——后续 get 永远失败（无重试） | 失败后组件永久挂起态 | 补 `data.invalidate(key)` 显式重试入口（默认行为保留——文档红线） |

## 已验证安全（本轮验证）

| # | 疑点 | 验证结果 |
|---|------|---------|
| S1 | 多 root 并存（模块级 compRenders/openStates——compId 'root' 冲突） | useOpen 闭包绑定安全（scheduleRender 是引擎闭包——不查模块表）；**残余风险**：usePopup/useScrollPosition 的 tracker 回调走模块级 compRenders——多 root 的 popup 重算可能调度错位——**已知限制（单应用场景无碍）** |
| S2 | hooks 状态残留（openStates/uncontrolledValues/inputStates） | 全部有 onUnmount 清理 ✓（input.ts/popup.ts） |
| S3 | 剪枝标记残留（next === last 同引用） | commitOutput 跳过——下次 build 覆盖——语义一致 ✓ |
| S4 | 事件重绑窗口（remove + add 同步） | 同步执行无窗口 ✓ |
| S5 | 串行调度交错（renderFn await 期间） | drain 串行 await——无并发交错 ✓ |
| S6 | unkeyed 游标（空洞后锚推进） | cursor++ 在锚处理后——空洞 continue 不重复推进 ✓ |

## 已知限制/残余风险（诚实登记）

| # | 风险 | 说明 |
|---|------|------|
| K1 | **多 root usePopup/useScrollPosition tracker 冲突** | 模块级 trackerSystem keyed by compId——多应用并存时 popup 重算调度错位——单页单应用场景无碍——文档红线 |
| K2 | **render(['语义id']) 映射不完整** | 语义名未映射 compId（注释「id 即 compId」）——组件库 0 使用——已知裁剪 |
| K3 | **data 失败缓存默认无重试** | invalidate 显式入口——用户需在错误处理中调用——文档红线 |
| K4 | keyed portal 项的 `lastAnchor = oldAnchors[i]`（重排+portal 组合） | 未实测场景（Select 菜单重排罕见）——理论边界 |
| K5 | 组件输出数组（隐式 Fragment）的 `_childAnchors` 首/尾锚边界 | design 已登记（vdom3 同款残余）——组件输出数组直接接数组未实测 |
| K6 | props deepFreeze 冻结语义 | 用户误改 props 原地改 → TypeError（特性——防原地改）——豁免含函数属性对象 |

## 契约测试锁定（vdom-x 新增）

- X-G4：组件输出 null → 恢复（R1 回归）
- 现有 X-B1~B8/C1~C4/D1~D4/E1~E2/F1~F4/G1~G3/H1~H10 覆盖其余面

## 调度机制（2026-12 决策——确定性高于 render 次数——无 magic）

**schedule 已移除**（队列/同目标合并/微任务启动/MAX_ITERATIONS 循环上限——全部删除）。
替代：**立即渲染 + rendering 守卫 + 单槽位补跑**（约 30 行）：

```
render() 调用 = 立即启动一次渲染（同步进入 build——无微任务延迟/无队列/无合并）
渲染中调用  → 单槽位补跑（dirtyTarget 记录最新目标——当前渲染完成后执行一次）
无外力      → 零渲染（render-only——渲染只发生在 render() 调用处）
```

**为什么单槽位补跑而非忽略**（X-H7 实测）：连锁 render（组件内部渲染进行中 →
父 onChange 的 root render）——忽略会**静默丢失**（点击 tab 不切换——比 magic 更糟）。
单槽位语义明确可推导：**每个 render 请求要么立即执行（空闲）要么确保最终执行**
（合并到补跑——最终 DOM = 所有请求的最新状态）。

**天然限流**：渲染中窗口仅在真 await（ctx.data fetch）期间存在——事件（宏任务）
在窗口内触发 → 单槽位合并——事件风暴 = 一个补跑。

## 剪枝错误根因分析（混合 component 场景）

剪枝 = `propsEqual(lastProps, props)`（**引用比较**——依赖 props 不可变——
deepFreeze 保证纯数据；**豁免**：含函数属性的对象/类实例不冻结）。

| # | 根因 | 机制 | 对策 |
|---|------|------|------|
| P1 | **豁免对象被原地修改 → 引用比较失效**（实测：shared.items.push + 父 render——子组件 renders:1——UI 显示旧数据） | deepFreeze 豁免（含函数对象）可变——props 同引用——剪枝命中 | 标准 S4.5：props 对象变更必须换引用（受控数据不可变更新）——文档红线 |
| P2 | **同类型无 key 列表重排**——位置身份——实例状态错位（A1↔A2 交换——位置 0 复用 A1 实例——props 相同剪枝——状态错） | unkeyed 位置配对 | A 级检测（长度变化）+ 文档红线（长度不变不可检测） |
| P3 | lastOutput 失配（R1——已修） | outputNull 标记 | 契约 X-G4 |
| P4 | reuse 判定与实例表失配（throw——9 次坑） | keyed 路径翻转/锚冲突（已修） | 契约 X-B3 |
| P5 | 剪枝标记残留（next === last 同引用） | commitOutput 语义（剪枝跳过） | 已验证安全（S3） |

**核心洞察**：剪枝只看 props 引用——不看内部状态——两个驱动源协同：
props 变化 → 父 build 驱动重渲染；内部状态变化 → 组件级渲染（renderComp）。
**剪枝错误的本质 = 这两个驱动源的交叉点状态不一致**（lastOutput 失配/引用失效）。

## UIRouter + uiServe（2026-12 补齐——类比后端 Router/serve）

**定位**：vdom4 路由 = 后端 Router 语义前端化（Trie 匹配 + 路径参数 + 通配符）——
同一 UIRouter 实例服务端/客户端共享（匹配/参数注入两端同源——AGENTS 架构承诺）。

| 模块 | 职责 | 类比后端 |
|------|------|---------|
| `router.ts` UIRouter | get(path, handler) / notFound / match（Trie——静态段优先参数段优先通配段——:id 参数 + * 通配） | `src/core/router.ts` Router |
| `serve.ts` uiSsr | 服务端落地：match → 页面 vnode → renderToCommands → HTML + 数据种子 | serve |
| `serve.ts` uiServe | 客户端收养（hydrate——SSR HTML 路径 id 精确吸收零重建）+ 导航（navigate/链接拦截/popstate） | serve |

**导航渲染**：根 vnode 替换 + 立即渲染（vdom4 机制——无 schedule）——
根级异类型（页面切换）= 整树原子替换（build 前清旧树——X-R2 抓出 diff oldV 链
断裂——新组件实例 lastOutput null 旧 DOM 无对照）；同类型（页面 params 变化）=
组件实例复用正常 patch。

**契约**：X-R1（Trie 匹配）/ X-R2（导航原子切换）/ X-R3（SSR→hydration 零重建 + 交互）。

## 结论

vdom4 核心调度/锚点/实例表语义经本轮审查基本安全（S1~S6）；
高危 R1（输出 null 失配）已修复并契约化；R2/R3 为性能与失败语义补强。
剪枝错误 P1（豁免对象原地改）为最常见真实根因——标准 S4.5 红线。
vdom5 验收时：vdom-x 42 测试全绿 + K1~K6 对照清单逐项确认。
