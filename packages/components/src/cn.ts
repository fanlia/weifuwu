/**
 * Class name utility — merge class strings, filter falsy values.
 * Accepts strings, signals, or falsy values.
 * Zero dependencies, replaces clsx/classnames.
 */
export function cn(...classes: (string | boolean | null | undefined | { value?: string })[]): string {
  return classes.map(c => c && typeof c === 'object' ? (c as any).value : c).filter(Boolean).join(' ')
}
