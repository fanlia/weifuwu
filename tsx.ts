import { TsxInstance, TsxContext, useCtx, setCtx } from './tsx-instance.ts'
import type { TsxOptions } from './tsx-instance.ts'
import type { Router } from './router.ts'

export { TsxContext, useCtx, setCtx }
export type { TsxOptions }

export async function tsx(options: TsxOptions): Promise<Router> {
  const instance = new TsxInstance(options)
  return instance.build()
}
