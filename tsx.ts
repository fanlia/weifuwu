import { TsxInstance, TsxContext, useTsx } from './tsx-instance.ts'
import type { TsxOptions } from './tsx-instance.ts'
import type { Router } from './router.ts'

export { TsxContext, useTsx }
export type { TsxOptions }

export async function tsx(options: TsxOptions): Promise<Router> {
  const instance = new TsxInstance(options)
  return instance.build()
}
