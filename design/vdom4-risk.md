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

## 结论

vdom4 核心调度/锚点/实例表语义经本轮审查基本安全（S1~S6）；
高危 R1（输出 null 失配）已修复并契约化；R2/R3 为性能与失败语义补强。
vdom5 验收时：vdom-x 42 测试全绿 + K1~K6 对照清单逐项确认。
