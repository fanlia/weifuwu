# FilePreview 家族 · components

> Office 文档域组件——单入口发现全部能力（07 命名治理：家族归并）。
> 顶层 `SheetGrid` / `SlideCanvas` 导出保留（向后兼容），新代码推荐命名空间访问。

| 成员 | 命名空间访问 | 顶层别名 | 能力 |
|------|------------|---------|------|
| FilePreview | `FilePreview` | — | 多类型预览/编辑入口（md/html/pdf/office/text + 图片） |
| SheetGrid | `FilePreview.Sheet` | `SheetGrid` | xlsx 网格编辑器（ODES 事件流——单元格编辑/公式/样式） |
| SlideCanvas | `FilePreview.Slide` | `SlideCanvas` | pptx 画布编辑器（幻灯片/元素/转换） |

## 选型

```
未知类型文件 → FilePreview（自动识别 + 降级）
xlsx 数据编辑 → FilePreview.Sheet（或 SheetGrid）
pptx 画布编辑 → FilePreview.Slide（或 SlideCanvas）
```
