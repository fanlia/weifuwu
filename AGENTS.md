# weifuwu — 开发者指南

> 面向 weifuwu **框架开发者/贡献者**：架构约束、编码标准、内部机制。
> 2026-12 重建——以新内置测试框架实测行为为准（测试反向校准——文档与实现对齐）。

---

## 1. 测试命令纪律

| ID | 规则 | 说明 |
| --- | --- | --- |
| R-01 | **运行测试相关命令的 timeout 最多 10 秒** | 卡住（挂起/竞态/等待）用更短 timeout 复跑缩小范围——超时即信号，不无限等待 |

## 2. 测试架构（内置框架——契约层 + 场景层）

```
npm run test:client    → 契约层（91 测试——node 直跑命令流——零浏览器——~0.2s）
npm run test:scenario  → 场景层（25 场景——SSR 服务化 + playwright——真实浏览器——~6s）
npm run test           → 契约 + 场景 + server（db 真库依赖 docker）
```

### 契约层（src/test/contract/——node:test 直跑）

**原理**：引擎决策层（build/diff/transform）输出 `Command[]`——**纯数据**——node 断言命令流（id/顺序/语义）——零浏览器——引擎内部状态可达。

| 文件 | 覆盖 |
| --- | --- |
| vnode/transform | h/jsx 数据面、key 剥离、stateOf/transitionOf 7×7 全分支 |
| build | 首帧命令序列（create/insert/close/done.full）、组件展开挂组件 id、空洞锚、Fragment 平铺、portal 命名空间 |
| diff | setProp 只发变化键、setText 就地、组件复用（mounts 计数）、transform 让位、空洞互换不误删兄弟（§6.3）、keyed 顺移 remove+move / 循环移位冲突重建（.k{key} 实例复用） |
| key/keyed/attrs | keyOf/listKind/identityKey、attrs 只发变化键、事件函数面引用比较（prev 传递） |
| router/store/data/html | 路由参数/通配、createStore、ctx.data 缓存合并、commandToHtml 序列化 |
| events | EVENT_RE on+大写判定（once/only 不误判）、eventName 映射 |
| api | 真实 HTTP fixture（GET/POST/ApiError/onError——不 mock 网络层） |

### 场景层（src/test/scenario/——playwright 真实 DOM）

**机制**（weifuwu 自举——能力示范）：
- `server.ts`：Router + ui 中间件——`/scenario/:id` 页面（空 root 客户端渲染 / ssr 场景 uiSsr 渲染）+ `/api/chat` NDJSON fixture + `/ws` WebSocket fixture——port 0 随机端口
- `main.tsx`：uiServe 收养 + 中间件注入（i18n/ws）——`ctx.stream(vnode)` 渲染
- `e2e*.test.ts`（3 文件并发——每文件各自 spawn server + playwright）：spawn server（stdout 解析端口）→ goto → DOM 断言（childNodes 恒定/outerHTML/引用 ===/portal 归属——真实 DOM 纪律）
- `e2e-shared.ts`：startScenarioServer/openScenario 共享 helper

| 场景 | 锁定契约 |
| --- | --- |
| hole-placeholder | §6.3 占位不误删兄弟（按钮保留——空洞切换位置正确） |
| component-reuse / keyed-reorder | 工厂不重跑状态保持 / keyed 身份跟随 |
| portal-toggle / unmount-dispose | portal 增删 #__wf_portal / dispose 完整清理 |
| diff-update / events-rebind / fragment-expand / ref-lifecycle | 节点不重建（===）/ 引用重绑 / 平铺 / ref 挂载卸载 |
| navigate | 链接拦截 pushState 导航整树替换 |
| ssr-adopt | SSR 结构吸收（首帧复用 DOM——输入焦点/值保持——失败回退重建） |
| use-external/media/popup/chat/scroll/in-view/drag-drop/controlled-input | hooks 全契约（快照 vs getter 用法、受控回调、IO/滚动事件驱动） |
| style-update / event-guard / open-guard | style 整体替换清空 / 事件非函数 warn / 受控缺回调 warn |

### 已探明契约（测试反向校准——用法红线）

1. **keyed 循环移位** = 冲突重建（DOM 重建——组件 `.k{key}` 实例复用状态保持）——环状 id 依赖（流式 remap 必冲突）——顺移才 move
2. **ref apply 时序**：ref 在 apply 阶段调用——renderFn 读上一拍快照（render-only 语义——显示滞后一拍）
3. **SSR 吸收**：uiServe 首帧 root 有内容 → DFS 序游标结构对齐复用——mismatch → 原子回退清空重建（无 data-v3-id——纯结构匹配）
4. **create attrs 不含事件**（函数过滤）——事件经事件表（diff setProp 路径注册——首帧函数也经事件通道）
5. **style 整体替换**：style 对象 = 组件声明完整样式——applyStyle 先清空旧值（键消失不残留）
6. **useMedia 返回快照**——必须在 renderFn 内调用（mount 闭包永不更新）——usePopup/useExternal 是 getter/handle 可 mount
7. **useChat.messages 是数组替换**——useExternal mount 闭包失效——AiChat 标准模式：subscribe(cb → ctx.render) + 渲染期读 getter
8. **useControlledInput**：onInput 事件（逐键——onChange 映射 change 失焦才触发）——setKeyword 内部态 + setValue 回流
9. **i18n/ws 无自动渲染**——setLocale 后手动 render——ws handler 是 { open, message } 对象
10. **事件名映射**：onClick → click、onDoubleClick → doubleclick（非 dblclick）

### 已知边界（诚实裁剪）

- **渲染队列 FIFO/redirect**：serve 内部机制——间接覆盖（无专门测试）
- **useTween/useReducedMotion/useVisualViewport/useDrag（stable.ts）**：未测（headless 无 reduced-motion 偏好——直落分支）
- **hooks/ai-stream.ts、auth 中间件**：未测（长尾）
- **测试竞态**：场景层 3 文件并发（每文件独立 server/browser）——文件内串行——node:test --test-concurrency 是文件级（单文件内串行——对单文件无效）
