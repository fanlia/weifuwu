# platform 质量优化（2027-xx）

> agent-platform 本体优化——四计划（api/web/fullstack/docs）交付后的
> 收尾层：老世代页面收尾 · as any 分域清理 · server.ts 装配拆分 ·
> 测试热力补覆盖 · 噪声显式化。**动机**：四计划后平台已用最新框架能力
> （错误单源/bodyOf/listQuery/权限单源/类型派生），剩余面是「规模与
> 噪声」（server.ts 1562 行·as any 469·页面老世代 2 页·route 覆盖 48.1%）。

## 现状探针（2027-xx 读数）

| 面 | 读数 | 目标 |
| --- | --- | --- |
| 规模 | src+ui+server.ts **117 文件 23K 行** · services 32 个 4.9K 行 · route 54 面 | 装配边界清晰（server.ts ≤500 行） |
| as any | **469**（server.ts 64 · admin 32 · survey-campaign 22 · agent-runner 20 · Admin.tsx 18 · messages 18 · stats 17 ——高浓度 7 面占 191） | 按语义归型——469 → ~350（高浓度面优先） |
| 页面世代 | 老世代 **2**（Admin/Sandboxes——load() 工厂期启动）· 新世代 20 | 老世代 **0**（哨兵黄清零） |
| 非空断言 | 56 · console.log 49（server.ts 19 结构日志面）· catch 空吞 **12** | 空吞显式化（注释/日志——不留无声 `catch {}`） |
| 测试 | 94 文件 10.7K 行 · route 覆盖 **48.1%**（54 面 28 未直接引用）· skip 14（docker 诚实边界）· services 22/32 直接引用 | 热力高频 route 补契约——48.1% → 60%+ |
| 类型 | ui/lib/types 手写 interface/type **~34** · RowOf 派生 3 | 共享响应面（ApiList/TokenUsage 等 3-5 个）派生——不违反「全量不做」判负（按需演进） |
| 干净面 | TODO/FIXME **0** · 响应级 error json **0**（1 业务面判负）· 权限单源 · 端点注册表判负 | 保持 |

## 波次

| 波次 | 内容 | 验收 |
| --- | --- | --- |
| W0 | **老世代收尾 + as any 锚点**：Admin/Sandboxes 迁移 useAsyncData（Agents 范本——fetch 嵌套重载·getter 渲染期读）——哨兵老世代 2→0 · as any 计数 469 基线登记（audit:any 黄报线——新增 as any 可见） | 哨兵 0 红 0 老世代黄 · ui 测试 Admin/Sandboxes 绿 · audit:pages 挂新增 as any 报告行 |
| W1 | **server.ts 装配拆分**：1562 行拆分——中间件装配/worker 注册/公开 route/受保护 route 四域 → `src/bootstrap/*.ts`（机械提取——全局状态 currentCtx 经 ctx 传递面保持） | server.ts ≤500 行 · fork 后平台 475 全绿（行为等价）· tsc 0 |
| W2 | **as any 分域清理**：高浓度 7 面（server.ts 64 · admin 32 · survey-campaign 22 · agent-runner 20 · Admin.tsx 18 · messages 18 · stats 17 =191）按语义归型（有类型删除 any · 动态面显式 unknown · 组合面注释登记）——**判负登记**：残留面（消息体/第三方/运行时动态） | as any 469→~350（高浓度 7 面 -100+）· 平台 tsc 0 · 行为等价测试绿 |
| W3 | **测试热力补覆盖**：28 未引用 route 中按热力挑高频 5-8 条（agents/builtin-tools/audit/auth 面——契约模板 5 行式） | route 覆盖 48.1% → 60%+ · 新增契约绿（memory orm + handler 直调） |
| W4 | **噪声显式化 + 类型小推进**：12 处 catch 空吞补注释/日志（无声吞 = 不透明定案——实现或移除）· ApiList/TokenUsage/Member 等 3-5 个共享响应类型 RowOf 派生 | 12 处空吞全部显式（注释带原因或日志）· 派生类型 tsc 0 · 审计可见 |
| W5 | **docs + 回归门**：AGENTS.md/platform 装配图增补（bootstrap 边界）· as any 残余登记 · 全量回归门 | 平台 475 · 框架五域 · audit 八线 · tsc 三 0 |

## 判负记录（可被新论证推翻）

- **as any 全清**：不做——残留是运行时动态面（消息体/第三方响应/组合子
  元素）——按语义归型后登记残余；推翻：出现「可类型化的具体实例集」
  （>20 处同构可归型）
- **34 手写 interface 全量派生**：延续 W0(fullstack) 判负——只按需演进
  （共享响应面/漂移 bug 实例出现时）；推翻：漂移 bug 测试抓出
- **22 页面 UI 测试全量**：不做——44 ui 文件已覆盖大多页面——按热力补
  （W3 是后端 route 热力——UI 面不再扩展）；推翻：新增页面无 ui 测试
- **services 全测（32 全量）**：延续判负——22/32 有直接引用——剩余是
  orm 直调+编排（UI 面已行为覆盖）；推翻：出现「service 纯函数可单测
  而 route 不可」的实例集
- **server.ts 拆分到框架**：不做——平台装配面不框架化（单应用——无
  第二消费者）；推翻：第二非 platform 应用出现
- **表单原语提取**：弱判负——表单页仅 NewAgent/NewDepartment 2 家
  （NewChat 非表单）——2 家边缘（>1 但样板差异大）；推翻：第三表单页
  出现且结构同构
- **cursor 分页原语**：判负——messages before 单消费面——框架无 cursor
  面；推翻：第二 cursor 分页消费者出现

## 执行实录（边做边记）

（待 W0 起填）

## 验收标准

- [ ] 哨兵零红 · 老世代页面 0 · as any 计数下降（469 → ~350）
- [ ] server.ts ≤ 500 行（装配边界清晰——四域可读）
- [ ] route 覆盖 60%+ · 新增契约全绿
- [ ] 12 处 catch 空吞显式化 · 共享响应类型派生落地
- [ ] 全量回归门（平台 475 · 框架五域 · audit 八线 · tsc 三 0）
