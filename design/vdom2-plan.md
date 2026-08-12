# vdom2 引擎——TDD 状态机重构计划（取代 vdom1）

> 状态：✅ 核心闭环（2026-12）
> 目标：以「类型定义 + x2y 状态机 + 类型分派」重构 vdom 引擎——消除 vdom1 散落 if-else
> 类型判断链（矩阵测试暴露的残留 bug 根源）；SSR（x2html）与客户端（renderValue）同一类型遍历。

## 1. 架构（vdom2/）

```
vdom2/
  vnode.ts       —— VNode 强类型判别联合（type 判别 + 类型守卫 + 必填字段显式 null）
  kind.ts        —— classifyKind（单一判定源）+ getOutputRange（输出范围统一获取）
  transform.ts   —— 属性/占位原语（setProp/holeMarkup——单一规则源，vdom1 同源）
  render.ts      —— vnode → DOM（RENDERERS 按 classifyKind 分派——每类一个实现）
  transitions.ts —— x2y 状态机（TRANSITIONS[oldKind][newKind]——源类型驱动转换）
  patch.ts       —— patchValue（x2y 分派）+ patchChildren（数组 diff）+ removeOldOutput
  build.ts       —— buildVNode（异步预构建）
  mount.ts       —— mountRoot/createVdomContext（render-only）
  x2html.ts      —— vnode → HTML（SSR——与 renderValue 同一类型遍历）
```

## 2. 核心不变量

1. **类型即分派**：`classifyKind` 单一判定源；渲染用 `RENDERERS[kind]` 表，patch 用
   `TRANSITIONS[oldKind][newKind]` 表——无散落 if-else 类型链
2. **输出范围协议**（getOutputRange）：每个输出单元都能给出 DOM 范围——
   Fragment._childNodes / 组件 _outputChild 递归 / 数组 fragment-start..end 标记；
   替换/移除统一「范围移除」，不依赖下标猜测
3. **强类型约束**：VNode 判别联合 + 类型守卫（isFrag/isComp/...）——字段访问类型系统强制，
   无散落 cast；特有字段必填（渲染前显式 null）
4. **SSR/客户端同构**：x2html 与 renderValue 同一 classifyKind 遍历（数组标记/占位/属性同规则）

## 3. TDD 结果（vdom2-matrix.test.ts 9×9 × 2 上下文 = 162 对）

| 阶段 | 状态 |
|------|------|
| 红：81 对失败（初版） | 修复过程暴露 5 类 bug |
| Fragment/Portal symbol 不一致（vdom2 自建 vs 全局 h()） | vdom2 复用全局 symbol |
| B5：组件输出多节点移除（removeOldOutput 组件递归 _outputChild） | 修 |
| keyed 删除段只移除锚点 | getOutputRange 范围移除 |
| 数组项配对分支只替换锚点 | getOutputRange |
| **wf-hole 占位判断误匹配 fragment-start**（`startsWith('wf-hole:')` 把边界标记当占位替换） | 改 `includes('type=hole')` |
| removeOldOutput 缺数组分支 | getOutputRange 数组扫描 |
| **绿：162 对全过** | |

## 4. 分层（context/hooks/middleware 与 vdom 引擎解耦）

```
vdom2/           纯渲染引擎——改 vdom 不影响其他（审计：不 import hooks/popup/context）
ui-dom/context.ts 组装层——ctx.ui 完整能力（render/selfId/onUnmount/bumpCtxVersion +
                   24 个 hooks 转发 + popup tracker + media registry）——改 hooks/ctx 不动 vdom
ui-dom/hooks/     hooks 实现（独立模块，已存在）
ui-dom/middleware/ 中间件（uiServe 等——后续迁移）
```

## 5. 验收

- [x] vdom2 9×9 全矩阵（数组 + 单值 children 上下文）零残留
- [x] x2html（SSR）与客户端同构（占位/数组标记/组件）
- [x] 分层：vdom2 纯引擎（无 hooks/popup/ctx 依赖）+ ui-dom/context.ts 组装层
- [x] tsc 零错误 + client 170 全绿 + vdom2 矩阵全绿
- [ ] 替换 vdom1：serve/hydration/audit 迁移到 vdom2 + 全量回归（components 1079 + 既有 137）
- [ ] 删除 vdom1（vdom/ 目录）——完成后单一引擎

## 6. 待办（替换 vdom1 前）

- serve.ts（uiServe/SPA 导航）迁移到 vdom2 + ui-dom/middleware/
- hydration.ts 迁移（vdom2 的 hydrate）
- audit.ts 迁移（vdom2 结构校验）
- 组件全量回归（1079）——测试辅助 ui-dom-mount 改指向 vdom2
