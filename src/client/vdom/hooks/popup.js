/**
 * vdom hooks — usePopup（浮层弹窗——28 个浮层组件的核心依赖）
 *
 * 能力（AGENTS §5.4——弹窗纪律）：
 * - **portal**：popup.portal(content, key)——createPortal 到 #__wf_portal +
 *   fixed 定位 + 视口夹紧（禁止 absolute 相对父容器）
 * - **定位**：placement（top/bottom/left/right）+ center:false 左对齐 +
 *   gap/margin——打开时 refresh + 锚点变化自动重算
 * - **el-null fallback**：锚点首帧未挂载——微任务重试
 * - **外部点击关闭**：document mousedown——el/panel 外点击关闭
 *   （禁止自建 overlay 遮罩——会挡按钮）
 * - **Escape 关闭**：document keydown
 * - **open getter**：渲染期读最新（非创建时快照）
 * - **panelRef 稳定**：ref 回调稳定引用（mount 作用域定义）
 *
 * 会话级模态（presence/焦点 trap/滚动锁——Modal/Drawer）后续实现。
 */
import { createPortal } from '../core/node/portal.ts';
import { useOpen, useStableRef, useGlobalKey } from './basic.ts';
/** 定位计算（锚点 rect → fixed 坐标——视口夹紧——0-rect 防护） */
export function computePos(el, win, panelW, panelH, placement, gap, margin, center) {
    const r = el.getBoundingClientRect();
    // 0-rect 防护（scroll/ref 间隙——保留上一坐标——A.4 教训）
    if (r.width === 0 && r.height === 0)
        return null;
    const winW = win.innerWidth;
    const winH = win.innerHeight;
    let top;
    let left;
    switch (placement) {
        case 'bottom':
            top = r.bottom + gap;
            left = center ? r.left + r.width / 2 - panelW / 2 : r.left;
            break;
        case 'top':
            top = r.top - panelH - gap;
            left = center ? r.left + r.width / 2 - panelW / 2 : r.left;
            break;
        case 'left':
            top = r.top;
            left = r.left - panelW - gap;
            break;
        case 'right':
            top = r.top;
            left = r.right + gap;
            break;
    }
    // 视口夹紧
    if (left + panelW > winW - margin)
        left = winW - panelW - margin;
    if (left < margin)
        left = margin;
    if (top + panelH > winH - margin)
        top = winH - panelH - margin;
    if (top < margin)
        top = margin;
    return { top, left };
}
/** 锚点解析（trigger/el——字符串 = 触发方式装饰性（ui-dom 兼容——vdom
 *  组件显式 setOpen 驱动）→ null；函数 → 求值） */
