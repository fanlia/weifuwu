/**
 * weifuwu/components/SlideCanvas — pptx 画布编辑器（ODES 事件流——阶段 3）
 *
 * 设计（design/office-events-plan.md）：文档 = fold(事件流)——每个编辑 =
 * OfficeOp（shape-add/remove/move/resize/set）→ editEmit('office') → commit。
 *
 * - 画布：960×540 幻灯片区域（缩放适配容器——scale 因子）
 * - shape：文本（div）/矩形（背景）/图片（占位）/线条
 * - 选中 + 拖动移动（pointer events）；右下角 handle 缩放
 * - 双击文本 shape → 编辑文本（textarea——blur/Enter 提交 → shape-set）
 * - 工具条：添加文本/矩形、删除、幻灯片增删、撤销
 * - AI：选中 shape → 文本润色（wf: SSE → openPopup 浮层 → 接受 = shape-set commit）
 * - 事件流：全部操作 → editEmit('office', { docType: 'pptx', op }) + commit
 */

import { h } from '../../vdom/index.ts'
import { aiStream } from '../../vdom/hooks/ai-stream.ts'
import { editEmit } from '../Editor/edit-events.ts'
import { applySlideOp } from '../OfficeEditor/model/apply.ts'
import type { OfficeOp, SlideShape } from '../OfficeEditor/model/types.ts'
import { parseReplyByMode } from '../OfficeEditor/ai/ai-bridge.ts'
import type { DeckState } from '../OfficeEditor/model/types.ts'
import type { Component, VNode } from '../../vdom/index.ts'

export interface SlideCanvasProps {
  /** 受控 DeckState */
  deck: DeckState
  onChange?: (deck: DeckState) => void
  ai?: { url: string; headers?: Record<string, string> }
  height?: string
  readonly?: boolean
}

interface UndoEntry {
  label: string
  ops: OfficeOp[]
  before: DeckState
}

const CANVAS_W = 960
const CANVAS_H = 540

