import { TsxInstance, TsxContext } from './tsx-instance.ts'
import type { TsxOptions } from './tsx-instance.ts'
import type { Router } from './router.ts'

export { TsxContext }
export type { TsxOptions }

export async function tsx(options: TsxOptions): Promise<Router & { stop: () => void }> {
  const instance = new TsxInstance(options)
  return instance.build()
}