function resolveTrigger(opts) {
    const t = opts.trigger ?? opts.el;
    if (!t)
        return null;
    const el = typeof t === 'function' ? t() : t;
    return typeof el === 'string' ? null : el;
}
/** usePopup（渲染期调用——renderFn 内 ctx.ui.usePopup） */
export function usePopup(env, opts) {
    // isOpen 解析（ui-dom 兼容：函数 = 渲染期 getter；布尔 = 受控值；
    // **未传 = 非受控**——内部状态——popup.setOpen 驱动——测试/组件缺省场景）
    const isOpenFn = typeof opts.isOpen === 'function' ? opts.isOpen : undefined;
    const isOpenVal = typeof opts.isOpen === 'boolean' ? opts.isOpen : undefined;
    const controlled = isOpenFn || isOpenVal !== undefined
        ? { get open() { return isOpenFn ? isOpenFn() : isOpenVal; }, onOpenChange: opts.setOpen }
        : undefined;
    const open = useOpen(env, false, controlled);
    // useStableRef 双形状（容器 | ref 回调）——popup 内部用容器形状
    const pos = useStableRef(env, { top: 0, left: 0 });
    const panel = useStableRef(env, null);
    const win = env.getBrowser()?.window;
    // placement 函数解析（ui-dom 兼容——渲染期 getter）
    const placement = typeof opts.placement === 'function' ? opts.placement() : (opts.placement ?? 'bottom');
    const gap = opts.gap ?? 8;
    const margin = opts.margin ?? 8;
    const center = opts.center ?? true;
    /** 重算坐标（锚点 rect + 面板尺寸——0-rect 防护——el-null 微任务重试限次） */
    let retries = 0;
    const refresh = () => {
        const el = resolveTrigger(opts);
        if (!el || !panel.current) {
            // el-null fallback（嵌套弹层首帧锚点未挂载——限次重试——防无限微任务循环）
            if (retries++ < 10)
                queueMicrotask(refresh);
            return;
        }
        if (!win)
            return;
        const pw = panel.current.offsetWidth || panel.current.getBoundingClientRect().width;
        const ph = panel.current.offsetHeight || panel.current.getBoundingClientRect().height;
        const p = computePos(el, win, pw, ph, placement, gap, margin, center);
        if (!p) {
            // 0-rect（scroll/ref 间隙——限次重试）
            if (retries++ < 10)
                queueMicrotask(refresh);
            return;
        }
        retries = 0;
        pos.current = p;
        env.requestRender(); // 坐标落地（面板 style 更新）
    };
    /** presence 状态机（会话级模态：open→exit→closed——退场动画） */
    const phaseIdx = env.nextHookIndex();
    const phaseState = env.getHookState(phaseIdx) ?? { phase: 'closed', exitDone: false };
    env.setHookState(phaseIdx, phaseState);
    /** 渲染期 open 变化检测（prev 记忆——portal/sync 共用） */
    const openIdx = env.nextHookIndex();
    const prev = env.getHookState(openIdx) ?? { open: false };
    env.setHookState(openIdx, prev);
    /** Escape 关闭（常驻——open 时生效） */
    useGlobalKey(env, 'Escape', () => {
        if (open.open)
            open.setOpen(false);
    });
    /** 外部点击关闭（常驻监听——open 时生效——el/panel 外关闭） */
    const downIdx = env.nextHookIndex();
    const downState = env.getHookState(downIdx) ?? { fn: null };
    if (!downState.fn && win) {
        const onDown = (e) => {
            if (!open.open)
                return;
            const t = e.target;
            const el = resolveTrigger(opts);
            if (t && el?.contains(t))
                return;
            if (t && panel.current?.contains(t))
                return;
            open.setOpen(false);
        };
        win.addEventListener('mousedown', onDown);
        env.onUnmount(() => win.removeEventListener('mousedown', onDown));
        downState.fn = onDown;
    }
    env.setHookState(downIdx, downState);
    return {
        get open() {
            return open.open;
        },
        setOpen(v) {
            open.setOpen(v);
        },
        portal(content, key) {
            // **渲染期 open 变化检测**（portal 每次渲染调用——phase 同步——
            // presence 状态机驱动）
            if (prev.open !== open.open) {
                prev.open = open.open;
                if (open.open) {
                    phaseState.phase = 'open';
                    phaseState.exitDone = false;
                    if (opts.positioning !== 'none')
                        queueMicrotask(refresh);
                }
                else if (opts.presence) {
                    phaseState.phase = 'exit'; // 退场——动画后 closed（panelRef 监听 animationend）
                    // **无动画环境立即 closed**（Toast 模式——animationName 检查——
                    // jsdom/无 CSS 动画环境 animationend 不触发——不挂死）
                    if (panel.current && win) {
                        const anim = win.getComputedStyle(panel.current).animationName;
                        if (!anim || anim === 'none')
                            phaseState.phase = 'closed';
                    }
                }
            }
            // presence：exit 阶段仍渲染（退场动画）——closed 后移除
            const show = opts.presence ? phaseState.phase !== 'closed' : open.open;
            return show ? createPortal(content, key ?? 'popup') : null;
        },
        get pos() {
            return pos.current;
        },
        refresh,
        panelRef(el) {
            panel.current = el;
            if (el && open.open && opts.positioning !== 'none')
                queueMicrotask(refresh); // 面板挂载 → 定位
            // presence：监听退场动画结束（exit → closed）
            if (el && opts.presence) {
                const onAnimEnd = (e) => {
                    if (e.animationName.includes('wf-exit') || e.animationName.includes('exit')) {
                        phaseState.phase = 'closed';
                        env.requestRender();
                    }
                };
                el.addEventListener('animationend', onAnimEnd);
                env.onUnmount(() => el.removeEventListener('animationend', onAnimEnd));
            }
        },
        get phase() {
            return phaseState.phase;
        },
        sync(openNow) {
            // 渲染期同步（组件显式驱动——与 portal 内检测同逻辑——双保险）
            if (prev.open !== openNow) {
                prev.open = openNow;
                if (openNow) {
                    phaseState.phase = 'open';
                    phaseState.exitDone = false;
                }
                else if (opts.presence) {
                    phaseState.phase = 'exit';
                    if (panel.current && win) {
                        const anim = win.getComputedStyle(panel.current).animationName;
                        if (!anim || anim === 'none')
                            phaseState.phase = 'closed';
                    }
                }
            }
            return phaseState.phase;
        },
        // **wrapProps trigger 交互**（真实缺口）：Popover/ContextMenu 等依赖
        // wrapProps 的 trigger 行为（不自管触发）——onClick 切换（受控转发
        // setOpen——onOpenChange）——组件自管触发的（TreeSelect 等不 spread）
        wrapProps: {
            onClick: (e) => { e.stopPropagation?.(); open.setOpen(!open.open); },
        },
        onTrigger: () => { },
    };
}
/** 弹层位置跟踪：scroll/resize 时自动重算 fixed 坐标（0 rect 防护） */
export function usePopupPosition(env, options) {
    const win = env.getBrowser()?.window;
    const pos = { top: 0, left: 0, refresh: () => { } };
    const refresh = () => {
        const el = options.el();
        if (!el)
            return;
        const r = el.getBoundingClientRect();
        // 0 rect 防护：元素替换中/未布局/隐藏时 rect 全 0——跳过刷新（保留上一坐标）
        if (r.width === 0 && r.height === 0)
            return;
        const p = options.compute(r);
        pos.top = p.top;
        pos.left = p.left;
    };
    // scroll（捕获——容器滚动也收到）/resize 全局监听 + rAF 节流
    let raf;
    const schedule = () => {
        if (raf)
            return;
        if (!win)
            return;
        raf = win.requestAnimationFrame(() => {
            raf = undefined;
            if (options.isOpen?.() ?? true)
                refresh();
        });
    };
    if (win) {
        win.addEventListener('scroll', schedule, true);
        win.addEventListener('resize', schedule);
        env.onUnmount(() => {
            if (raf !== undefined)
                win.cancelAnimationFrame(raf);
            win.removeEventListener('scroll', schedule, true);
            win.removeEventListener('resize', schedule);
        });
    }
    // 手动重算：只更新坐标，不触发渲染（调用方负责 render）
    pos.refresh = refresh;
    return pos;
}
