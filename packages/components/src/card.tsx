/**
 * Card — content container with optional header/footer.
 *
 * ```tsx
 * <Card>
 *   <CardHeader><CardTitle>标题</CardTitle></CardHeader>
 *   <CardContent>内容</CardContent>
 *   <CardFooter><Button>保存</Button></CardFooter>
 * </Card>
 * ```
 */
import { cn } from './cn.ts'

export interface CardProps { class?: string; children?: any }
export function Card(props: CardProps) {
  return <div class={cn('bg-white rounded-xl border border-gray-200 shadow-sm', props.class)}>{props.children}</div>
}

export interface CardHeaderProps { class?: string; children?: any }
export function CardHeader(props: CardHeaderProps) {
  return <div class={cn('px-6 py-4 border-b border-gray-100', props.class)}>{props.children}</div>
}

export interface CardTitleProps { class?: string; children?: any }
export function CardTitle(props: CardTitleProps) {
  return <h3 class={cn('text-lg font-semibold text-gray-900', props.class)}>{props.children}</h3>
}

export interface CardDescriptionProps { class?: string; children?: any }
export function CardDescription(props: CardDescriptionProps) {
  return <p class={cn('text-sm text-gray-500 mt-1', props.class)}>{props.children}</p>
}

export interface CardContentProps { class?: string; children?: any }
export function CardContent(props: CardContentProps) {
  return <div class={cn('px-6 py-4', props.class)}>{props.children}</div>
}

export interface CardFooterProps { class?: string; children?: any }
export function CardFooter(props: CardFooterProps) {
  return <div class={cn('px-6 py-4 border-t border-gray-100 flex items-center gap-2', props.class)}>{props.children}</div>
}
