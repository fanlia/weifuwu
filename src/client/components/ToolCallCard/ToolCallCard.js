import { h } from '../../vdom/index.ts';
import { Icon } from '../Icon/Icon.ts';
import { JSONViewer } from '../JSONViewer/JSONViewer.ts';
const stateIcon = { running: 'settings', ok: 'check', error: 'close' };
export const ToolCallCard = async (_init, _ctx) => async (props) => {
    const { call, progress, result, renderArgs } = props;
    const state = result ? (result.ok ? 'ok' : 'error') : 'running';
    const argsNode = renderArgs
        ? renderArgs(call.args)
        : h(JSONViewer, { data: call.args, defaultExpandDepth: 1, maxKeys: 50, rootName: 'args' });
    const progressNode = progress
        ? [
            progress.message
                ? h('div', { class: 'wf-toolcall-msg' }, `${progress.message} (${progress.step}/${progress.total})`)
                : null,
            h('div', { class: 'wf-toolcall-bar', role: 'progressbar', 'aria-valuenow': progress.step, 'aria-valuemax': progress.total }, [
                h('div', {
                    class: 'wf-toolcall-bar-fill',
                    style: { width: `${Math.min(100, (progress.step / Math.max(1, progress.total)) * 100)}%` },
                }),
            ]),
        ]
        : null;
    const errorNode = result && !result.ok && result.error
        ? h('div', { class: 'wf-toolcall-error' }, `${result.error.code}: ${result.error.message}`)
        : null;
    return h('div', { class: `wf-toolcall wf-toolcall--${state}` }, [
        h('div', { class: 'wf-toolcall-header' }, [
            h('span', { class: `wf-toolcall-icon wf-toolcall-icon--${state}` }, h(Icon, { name: stateIcon[state] })),
            h('span', { class: 'wf-toolcall-name' }, call.name),
        ]),
        h('div', { class: 'wf-toolcall-body' }, [argsNode, progressNode, errorNode].filter(Boolean)),
    ]);
};
