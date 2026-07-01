/**
 * cn() — Merge class names, handling conditional and array inputs.
 * Lightweight alternative to clsx + tailwind-merge.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
