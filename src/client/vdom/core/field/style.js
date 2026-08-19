/**
 * vdom core — style 通道（复杂面独立处理）
 *
 * 规则（AGENTS §4.0/§6.4——style diff 只设不删已修）：
 * - 对象应用：el.style[k] = v——**undefined/null/false → 清空**（防残留——
 *   条件显隐组件 display: undefined 残留旧 none）
 * - 字符串直通：setAttribute('style', str)
 * - 数字自动单位：width/height/margin... → px（UNITLESS 白名单无单位——
 *   zIndex/opacity/lineHeight/fontWeight/flex 系）
 * - CSS 变量（--x 前缀）→ setProperty（el.style['--x'] 赋值无效）
 */
/** 无单位属性白名单（数字原样——React 同规则） */
export const UNITLESS_KEYS = new Set([
    'zIndex', 'opacity', 'lineHeight', 'zoom', 'fontWeight', 'order', 'flex',
    'flexGrow', 'flexShrink', 'flexBasis', 'animationIterationCount',
    'orphans', 'widows', 'columns', 'columnCount', 'columnGap',
    'counterIncrement', 'counterReset', 'aspectRatio', 'scale', 'rotate',
]);
/** 单值应用（kebab/camelCase 键——CSS 变量走 setProperty） */
export function applyStyleValue(el, key, value) {
    if (value === undefined || value === null || value === false) {
        if (key.startsWith('--'))
            el.style.removeProperty(key);
        else
            ;
        el.style[key] = '';
        return;
    }
    if (key.startsWith('--')) {
        el.style.setProperty(key, String(value));
        return;
    }
    if (typeof value === 'number' && !UNITLESS_KEYS.has(key)) {
        value = `${value}px`;
    }
    ;
    el.style[key] = String(value);
}
/** style 应用（对象/字符串） */
export function applyStyle(el, style) {
    if (typeof style === 'string') {
        el.setAttribute('style', style);
        return;
    }
    if (style && typeof style === 'object') {
        for (const [k, v] of Object.entries(style)) {
            applyStyleValue(el, k, v);
        }
    }
}
