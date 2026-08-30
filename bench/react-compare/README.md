# React 19 性能对照基准

weifuwu vdom vs React 19（真实生产框架）——同构场景（6000 行 × 4 节点）四指标。

## 运行

```bash
# 1. 独立 React 环境（不污染仓库零依赖——React 装 /tmp）
npm i --prefix /tmp/react-bench react@19 react-dom@19

# 2. 打包 React 版（esbuild——仓库 node_modules）
esbuild perf-react.tsx --bundle --format=iife --jsx=automatic \
  --outfile=/tmp/react-bench/perf-app.js --minify \
  --define:process.env.NODE_ENV='"production"'

# 3. React 版页面 + CSS 入口（index.html——components.css 由对比脚本代理注入）
cp index.html 模板 /tmp/react-bench/  # 见下方模板

# 4. 对比
node compare.mjs
```

index.html（React 侧）：
```html
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body><link rel="stylesheet" href="/components.css"><div id="root"></div>
<script src="/perf-app.js"></script></body></html>
```

## 公平性纪律（教训机制化）

1. **同 CSS 负载**：weifuwu 场景页带 components.css（280KB）；
   React 页必须代理同一份——否则 CDP (program)（CSS 布局）差异造成
   「React 快 3.3x」假象（对齐后实际 0.82-0.96x）
2. **同节点结构 + 同交互**：6000 行 × 4 节点（div/span/span/button+onClick）
   ——React key={i} 索引 key（等效索引 diff）
3. **React 须 production**（--define NODE_ENV）——dev React 更慢（偏利假象）
4. **CDP Profiler 按 profile.samples 计数**（profile.nodes 是函数定义数）

## 最近结果（2027-09·同 CSS）

| 指标 | React 19 | weifuwu | React/wf |
|---|---|---|---|
| mount | 776ms | 933ms | 0.83x |
| unmount | 48ms | 160ms | 0.30x |
| update | 200ms | 208ms | 0.96x |
| remount | 738ms | 904ms | 0.82x |

结论：mount/update 接近 React；unmount 剩命令粒度结构性差距
（removeTree 批命令判负延后——收益评估见 design/VDOM-PERF-PLAN.md §6）。
