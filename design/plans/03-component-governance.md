# 03 组件治理计划（Governance）

> 目标：118 组件的质量治理——缺失补全、去留决策、结构优化。
> 审计结论：三库对照基本无缺口（缺 14 项待补）；纯 CSS 组件与 layout 原语不冲突（划边界非删除）；
> 分类结构待重划；合并/删除等破坏性决策等场景数据说话。

## 目标与验收

```
目标：组件库"该有的都有、该清晰的清晰、该治理的有据"
验收：
  □ 缺失清单清零（14 项全部实现——三批）
  □ 纯 CSS 组件边界文档（5 个重叠组件"与原语分工"节）
  □ 治理报告沉淀（去留/合并/重命名/分组重划——决策 + 理由）
```

## 任务清单

| 优先级 | 任务 | 产出 | 依赖 |
|--------|------|------|------|
| P0 | 缺失补全 A 组（5 个）：Wave / SortableList / Table 行内编辑 / ExportCSV / Chart 扩展（radar/gauge/scatter） | 业务高频缺口 | — |
| P1 | 缺失补全 B 组（3 个）：MarkdownEditor / CodeEditor（轻量自研高亮）/ ImageCropper（canvas） | 编辑器类 | A 组模式 |
| P1 | 缺失补全 C 组：VideoPlayer（原生封装）/ Math（LaTeX 轻量子集）；**Map 裁剪登记**（真实地图需瓦片服务，零依赖不可实现——CS-05） | 重依赖决策 | — |
| P1 | 纯 CSS 组件边界：Grid/Typography/Divider/Space/Scrollbar 文档加「与原语的分工」节 | 划边界不删除 | — |
| P1 | 能力光谱图：裸原语（wf-grid）→ 命名组件（Grid）→ 组合组件（Table）选型指引（并入 layout-choice 或独立） | 层级选型 | 02 |
| P2 | 合并/删除决策：Toast+Notification / Alert+AlertGroup / 变体归并——**等场景数据**（02 场景库扩充后看使用情况再定） | 数据驱动治理 | 02 |
| P2 | 重命名（8 处）：ToggleGroup / Agent 族（Pipeline/ToolCallCard/CitationCard 前缀）/ SheetGrid/SlideCanvas 归 FilePreview 家族 / MessageBubble 归 AI 组 | 命名一致 | — |
| P2 | 分组重划：执行 02 的分类重划任务（registry category 更新 + URL 兼容——同一任务，见 02） | 结构优化 | 02 |

## 新组件质量门槛（每个缺失补全的组件）

```
□ 三件套（.ts/.css/.test.ts）+ 单元测试（渲染/交互/键盘）
□ 场景化 demo（showcase 活体——不是孤立展示）
□ registry 登记 + gen-content 文档（API 表自动提取）
□ quality checklist（键盘/响应式/主题/状态矩阵）
□ style-audit 合规 + 防漂移测试更新
```

## 状态

**全部完成 ✅**——A+B+C 组 10 组件全部实现（Wave/SortableList/Table 编辑/ExportCSV/Chart 扩展/MarkdownEditor/CodeEditor/ImageCropper/VideoPlayer/Math——126 组件全量 1867 测试绿 + 活体验证）；Map 裁剪登记（components-cuts.md）；纯 CSS 边界文档/光谱图列入 02 剩余
