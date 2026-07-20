/**
 * Avatar — user/image representation.
 *
 * ```tsx
 * <Avatar src="/user.jpg" alt="User" />
 * <Avatar fallback="U" />
 * <AvatarGroup>
 *   <Avatar src="/a.jpg" />
 *   <Avatar src="/b.jpg" />
 * </AvatarGroup>
 * ```
 */
import { cn } from './cn.ts'

export interface AvatarProps {
  src?: string
  alt?: string
  fallback?: string
  size?: 'sm' | 'md' | 'lg'
  class?: string
}

const sizeClasses: Record<string, string> = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
}

export function Avatar(props: AvatarProps) {
  const { src, alt = '', fallback, size = 'md', class: extraClass } = props
  const initials = fallback ?? (alt ? alt.slice(0, 2).toUpperCase() : '?')

  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        class={cn('rounded-full object-cover bg-gray-100', sizeClasses[size], extraClass)}
      />
    )
  }

  return (
    <div class={cn(
      'rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-medium',
      sizeClasses[size],
      extraClass
    )}>
      {initials}
    </div>
  )
}

export interface AvatarGroupProps { children?: any; class?: string }
export function AvatarGroup(props: AvatarGroupProps) {
  return <div class={cn('flex -space-x-2', props.class)}>{props.children}</div>
}
