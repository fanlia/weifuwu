# vdom3 完善计划（2026-08——vnode + stream 引擎）

> vdom3 = vnode 树（声明式）+ 事件流（渲染执行 = 事件——可回放/取消/断言）。
> 初版已验证核心：h/mount/patch（同位置同类型复用 + 事件流记录）。
> 本计划补齐组件/调度/路由/生命周期/事件流能力——渐进落地，每阶段独立可验证。

## P0 组件层（两阶段组件——与 vdom2 同模型）
解锁真实应用能力（当前只有 h() 原生树）。
- [ ] `VNode.type` 扩展 `string | symbol | Component`（函数组件）
- [ ] 组件契约：`async (initProps, ctx) => async (props) => VNode | null`（兼容 vdom2）
- [ ] mount：工厂执行（`COMP_MOUNT` 事件）→ renderFn → 子树渲染
- [ ] patch：同位置同类型组件 → **复用实例**（工厂不重跑）→ renderFn 重跑 → 子树 patch
      （组件内部状态保持——与 vdom2 剪枝语义等价）
- [ ] 卸载：`COMP_UNMOUNT` 事件 + 清理（ctx.onUnmount 钩子）
- [ ] 测试：组件挂载/更新（状态保持）/卸载/事件流

## P1 调度（渲染请求 + 批处理）
- [ ] `render()` API（组件触发重渲染——类似 ctx.ui.render；同组件排队合并）
- [ ] 同 tick 多次渲染请求 → 合并（一次 patch）
- [ ] 指令批处理：同 tick 指令合并应用（防 DOM 写风暴——流式 token 场景）
- [ ] 防重入/死循环（渲染中再次触发 → 排队/跳过——吸取 vdom2 pending 死循环教训）

## P2 事件流能力（回放/取消/断言）
- [ ] **回放**：初始 DOM 快照 + 事件流 → 重放任意时刻（`replay(stream, target, root)`）
- [ ] **取消**：逆操作应用（INSERT↔REMOVE、PROP/TEXT_UPDATE 恢复 prev、REMOVE 需节点快照）
- [ ] 断言工具：`expectEvents(stream, [...])`——测试/调试（渲染 = 事件序列断言）
- [ ] 事件流压缩/归档（长会话——定期快照 + 增量）

## P3 路由（location → DOM 全链路打通）
- [ ] `ROUTE_CHANGE` 事件（popstate/hashchange → 匹配 → 组件挂载）
- [ ] 路由表（path/params/handler——对齐 UIRouter 简化版）
- [ ] 导航（navigate(path)——pushState + ROUTE_CHANGE）
- [ ] 测试：导航 → 事件流（ROUTE_CHANGE → COMP_MOUNT → ... → INSERT）全链路

## P4 生命周期
- [ ] lifecycle 状态机（fresh/building/built/disposed——简化版）
- [ ] 组件卸载清理链（COMP_UNMOUNT → 子树 UNMOUNT + onUnmount 钩子）
- [ ] 构建期渲染请求守卫（building 中 render → 排队——vdom2 教训）

## P5 性能
- [ ] 事件池（对象复用——防 GC 压力）
- [ ] 批处理 DOM 写（同 tick 合并）
- [ ] 基准：与 vdom2 对照（mount 1000 节点 / 更新 100 项列表 / 流式 token 场景）

## P6 验证（最小应用）
- [ ] vdom3 demo（计数器/列表/条件/表单——事件流全程可断言）
- [ ] 录制 → 回放测试（用户操作序列 → 事件流 → 重放断言）
- [ ] 取消验证（undo/redo——渲染层回滚）

## 里程碑

| 阶段 | 内容 | 验收 |
|------|------|------|
| M1（P0） | 组件层 | 两阶段组件挂载/更新/卸载 + 事件流；测试全绿 |
| M2（P1+P4） | 调度 + 生命周期 | render 合并/防死循环；构建守卫 |
| M3（P2） | 回放/取消/断言 | 事故录制→回放→断言闭环 |
| M4（P3） | 路由 | location→DOM 全链路事件流 |
| M5（P5+P6） | 性能 + demo | 基准达标；demo 事件流验证 |

**核心验收**：任意渲染问题的定位 = 读事件流（无附加观测）；事故转测试 = 录制回放。
