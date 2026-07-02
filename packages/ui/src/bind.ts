/**
 * bind() — Two-way form binding helper.
 *
 * Creates attribute bindings for common form elements:
 * - text inputs → value + oninput
 * - checkboxes → checked + onchange
 * - textarea → value + oninput
 *
 * ```ts
 * const name = ref('')
 * h('input', bind(name))
 * // Equivalent: h('input', { value: name, oninput: e => name.value = e.target.value })
 *
 * const agree = ref(false)
 * h('input', { type: 'checkbox', ...bind(agree) })
 * // Equivalent: h('input', { type: 'checkbox', checked: agree, onchange: e => agree.value = e.target.checked })
 *
 * const age = ref(0)
 * h('input', { type: 'number', ...bind(age, { number: true }) })
 * // With: parseFloat on input
 *
 * const msg = ref('')
 * h('textarea', bind(msg))
 * ```
 */
import { type Signal } from './signal.ts'

export interface BindOptions {
  /** Parse value as number (for type="number" inputs). */
  number?: boolean
  /** Custom event name (default: 'input' for text, 'change' for checkbox). */
  event?: string
}

type BindAttrs = Record<string, unknown>

/**
 * Create two-way binding attributes for a Signal.
 *
 * Returns an object with value/checked + oninput/onchange that
 * can be spread into h()'s attrs.
 */
export function bind(
  signal: Signal<string>,
  options?: BindOptions & { number?: false },
): BindAttrs
export function bind(
  signal: Signal<number>,
  options: BindOptions & { number: true },
): BindAttrs
export function bind(
  signal: Signal<boolean>,
  options?: BindOptions & { checkbox?: boolean },
): BindAttrs
export function bind(
  signal: Signal<string | number>,
  options?: BindOptions,
): BindAttrs
export function bind(
  signal: Signal<unknown>,
  options?: BindOptions,
): BindAttrs {
  const opts: BindOptions = options ?? {}

  if (typeof signal.value === 'boolean') {
    return {
      checked: signal,
      onchange: (e: Event) => {
        signal.value = (e.target as HTMLInputElement).checked as any
      },
    }
  }

  const eventName = opts.event ?? 'input'

  if (opts.number) {
    return {
      value: signal,
      [eventName === 'input' ? 'oninput' : 'onchange']: (e: Event) => {
        const raw = (e.target as HTMLInputElement).value
        signal.value = raw === '' ? (0 as any) : parseFloat(raw) as any
      },
    }
  }

  return {
    value: signal,
    [eventName === 'input' ? 'oninput' : 'onchange']: (e: Event) => {
      signal.value = (e.target as HTMLInputElement).value as any
    },
  }
}
