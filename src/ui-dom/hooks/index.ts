/**
 * hooks — 汇总导出
 *
 * hooks 重构：所有 ctx.ui.useXXX 的实现从 createUi 拆出为独立 hooks 函数，
 * 签名统一 `useXXX(env, ...args)`。ui.ts 组装 HookEnv + 薄转发。
 */

export type { HookEnv, MediaRegistryItem, PopupTracker, ScrollTracker } from './types.ts'

export { useStableRef } from './stable.ts'
export { useHoverCapable } from './stable.ts'
export { useReducedMotion } from './stable.ts'
export { useAnimationEnd } from './stable.ts'
export { useLongPress } from './stable.ts'
export { usePresence } from './stable.ts'
export { useTween } from './stable.ts'

export { useMedia } from './media.ts'
export { useBreakpoint } from './media.ts'
export { useVisualViewport } from './media.ts'
export { useInView } from './media.ts'
export { useScrollPosition } from './media.ts'

export { useControlled } from './input.ts'
export { useControlledInput } from './input.ts'
export { useAsync } from './input.ts'

export { useGlobalKey } from './events.ts'
export { useDrag } from './events.ts'
export { useDragDrop } from './events.ts'

export { usePopupPosition } from './popup.ts'
export { usePopup } from './popup.ts'
export { useOpen } from './popup.ts'
export { useDialog } from './popup.ts'

export { useChat } from './chat.ts'

export { useExternal } from './external.ts'