export const SlideCanvas: Component<SlideCanvasProps> = (_init, ctx) => {
  const i18n = ctx.i18n?.components?.SlideCanvas ?? {}
  // ── mount ──
  let deck: DeckState = _init.deck
  let lastPropsDeck = _init.deck
  let activeSlide = Math.min(_init.deck.activeSlide, _init.deck.slides.length - 1)
  let selected: string | null = null
  let editing: { id: string; text: string } | null = null
  let canvasEl: HTMLElement | null = null
  const canvasRefStable = (el: unknown): void => { canvasEl = el as HTMLElement | null }
  const editAreaRef = (el: unknown): void => { if (el) (el as HTMLTextAreaElement).focus() }
  let scale = 0.5
  const undo: UndoEntry[] = []
  // 拖动状态
  let drag: { id: string; mode: 'move' | 'resize'; startX: number; startY: number; orig: SlideShape } | null = null
  // AI 状态
  let aiPending: { revised: string; streaming: boolean; error: string | null; shapeId: string; messageId: string } | null = null
  let aiAnchor: HTMLElement | null = null
  const aiAnchorRef = (el: unknown): void => { aiAnchor = el as HTMLElement }

  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let aiHandle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null
  const syncAiPanel = (panel: import('../../vdom/index.ts').VNode | null): void => {
    if (aiPending && panel && !aiHandle)
      aiHandle = ctx.ui.openPopup({
        key: 'slide-ai',
        anchor: () => aiAnchor,
        placement: 'bottom',
        gap: 8,
        content: () => panel,
        onClose: () => { aiHandle = null; if (aiPending) { aiPending = null; ctx.render() } },
      })
    else if (!aiPending && aiHandle) { aiHandle.close(); aiHandle = null }
    else if (aiHandle && panel) aiHandle.update(panel)
  }

  // ── 事件流：commit ──
  const commit = (label: string, ops: OfficeOp[], before: DeckState): void => {
    let next = before
    for (const op of ops) next = applySlideOp(next, op as never) as DeckState
    deck = next
    for (const op of ops) editEmit('office', { docType: 'pptx', op } as never)
    undo.push({ label, ops, before })
    ctx.render()
    _init.onChange?.(deck)
  }

  const shapeOf = (id: string): SlideShape | undefined =>
    deck.slides[activeSlide]?.shapes.find((s) => s.id === id)

  const addShape = (kind: 'text' | 'rect'): void => {
    const id = `s${Date.now()}`
    const shape: SlideShape = {
      id, kind,
      x: 120, y: 120, w: kind === 'text' ? 320 : 160, h: kind === 'text' ? 48 : 120,
      props: kind === 'text' ? { text: '双击编辑文本' } : { fill: '#dbeafe' },
    }
    // selected 在 commit 前设置（commit 内 ctx.render——渲染时已选中——
    //  删除按钮 disabled 正确解除——渲染时机正确性——真实 bug）
    selected = id
    commit('添加形状', [{ type: 'shape-add', slide: activeSlide, shape }], deck)
  }
  const deleteShape = (): void => {
    if (!selected) return
    const id = selected
    selected = null
    commit('删除形状', [{ type: 'shape-remove', slide: activeSlide, shapeId: id }], deck)
  }
  const addSlide = (): void => {
    const at = activeSlide + 1
    commit('添加幻灯片', [{ type: 'slide-add', at, layout: 'blank' }], deck)
    activeSlide = at
  }
  const deleteSlide = (): void => {
    if (deck.slides.length <= 1) return
    commit('删除幻灯片', [{ type: 'slide-delete', slide: activeSlide }], deck)
    activeSlide = Math.max(0, activeSlide - 1)
  }
  const undoLast = (): void => {
    editing = null
    const u = undo.pop()
    if (!u) return
    deck = u.before
    editEmit('undo', { label: u.label } as never)
    ctx.render()
    _init.onChange?.(deck)
  }

  // ── 拖动（pointer——move/resize） ──
  // **move/up 绑 window（2027-09 场景层拖拽实证）**：pointerdown 后 selected
  // 变化触发 ctx.render() → shape DOM 被替换 → 若 move 绑画布容器，重建后
  // 事件流断裂（move 不再到达——拖拽死）。window 恒在不受重建影响——drag
  // 状态门控（null 时 no-op）——ctx.ui.hold 卸载清理。SSR 端 ctx.browser
  // undefined 自动跳过（工厂期不创建浏览器对象）。
  const windowMove = (e: PointerEvent): void => onPointerMove(e)
  const windowUp = (): void => onPointerUp()
  const envWin = ctx.browser
  envWin?.addEventListener?.('pointermove', windowMove)
  envWin?.addEventListener?.('pointerup', windowUp)
  ctx.ui?.hold?.(() => {
    envWin?.removeEventListener?.('pointermove', windowMove)
    envWin?.removeEventListener?.('pointerup', windowUp)
  })
  const onPointerDown = (id: string, mode: 'move' | 'resize', e: PointerEvent): void => {
    if (_init.readonly) return
    e.preventDefault()
    e.stopPropagation()
    const shape = shapeOf(id)
    if (!shape) return
    selected = id
    editing = null
    drag = { id, mode, startX: e.clientX, startY: e.clientY, orig: shape }
    ctx.render()
  }
  const onPointerMove = (e: PointerEvent): void => {
    if (!drag) return
    const dx = (e.clientX - drag.startX) / scale
    const dy = (e.clientY - drag.startY) / scale
    if (drag.mode === 'move') {
      const next: SlideShape = {
        ...drag.orig,
        x: Math.max(0, Math.round(drag.orig.x + dx)),
        y: Math.max(0, Math.round(drag.orig.y + dy)),
      }
      applyShapeLive(drag.id, next)
    } else {
      const next: SlideShape = {
        ...drag.orig,
        w: Math.max(20, Math.round(drag.orig.w + dx)),
        h: Math.max(16, Math.round(drag.orig.h + dy)),
      }
      applyShapeLive(drag.id, next)
    }
  }
  const onPointerUp = (): void => {
    if (!drag) return
    const { id, orig } = drag
    drag = null
    const now = shapeOf(id)
    if (!now) return
    if (now.x === orig.x && now.y === orig.y && now.w === orig.w && now.h === orig.h) {
      return
    }
    // 提交一次 move/resize commit（拖拽过程 live 不产生事件——结束原子提交）
    commit('移动/缩放', [
      { type: 'shape-move', slide: activeSlide, shapeId: id, x: now.x, y: now.y },
      { type: 'shape-resize', slide: activeSlide, shapeId: id, w: now.w, h: now.h },
    ], deck)
    ctx.render()
  }
  /** 拖拽 live：直接改 deck（不产生事件——提交在 pointerup） */
  const applyShapeLive = (id: string, next: SlideShape): void => {
    deck = {
      ...deck,
      slides: deck.slides.map((s, i) => i === activeSlide
        ? { ...s, shapes: s.shapes.map((sh) => sh.id === id ? next : sh) }
        : s),
    }
    ctx.render()
  }

  // ── AI（选中 shape 文本润色） ──
  const runAi = (): void => {
    if (!_init.ai || !selected) return
    const shape = shapeOf(selected)
    if (!shape) return
    const shapeId = selected
    const prompt = `请润色以下幻灯片文本，保持原意，输出润色后的完整文本（不要额外解释、不要引号）：\n\n${shape.props?.text ?? ''}`
    aiPending = { revised: '', streaming: true, error: null, shapeId, messageId: `slide-ai-${Date.now()}` }
    ctx.render()
    editEmit('office', { docType: 'pptx', ai: { messageId: aiPending.messageId, status: 'suggested' } } as never)
    aiStream(_init.ai.url, {
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: _init.ai.headers,
      onToken: (text) => {
        if (!aiPending) return
        aiPending.revised += text
        ctx.render()
      },
      onDone: () => {
        if (!aiPending) return
        aiPending.streaming = false
        ctx.render()
      },
      onError: (e) => {
        if (!aiPending) return
        aiPending.streaming = false
        aiPending.error = e?.message ?? 'AI 请求失败'
        ctx.render()
      },
    })
  }
  const acceptAi = (): void => {
    if (!aiPending) return
    editing = null
    const parsed = parseReplyByMode(aiPending.revised, { docType: 'pptx', shapeId: aiPending.shapeId })
    if (parsed.ops.length === 0) { aiPending.error = parsed.note ?? '无法解析'; ctx.render(); return }
    const before = deck
    let next = before
    for (const op of parsed.ops) next = applySlideOp(next, op as never) as DeckState
    deck = next
    for (const op of parsed.ops) {
      editEmit('office', { docType: 'pptx', op, ai: { messageId: aiPending.messageId, status: 'accepted' } } as never, aiPending.messageId)
    }
    undo.push({ label: `AI 润色 ${aiPending.shapeId}`, ops: parsed.ops as never[], before })
    aiPending = null
    ctx.render()
    _init.onChange?.(deck)
  }
  const rejectAi = (): void => {
    if (!aiPending) return
    editing = null
    editEmit('office', { docType: 'pptx', ai: { messageId: aiPending.messageId, status: 'rejected' } } as never)
    aiPending = null
    ctx.render()
  }

  // ── 渲染 ──
  return (props: SlideCanvasProps) => {
    // **受控回流门控（2027-09 场景层拖拽实证）**：拖拽期间场景 render 会以
    // 新 deck 字面量触发引用比较命中——内部 live 状态被 props 重置（x=104→10
    // ——拖拽死）。live 期间挂起回流；commit 后场景受控回传新 deck。
    if (!drag && props.deck !== lastPropsDeck) {
      lastPropsDeck = props.deck
      deck = props.deck
    }
    const readonly = !!props.readonly
    const slide = deck.slides[Math.min(activeSlide, deck.slides.length - 1)] ?? { shapes: [] as SlideShape[] }

    // 缩放适配（容器宽 960/高 540——scale 由宽度决定）
    const fitScale = (): number => {
      // `||` 而非 `??`（真实 bug）：jsdom/无布局环境 clientWidth 为 0——
      // ?? 不 fallback（0 非 null）——scale 变负——拖拽反向——测试注释
      // 期望 0 → fallback 640
      const w = canvasEl?.clientWidth || 640
      return Math.min(1, (w - 24) / CANVAS_W)
    }
    scale = fitScale()



    // shape 渲染
    const shapeNodes: VNode[] = slide.shapes.map((shape, i) => {
      const isSelected = selected === shape.id
      const isEditing = editing?.id === shape.id
      const common = {
        key: shape.id,
        class: ['wf-slide-shape', `wf-slide-shape--${shape.kind}`, isSelected ? 'wf-slide-shape--selected' : ''].filter(Boolean).join(' '),
        style: {
          left: `${shape.x}px`,
          top: `${shape.y}px`,
          width: `${shape.w}px`,
          height: `${shape.h}px`,
          ...(shape.props?.fill ? { background: shape.props.fill } : {}),
        },
        onPointerDown: (e: PointerEvent) => onPointerDown(shape.id, 'move', e),
      }
      const body: VNode[] = []
      if (isEditing) {
        body.push(h('textarea', {
          ref: editAreaRef,
          class: 'wf-slide-shape-edit',
          value: editing?.text ?? '',
          onInput: (e: Event) => { editing = { id: shape.id, text: (e.target as HTMLTextAreaElement).value } },
          onFocusout: () => { commitEdit() }, // focusout 冒泡（blur 不冒泡——事件代理不可达）
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit() }
            if (e.key === 'Escape') { editing = null; ctx.render() }
          },
          onPointerDown: (e: PointerEvent) => e.stopPropagation(),
        }))
      } else if (shape.kind === 'image') {
        body.push(h('div', { class: 'wf-slide-shape-image' }, '🖼'))
      } else if (shape.kind === 'line') {
        body.push(h('div', { class: 'wf-slide-shape-line' }))
      } else {
        body.push(h('div', { class: 'wf-slide-shape-label' }, shape.props?.text ?? ''))
      }
      return h('div', common, ...body,
        isSelected && !readonly
          ? h('div', {
            class: 'wf-slide-shape-resize',
            onPointerDown: (e: PointerEvent) => onPointerDown(shape.id, 'resize', e),
          })
          : null,
      )
    })

    const commitEdit = (): void => {
      if (!editing) return
      const { id, text } = editing
      editing = null
      const shape = shapeOf(id)
      if (!shape) return
      if (shape.props?.text === text) return
      commit('编辑文本', [{ type: 'shape-set', slide: activeSlide, shapeId: id, props: { text } }], deck)
    }

    // AI 浮层
    const aiPanel = aiPending
      ? h('div', { class: 'wf-slide-ai-panel' }, [
        h('div', { class: 'wf-slide-ai-title' }, `${i18n.aiTitle ?? 'AI 润色'}`),
        aiPending.error
          ? h('div', { class: 'wf-slide-ai-error' }, aiPending.error)
          : h('pre', { class: 'wf-slide-ai-body' }, aiPending.revised || (aiPending.streaming ? (i18n.aiThinking ?? '思考中…') : '')),
        h('div', { class: 'wf-slide-ai-actions' }, [
          h('button', {
            class: 'wf-btn wf-btn--primary wf-btn--sm', type: 'button', key: 'ok',
            disabled: aiPending.streaming,
            onClick: () => acceptAi(),
          }, i18n.accept ?? '应用'),
          h('button', {
            class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'no',
            onClick: () => rejectAi(),
          }, i18n.reject ?? '拒绝'),
        ]),
      ])
      : null

    const vn = h('div', {
      class: 'wf-slide',
      onKeyDown: (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoLast() }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'enter' && _init.ai && selected) { e.preventDefault(); runAi() }
        if (e.key === 'Delete' && selected && !editing) { e.preventDefault(); deleteShape() }
      },
    }, [
      // 工具条
      h('div', { class: 'wf-slide-toolbar' }, [
        ...deck.slides.map((s, i) =>
          h('button', {
            key: `tab${i}`,
            class: ['wf-slide-tab', i === activeSlide ? 'wf-slide-tab--active' : ''].filter(Boolean).join(' '),
            type: 'button',
            onClick: () => { activeSlide = i; selected = null; editing = null; ctx.render() },
          }, `${i18n.slide ?? '幻灯片'} ${i + 1}`)),
        h('button', { class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'add-slide', onClick: () => addSlide(), disabled: readonly }, i18n.addSlide ?? '+ 页'),
        ...(!readonly ? [
          h('button', { class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'del-slide', onClick: () => deleteSlide() }, i18n.deleteSlide ?? '删页'),
          h('button', { class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'add-text', onClick: () => addShape('text') }, i18n.addText ?? '文本'),
          h('button', { class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'add-rect', onClick: () => addShape('rect') }, i18n.addRect ?? '矩形'),
          h('button', { class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'del', onClick: () => deleteShape(), disabled: !selected }, i18n.deleteShape ?? '删除'),
          ...(_init.ai
            ? [h('button', {
              ref: aiAnchorRef,
              class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'ai',
              'aria-expanded': String(!!aiPending),
              disabled: !selected,
              onClick: () => runAi(),
            }, i18n.aiPolish ?? 'AI 润色')]
            : []),
        ] : []),
        h('button', { class: 'wf-btn wf-btn--ghost wf-btn--sm', type: 'button', key: 'undo', onClick: () => undoLast(), disabled: readonly || undo.length === 0 }, i18n.undo ?? '撤销'),
      ]),
      // 画布
      // **拖拽事件绑 window（2027-09 场景层拖拽断言实证）**：原绑画布容器——
      // pointerdown 后 ctx.render() 重建 shape（selected 类变化）→ 若元素被
      // 替换，后续 pointermove 的 target 链不稳定（实证 move 事件不再到达
      // 容器——拖拽死）。改绑 window（工厂期恒挂 + drag 门控 + ctx.ui.hold
      // 清理——重建无关——标准拖拽做法）。onPointerLeave 移除（容器级不适用）。
      h('div', {
        class: 'wf-slide-canvas-scroll',
        style: { height: props.height },
      }, [
        h('div', {
          ref: canvasRefStable,
          class: 'wf-slide-canvas',
          style: { width: `${CANVAS_W * scale}px`, height: `${CANVAS_H * scale}px` },
        }, shapeNodes.map((n) => h('div', {
          key: (n as any).key,
          style: { transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute' },
          class: 'wf-slide-shape-scaler',
        }, n))),
      ]),
    ])
    // 命令式同步（受控 + 内容更新——每次渲染恒调用）
    syncAiPanel(aiPanel)
    return vn
  }
}
