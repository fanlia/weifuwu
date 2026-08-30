/**
 * React 19 对照基准——与 weifuwu perf-applier 场景同构：
 * 6000 行 × 4 节点（div + 2 span + button + onClick）+ 3 控制按钮——
 * 挂载/卸载/更新三时段（playwright 驱动计时）
 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'

const N = 6000

function Row({ i, seq }: { i: number; seq: number }) {
  return (
    <div className="perf-row" data-i={i}>
      <span className="perf-name">团队{i}{seq ? '-' + seq : ''}</span>
      <span className="perf-slug">slug-{i}</span>
      <button className="perf-btn" onClick={() => { /* 事件绑定面 */ }}>x</button>
    </div>
  )
}

function App() {
  const [mode, setMode] = useState<'list' | 'gone'>('list')
  const [seq, setSeq] = useState(0)
  if (mode === 'gone') {
    return (
      <div className="perf-gone">
        <div className="ctrl">
          <button id="perf-nav-back" onClick={() => setMode('list')}>nav-back</button>
        </div>
        已卸载
      </div>
    )
  }
  return (
    <div className="perf-applier-scene">
      <div className="ctrl">
        <button id="perf-nav-away" onClick={() => setMode('gone')}>nav-away</button>
        <button id="perf-update" onClick={() => setSeq((s) => s + 1)}>update</button>
      </div>
      <div className="perf-list">
        {Array.from({ length: N }, (_, i) => <Row key={i} i={i} seq={seq} />)}
      </div>
    </div>
  )
}

const root = document.getElementById('root')!
createRoot(root).render(<App />)
